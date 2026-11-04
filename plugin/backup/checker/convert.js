// A raw rule (Gitleaks' fields, or a custom rule from settings) to a compiled rule,
// or a rejection with a reason. Used at build time for the Gitleaks file and at run
// time for custom rules. Rejections name the rule and a reason, never the pattern.
import { analyze, CAP, dropLeading } from './re/analyze.js';
import { emit } from './re/emit.js';
import { parse, RegexError } from './re/parse.js';
/**
 * A pattern whose worst case from one start position is above this is refused (R-15).
 * The limit for the built-in rules assumes starts are rare; each of them also has a
 * timed worst-case test, and a reviewer read it.
 */
export const COST_REJECT = 50_000_000;
/**
 * The limits for custom patterns, which nobody reviewed and which can start anywhere.
 * A regex call can't be interrupted, so the worst case on one piece of text (65,536
 * starts) must stay well under a second: the worst input tried at this limit took
 * about 280 ms per piece under Node. An open repeat stops at CUSTOM_CAP, and two
 * overlapping ranges of about 50 each are the most the cost limit allows.
 */
export const COST_REJECT_CUSTOM = 3_000;
export const CUSTOM_CAP = 2048;
/** Source patterns rewritten by hand, keyed by the exact upstream text. */
const FIXES = new Map([
    // Upstream's "(?i)^true|false|null$" is unanchored in the middle, so any value holding "false" was skipped.
    ['(?i)^true|false|null$', '(?i)^(?:true|false|null)$'],
]);
const AFTER_CURL = { word: 'curl', within: 1000 };
const CURL_WHY = 'upstream nests repeats around "." to span up to 5 lines; the match now starts at the flag, and "curl" is looked for in the 1000 characters before it';
const CURL_PREFIX_LAZY = '\\bcurl\\b(?:.*?|.*?(?:[\\r\\n]{1,2}.*?){1,5})';
const CURL_PREFIX_GREEDY = '\\bcurl\\b(?:.*|.*(?:[\\r\\n]{1,2}.*){1,5})';
export const REWRITES = new Map([
    [
        'curl-auth-header',
        // Starting at the flag means a repeated "curl" never rescans the text after it.
        { why: CURL_WHY, replace: [CURL_PREFIX_LAZY, ''], keywords: ['-h'], requiresBefore: AFTER_CURL },
    ],
    [
        'curl-auth-user',
        { why: CURL_WHY, replace: [CURL_PREFIX_GREEDY, ''], keywords: ['-u'], requiresBefore: AFTER_CURL },
    ],
    [
        'sourcegraph-access-token',
        { why: 'upstream also matches any 40 hex characters, which is every git hash and leaves no keyword; the sgp_ forms are kept', replace: ['|sgp_[a-fA-F0-9]{40}|[a-fA-F0-9]{40})', '|sgp_[a-fA-F0-9]{40})'] },
    ],
    [
        'aws-access-token',
        // D-104: a random key falls under the floor about 1 time in 2,000; the leak kit's AWS fake did on CI.
        { why: 'upstream skips a match with entropy of 3 or less, which drops about 1 in 2,000 random keys; a fixed prefix and exactly 16 base32 characters are specific enough without it, and the EXAMPLE allowlist stays', entropy: 'none' },
    ],
]);
export const labelOf = (id) => id.replace(/[^A-Za-z0-9]+/g, '_').toUpperCase();
export function toSpec(source) {
    const tree = parse(FIXES.get(source) ?? source);
    const e = emit(tree.node, {});
    new RegExp(e.source, e.flags); // throws if the engine refuses it
    return { source: e.source, flags: e.flags };
}
function convertAllow(a, warnings, id) {
    const and = (a.condition ?? 'OR').toUpperCase() === 'AND';
    // Path conditions are dropped on purpose: a file the model would read must still be checked.
    if (and && (a.paths?.length ?? 0) > 0)
        return null;
    const regexes = [];
    for (const r of a.regexes ?? []) {
        try {
            regexes.push(toSpec(r));
        }
        catch (e) {
            // Dropping an excuse can only hide more, never less.
            warnings.push(`${id}: an allowlist pattern was dropped (${e instanceof RegexError ? e.message : 'engine refused it'})`);
        }
    }
    const stopwords = (a.stopwords ?? []).map(s => s.toLowerCase());
    if (regexes.length === 0 && stopwords.length === 0)
        return null;
    const target = a.regexTarget === 'match' || a.regexTarget === 'line' ? a.regexTarget : 'secret';
    return { target, regexes, stopwords, and };
}
/** The pattern text the checker really parses: upstream's, after any hand fix or rewrite. */
export function ruleSource(raw) {
    if (raw.regex === undefined)
        return null;
    let text = FIXES.get(raw.regex) ?? raw.regex;
    const rewrite = REWRITES.get(raw.id);
    if (rewrite?.replace && text.includes(rewrite.replace[0]))
        text = text.replace(rewrite.replace[0], () => rewrite.replace[1]);
    return text;
}
export function convertRule(raw, costLimit = COST_REJECT, baseCap = CAP) {
    const reject = (reason) => ({ rejection: { id: raw.id, reason } });
    if (raw.regex === undefined)
        return reject('matches a file name, not text');
    const rewrite = REWRITES.get(raw.id);
    let sourceText = FIXES.get(raw.regex) ?? raw.regex;
    if (rewrite?.replace) {
        if (!sourceText.includes(rewrite.replace[0]))
            return reject('the upstream pattern changed; its hand rewrite no longer applies');
        sourceText = sourceText.replace(rewrite.replace[0], () => rewrite.replace[1]);
    }
    const cap = rewrite?.cap ?? baseCap;
    let tree;
    try {
        tree = parse(sourceText);
    }
    catch (e) {
        return reject(`unsupported syntax: ${e instanceof RegexError ? e.message : 'unreadable'}`);
    }
    const full = analyze(tree.node, cap);
    if (full.keywords === null || Math.min(...full.keywords.map(k => k.length)) < 2)
        return reject('no literal that every match must contain');
    const leading = full.leading;
    const body = leading ? dropLeading(tree.node) : tree.node;
    const a = leading ? analyze(body, cap) : full;
    if (a.nestedVariable)
        return reject('a repeat with a range of counts around a variable-length part');
    if (a.cost > costLimit)
        return reject(`worst-case work per start position is too high (${a.cost >= 1e12 ? 'over 1e12' : a.cost})`);
    if (a.minLen === 0 && a.maxLen === 0)
        return reject('can match nothing');
    if (raw.secretGroup !== undefined && raw.secretGroup > tree.groups)
        return reject('secret group is not in the pattern');
    const e = emit(body, { cap });
    try {
        new RegExp(e.source, e.flags);
    }
    catch {
        return reject('the regex engine refused the converted pattern');
    }
    const warnings = [];
    let path;
    if (raw.path !== undefined) {
        try {
            path = toSpec(raw.path);
        }
        catch {
            return reject('the file-path condition could not be converted');
        }
    }
    const rule = {
        id: raw.id,
        label: labelOf(raw.id),
        source: e.source,
        flags: e.flags,
        secretGroup: raw.secretGroup ?? 0,
        keywords: [...(rewrite?.keywords ?? full.keywords)].sort(),
        area: Math.min(a.maxLen, cap * 2) + (leading?.max ?? 0),
        spansLines: a.spansLines,
        allow: (raw.allowlists ?? []).map(x => convertAllow(x, warnings, raw.id)).filter((x) => x !== null),
    };
    if (raw.entropy !== undefined && raw.entropy !== 0 && rewrite?.entropy !== 'none')
        rule.entropy = raw.entropy;
    if (rewrite?.requiresBefore)
        rule.requiresBefore = rewrite.requiresBefore;
    if (path)
        rule.path = path;
    if (leading) {
        const set = emit(leading.node, {});
        rule.leadingContext = { max: leading.max, set: { source: set.source, flags: set.flags } };
        // The dropped part follows the pattern's case rule: with the i flag it matches both cases.
    }
    return { rule, warnings };
}
/** Compares derived keywords with Gitleaks' own, for the build report. */
export function keywordNote(derived, theirs) {
    if (!theirs || theirs.length === 0)
        return 'none upstream';
    const a = [...derived].sort().join('\n');
    const b = theirs.map(s => s.toLowerCase()).sort().join('\n');
    if (a === b)
        return 'same';
    const moreSpecific = derived.every(d => theirs.some(t => d.includes(t.toLowerCase())));
    if (moreSpecific)
        return 'derived longer';
    const covered = theirs.every(t => derived.some(d => d.includes(t.toLowerCase()) || t.toLowerCase().includes(d)));
    return covered ? 'overlapping' : 'upstream keyword not in the pattern';
}
/** A custom rule from settings (spec check 6). The keyword must be required by the pattern. */
export function convertCustom(input) {
    const result = convertRule({ id: input.id, regex: input.pattern }, COST_REJECT_CUSTOM, CUSTOM_CAP);
    if ('rejection' in result)
        return result;
    const keyword = input.keyword.toLowerCase();
    if (keyword.length < 2)
        return { rejection: { id: input.id, reason: 'the keyword is too short' } };
    if (!result.rule.keywords.every(k => k.includes(keyword))) {
        return { rejection: { id: input.id, reason: 'the keyword is not required by the pattern: a match could lack it' } };
    }
    return { rule: { ...result.rule, label: input.label, keywords: [keyword] }, warnings: result.warnings };
}
/**
 * An `allow` pattern from settings (spec §14). It is tried against a hidden value only, never
 * over open text, but a regex call can't be interrupted, so it gets the same cost limit as a
 * custom rule. It needs no keyword. Returns the JS form to run, or the reason it was refused.
 */
export function convertAllowPattern(pattern) {
    let tree;
    try {
        tree = parse(pattern);
    }
    catch (e) {
        return { reason: `unsupported syntax: ${e instanceof RegexError ? e.message : 'unreadable'}` };
    }
    const a = analyze(tree.node, CUSTOM_CAP);
    if (a.nestedVariable)
        return { reason: 'a repeat with a range of counts around a variable-length part' };
    if (a.cost > COST_REJECT_CUSTOM)
        return { reason: `worst-case work per start position is too high (${a.cost >= 1e12 ? 'over 1e12' : a.cost})` };
    const e = emit(tree.node, { cap: CUSTOM_CAP });
    try {
        new RegExp(e.source, e.flags);
    }
    catch {
        return { reason: 'the regex engine refused the converted pattern' };
    }
    return { source: e.source, flags: e.flags };
}
