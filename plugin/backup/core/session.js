// The Redactor: one piece of text in, the same text with every secret replaced by its
// placeholder out (spec §7 checks 3 to 5, §9, §18). It holds the session's tag table and its
// catches ("once caught, always caught"), and knows nothing about rows or hooks.
//
// redactText, in order:
//   1. mark the placeholders already in the text
//   2. matcher pass: registered and caught secrets, in every written form
//   3. checker pass; each new `hide` value becomes a session catch
//   4. decoder layers: each decoded buffer goes through 2 and 3, hits map back to source spans
//   5. if anything new was caught, the matcher runs again, so an earlier bare copy is hidden
//   6. drop findings wholly inside a placeholder; apply allow, warn and block
//   7. replace the spans
// Everything shares one deadline. Running out is a check failure (`complete: false`): what was
// found stays hidden, and the caller applies `on_check_failure` (spec §12).
import { LABEL_RULE_ID } from '../checker/index.js';
import { decodeLayers, now, sourceSpan } from './decoder.js';
import { formsOf, isBase64Form } from './forms.js';
import { SecretMatcher } from './matcher.js';
import { cleanLabel, findPlaceholders, hintOf, newTag, placeholderText } from './placeholder.js';
export const NO_ALLOW = { values: new Set(), patterns: [] };
const FORM_NAMES = ['plain', 'json-escaped', 'json-escaped-twice', 'json-ascii', 'url', 'url-lower', 'url-plus', 'url-strict', 'binary', 'hex', 'base64-0', 'base64-1', 'base64-2', 'base64url-0', 'base64url-1', 'base64url-2'];
const FORM_INDEX = new Map(FORM_NAMES.map((n, i) => [n, i]));
const MIN_CATCH = 6;
/** A longer value is hidden where it was found, but not remembered: a matcher build can't be interrupted (D-052). */
const MAX_CATCH_VALUE = 8192;
const MAX_VALUE_FOR_PATTERNS = 4096;
/** The host refuses a $.state write over 4,194,304 characters of JSON; this leaves room to spare (D-053). */
const MAX_EXPORT_CHARS = 4_000_000;
const ACTION_RANK = { warn: 0, hide: 1, block: 2 };
/**
 * D-071: a value of letters only that a password label alone found (no format rule did) is hidden where it is
 * found but not remembered. A label can't tell a password from a code word (`password: SecretString`), and
 * remembering the word hides it through the rest of the text and the session. The cost, written in spec §22:
 * a real letters-only password found this way is not hidden when it later appears without its label.
 */
function isPlainWordFromLabel(ruleId, value) {
    return ruleId === LABEL_RULE_ID && /^[A-Za-z]+$/.test(value);
}
/** A value found in a decoded buffer is UTF-8 bytes, one per character: this is how it was written. */
function asWritten(value) {
    if (!/[\x80-\xff]/.test(value) || /[^\x00-\xff]/.test(value))
        return value;
    try {
        return decodeURIComponent(value.replace(/[%\x80-\xff]/g, c => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`));
    }
    catch {
        return value;
    }
}
const isBase64Char = (c) => (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a) || (c >= 0x30 && c <= 0x39) || c === 0x2b || c === 0x2f || c === 0x2d || c === 0x5f;
function buildMatcher(secrets) {
    const words = [];
    secrets.forEach((secret, i) => {
        for (const f of formsOf(secret.value))
            words.push({ text: f.text, owner: i * 32 + FORM_INDEX.get(f.form), exact: f.exact });
    });
    return words.length > 0 ? new SecretMatcher(words) : null;
}
export class Redactor {
    checker;
    hints;
    allow;
    maxCatches;
    maxCatchChars;
    random;
    registered;
    registeredMatcher;
    /** Values marked harmless by the person (spec §11). Held in memory only. */
    harmless = new Set();
    tags = new Map();
    usedTags = new Set();
    catches = new Map();
    catchList = [];
    catchMatcher = null;
    catchesDirty = false;
    catchChars = 0;
    capWarned = false;
    cappedNow = false;
    tooLongWarned = false;
    tooLongNow = false;
    changes = 0;
    constructor(o) {
        this.checker = o.checker;
        this.hints = o.hints;
        this.allow = o.allow;
        this.maxCatches = o.maxCatches ?? 5000;
        this.maxCatchChars = o.maxCatchChars ?? 100_000;
        this.random = o.random ?? (n => crypto.getRandomValues(new Uint8Array(n)));
        for (const e of o.registered)
            if (e.harmless === true)
                this.harmless.add(e.value);
        this.registered = o.registered
            .filter(e => e.value.length > 0 && e.harmless !== true)
            .map(e => ({ value: e.value, label: cleanLabel(e.label), ruleId: 'registered', showHint: true, kind: 'registered', action: 'hide' }));
        this.registeredMatcher = buildMatcher(this.registered);
    }
    /** Goes up each time a new value is caught, so a caller can tell whether a later pass is needed. */
    get version() {
        return this.changes;
    }
    /** Changes when a catch or a tag is added, so a caller knows when `exportCatches()` has something new to keep. */
    get persistVersion() {
        return this.changes + this.tags.size;
    }
    tagFor(value) {
        let tag = this.tags.get(value);
        if (tag === undefined) {
            do
                tag = newTag(this.random);
            while (this.usedTags.has(tag));
            this.tags.set(value, tag);
            this.usedTags.add(tag);
        }
        return tag;
    }
    isAllowed(value) {
        if (this.harmless.has(value))
            return true;
        if (this.allow.values.has(value))
            return true;
        if (this.allow.patterns.length === 0 || value.length > MAX_VALUE_FOR_PATTERNS)
            return false;
        return this.allow.patterns.some(p => p.test(value));
    }
    addCatch(value, label, ruleId, showHint, action) {
        const known = this.catches.get(value);
        if (known) {
            if (ACTION_RANK[action] > ACTION_RANK[known.action])
                known.action = action;
            return;
        }
        if (value.length < MIN_CATCH)
            return;
        if (value.length > MAX_CATCH_VALUE) {
            if (!this.tooLongWarned) {
                this.tooLongWarned = true;
                this.tooLongNow = true;
            }
            return;
        }
        if (this.catches.size >= this.maxCatches || this.catchChars + value.length > this.maxCatchChars) {
            if (!this.capWarned) {
                this.capWarned = true;
                this.cappedNow = true;
            }
            return;
        }
        const secret = { value, label: cleanLabel(label), ruleId, showHint, kind: 'caught', action };
        this.catches.set(value, secret);
        this.catchList.push(secret);
        this.catchChars += value.length;
        this.catchesDirty = true;
        this.changes++;
    }
    /** The value behind a tag, for the person's own commands and the guard. Never logged or shown. */
    valueOfTag(tag) {
        for (const [value, t] of this.tags)
            if (t === tag)
                return value;
        return undefined;
    }
    /**
     * Makes sure a tagged value stays hidden after put-back has written it into a file (spec §10, D-096). True for a
     * registered value or one already caught. Otherwise the value becomes a catch, past D-071's filter, because once it
     * is in the file nothing but the catch list would hide a bare copy of it later. False when it can't be remembered:
     * over 8,192 characters, under 6, or the catch list is full. Then the caller must not restore it.
     */
    keepHidden(tag, label = 'secret') {
        const value = this.valueOfTag(tag);
        if (value === undefined)
            return false;
        if (this.registered.some(r => r.value === value) || this.catches.has(value))
            return true;
        this.addCatch(value, label, 'put-back', false, 'hide');
        return this.catches.has(value);
    }
    /** Marks a tagged value harmless for this session (`/redact allow`). False for a tag this session never made. */
    allowTag(tag) {
        const value = this.valueOfTag(tag);
        if (value === undefined)
            return false;
        this.harmless.add(value);
        const caught = this.catches.get(value);
        if (caught) {
            this.catches.delete(value);
            this.catchList = this.catchList.filter(c => c !== caught);
            this.catchChars -= value.length;
            this.catchesDirty = true;
        }
        if (this.registered.some(r => r.value === value)) {
            this.registered = this.registered.filter(r => r.value !== value);
            this.registeredMatcher = buildMatcher(this.registered);
        }
        this.changes++;
        return true;
    }
    /** Registered and caught values already in the text, in any written form. Catches nothing new (spec §11). */
    findKnown(text, deadline) {
        const res = this.redactText(text, { deadline, recheck: true });
        return { hits: res.hits, complete: res.complete };
    }
    currentCatchMatcher() {
        if (this.catchesDirty) {
            this.catchMatcher = buildMatcher(this.catchList);
            this.catchesDirty = false;
        }
        return this.catchMatcher;
    }
    /**
     * What a restarted worker needs, in one $.state write. Catches come first and are always kept: their
     * caps hold them well under the limit. Tagged values fill the room left, oldest first, so a value left
     * out only loses its tag (D-053).
     */
    exportCatches() {
        const out = [];
        const tagOnly = [];
        let chars = 0;
        for (const [value, tag] of this.tags) {
            if (value.length > MAX_CATCH_VALUE)
                continue;
            const c = this.catches.get(value);
            if (!c) {
                tagOnly.push({ value, tag, label: '', ruleId: '', showHint: true, caught: false });
                continue;
            }
            const entry = { value, tag, label: c.label, ruleId: c.ruleId, showHint: c.showHint, caught: true, action: c.action };
            out.push(entry);
            chars += JSON.stringify(entry).length + 1;
        }
        for (const entry of tagOnly) {
            chars += JSON.stringify(entry).length + 1;
            if (chars > MAX_EXPORT_CHARS)
                break;
            out.push(entry);
        }
        return out;
    }
    importCatches(list) {
        for (const e of list) {
            if (typeof e.value !== 'string' || typeof e.tag !== 'string' || e.value === '')
                continue;
            if (!this.tags.has(e.value) && !this.usedTags.has(e.tag)) {
                this.tags.set(e.value, e.tag);
                this.usedTags.add(e.tag);
            }
            if (e.caught)
                this.addCatch(e.value, e.label, e.ruleId, e.showHint, e.action === 'block' ? 'block' : 'hide');
        }
    }
    matchInto(text, layer, spans) {
        const passes = [
            [this.registeredMatcher, this.registered],
            [this.currentCatchMatcher(), this.catchList],
        ];
        for (const [matcher, secrets] of passes) {
            if (!matcher)
                continue;
            matcher.search(text, (owner, start, end) => {
                const secret = secrets[owner >> 5];
                const form = FORM_NAMES[owner & 31];
                let s = start;
                let e = end;
                if (layer) {
                    ;
                    [s, e] = sourceSpan(layer, start, end);
                }
                else if (isBase64Form(form)) {
                    // The edge characters of a base64 hit carry bits of the bytes around the value.
                    for (let k = 0; k < 2 && s > 0 && isBase64Char(text.charCodeAt(s - 1)); k++)
                        s--;
                    for (let k = 0; k < 2 && e < text.length && (isBase64Char(text.charCodeAt(e)) || text.charCodeAt(e) === 0x3d); k++)
                        e++;
                }
                spans.push({
                    s,
                    e,
                    value: secret.value,
                    label: secret.label,
                    ruleId: secret.ruleId,
                    kind: secret.kind,
                    action: secret.action,
                    hintOk: secret.showHint && layer === null && form === 'plain',
                    encoded: layer !== null || form !== 'plain',
                });
            });
        }
    }
    redactText(text, o) {
        const result = (t, hits, complete, blocked) => ({ text: t, hits, complete, blocked, capped: this.cappedNow, ...(this.tooLongNow ? { tooLong: true } : {}) });
        this.cappedNow = false;
        this.tooLongNow = false;
        if (text === '')
            return result('', [], true, false);
        const spans = [];
        let complete = true;
        const full = o.recheck !== true;
        const scanChecker = (t, layer) => {
            const remaining = o.deadline - now();
            if (remaining <= 0) {
                complete = false;
                return;
            }
            const res = this.checker.scan(t, { budgetMs: remaining, ...(layer === null && o.file !== undefined ? { file: o.file } : {}) });
            if (!res.complete)
                complete = false;
            for (const f of res.findings) {
                const value = layer ? asWritten(t.slice(f.start, f.end)) : t.slice(f.start, f.end);
                if (this.isAllowed(value))
                    continue;
                const [s, e] = layer ? sourceSpan(layer, f.start, f.end) : [f.start, f.end];
                spans.push({ s, e, value, label: cleanLabel(f.label), ruleId: f.ruleId, kind: f.kind, action: f.action, hintOk: f.showHint && layer === null, encoded: layer !== null });
                if (f.action !== 'warn' && !isPlainWordFromLabel(f.ruleId, value))
                    this.addCatch(value, f.label, f.ruleId, f.showHint, f.action);
            }
        };
        const startChanges = this.changes;
        const expired = () => {
            if (now() < o.deadline)
                return false;
            complete = false;
            return true;
        };
        // 2 and 3: the original text.
        this.matchInto(text, null, spans);
        if (full)
            scanChecker(text, null);
        // 4: decoded layers.
        const decoded = decodeLayers(text, { deadline: o.deadline });
        if (!decoded.complete)
            complete = false;
        for (const layer of decoded.layers) {
            if (expired())
                break;
            this.matchInto(layer.text, layer, spans);
            if (full)
                scanChecker(layer.text, layer);
        }
        // 5: something new was caught, so look again with it.
        if (this.changes !== startChanges && !expired()) {
            this.matchInto(text, null, spans);
            for (const layer of decoded.layers) {
                if (expired())
                    break;
                this.matchInto(layer.text, layer, spans);
            }
        }
        // 6 and 7.
        const placeholders = findPlaceholders(text);
        const { text: out, hits, blocked } = this.apply(text, spans, placeholders, o.sources === true);
        return result(out, hits, complete, blocked);
    }
    apply(text, spans, placeholders, sources) {
        const hits = [];
        const seen = new Set();
        const replace = [];
        for (const span of spans) {
            const key = `${span.s}:${span.e}:${span.value}:${span.action}`;
            if (seen.has(key))
                continue;
            seen.add(key);
            // Placeholders: a span wholly inside one is dropped; one that overlaps an edge grows to cover it.
            let s = span.s;
            let e = span.e;
            let inside = false;
            // Sorted and apart, so the first that ends after this span is found by halving.
            let lo = 0;
            let hi = placeholders.length;
            while (lo < hi) {
                const mid = (lo + hi) >> 1;
                if (placeholders[mid][1] <= s)
                    lo = mid + 1;
                else
                    hi = mid;
            }
            for (let k = lo; k < placeholders.length; k++) {
                const [ps, pe] = placeholders[k];
                if (ps >= e)
                    break;
                if (ps <= s && pe >= e) {
                    inside = true;
                    break;
                }
                s = Math.min(s, ps);
                e = Math.max(e, pe);
            }
            if (inside)
                continue;
            if (span.action === 'warn') {
                hits.push({ ruleId: span.ruleId, label: span.label, tag: this.tagFor(span.value), action: 'warn', kind: span.kind });
                continue;
            }
            replace.push({ ...span, s, e });
        }
        replace.sort((a, b) => a.s - b.s || b.e - a.e);
        let out = '';
        let cursor = 0;
        let blocked = false;
        for (let i = 0; i < replace.length;) {
            let end = replace[i].e;
            let primary = replace[i];
            let action = primary.action;
            let j = i + 1;
            for (; j < replace.length && replace[j].s < end; j++) {
                const next = replace[j];
                end = Math.max(end, next.e);
                if (ACTION_RANK[next.action] > ACTION_RANK[action])
                    action = next.action;
                const longer = next.e - next.s > primary.e - primary.s;
                const sameLength = next.e - next.s === primary.e - primary.s;
                if (longer || (sameLength && next.kind === 'registered' && primary.kind !== 'registered'))
                    primary = next;
            }
            const start = replace[i].s;
            const tag = this.tagFor(primary.value);
            const hint = hintOf(primary.value, { on: this.hints, allowed: primary.hintOk && !primary.encoded });
            out += text.slice(cursor, start) + placeholderText(primary.label, hint, tag);
            cursor = end;
            if (action === 'block')
                blocked = true;
            hits.push({ ruleId: primary.ruleId, label: primary.label, tag, action, kind: primary.kind, ...(hint === undefined ? {} : { hint }), ...(sources ? { source: text.slice(start, end), at: start } : {}) });
            i = j;
        }
        out += text.slice(cursor);
        return { text: out, hits, blocked };
    }
}
