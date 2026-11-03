// The registered-secret store (spec §8.1, R-10, D-036). Every list is split into pieces, a small list
// being one piece, so there is one code path for everyone. Saving is all or nothing: the pieces go
// first under a new generation number, each is read back, and the index goes last. Until the index is
// written, the old list is the list. Reading proves the list is whole, or gives none of it.
//
// The index holds a checksum of the list, so it goes through the password store like a piece does:
// a hash of a short password must never sit on disk in the clear.
import { base64Encode, utf8 } from './forms.js';
export class StoreFull extends Error {
}
const INDEX = 'index';
const pieceName = (generation, i) => `list-${generation}-${i}`;
export const emptyList = (unavailable) => ({ entries: [], unavailable });
const encode = (text) => base64Encode(utf8(text), false);
function decode(text) {
    const raw = atob(text);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++)
        bytes[i] = raw.charCodeAt(i);
    return new TextDecoder().decode(bytes);
}
async function checksumOf(text) {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', utf8(text)));
    return Array.from(digest, b => b.toString(16).padStart(2, '0')).join('');
}
function parseIndex(text) {
    try {
        const i = JSON.parse(decode(text));
        if (i === null || typeof i !== 'object' || i.v !== 1)
            return undefined;
        if (!Number.isInteger(i.generation) || i.generation < 1)
            return undefined;
        if (!Number.isInteger(i.pieces) || i.pieces < 0)
            return undefined;
        if (!Number.isInteger(i.count) || i.count < 0)
            return undefined;
        if (typeof i.checksum !== 'string')
            return undefined;
        return i;
    }
    catch {
        return undefined;
    }
}
function parseEntries(text) {
    try {
        const list = JSON.parse(decode(text));
        if (!Array.isArray(list))
            return undefined;
        const ok = list.every(e => typeof e === 'object' && e !== null && typeof e.value === 'string' && typeof e.label === 'string' && typeof e.added === 'string');
        return ok ? list : undefined;
    }
    catch {
        return undefined;
    }
}
const UNREADABLE = 'the saved secrets could not be read from the password store, which may be locked. They are not being hidden until it can be read.';
const DAMAGED = 'the saved secrets are damaged, so none were loaded. Add them again.';
export async function loadList(b) {
    let has;
    try {
        has = await b.hasList();
    }
    catch {
        // No working store and no way to know of a list: an ordinary machine without one (spec §8.1).
        const status = await statusOf(b);
        return status === 'ok' ? { entries: [] } : emptyList(status);
    }
    if (!has)
        return { entries: [] };
    const status = await statusOf(b);
    if (status !== 'ok')
        return { ...emptyList(status), warning: `the saved secrets could not be read: the password store is ${status}.` };
    try {
        const stored = await b.get(INDEX);
        // A list exists, so an index that reads as absent means the store didn't answer (a locked keyring can look like this).
        if (stored === undefined)
            return { ...emptyList('locked'), warning: UNREADABLE };
        const index = parseIndex(stored);
        if (!index)
            return { entries: [], warning: DAMAGED };
        let text = '';
        for (let i = 0; i < index.pieces; i++) {
            const piece = await b.get(pieceName(index.generation, i));
            if (piece === undefined)
                return { entries: [], warning: 'the saved secrets are incomplete: a piece is missing, so none were loaded. Add them again.' };
            text += piece;
        }
        if ((await checksumOf(text)) !== index.checksum)
            return { entries: [], warning: `the checksum did not match: ${DAMAGED}` };
        const entries = parseEntries(text);
        if (!entries || entries.length !== index.count)
            return { entries: [], warning: DAMAGED };
        return { entries };
    }
    catch {
        return { ...emptyList('locked'), warning: UNREADABLE };
    }
}
async function statusOf(b) {
    try {
        return await b.status();
    }
    catch {
        return 'missing';
    }
}
async function readIndex(b) {
    try {
        const stored = await b.get(INDEX);
        return stored === undefined ? undefined : parseIndex(stored);
    }
    catch {
        return undefined;
    }
}
/** The list's text cut into pieces. Base64 is ASCII, so a character is a byte. */
function cut(text, size) {
    const out = [];
    for (let at = 0; at < text.length; at += size)
        out.push(text.slice(at, at + size));
    return out;
}
/** Clearing is housekeeping: the index has moved on, so a failure here can't harm the list. */
async function clear(b, generation, from, to) {
    for (let i = from; i < to; i++) {
        try {
            await b.del(pieceName(generation, i));
        }
        catch {
            return;
        }
    }
}
/** Pieces a save that died left beyond the last one in use. */
async function clearStrays(b, generation, from) {
    for (let i = from;; i++) {
        try {
            if ((await b.get(pieceName(generation, i))) === undefined)
                return;
            await b.del(pieceName(generation, i));
        }
        catch {
            return;
        }
    }
}
/** The list, for a change to it. Refuses one that can't be read, because a save would replace it. */
export async function loadUsable(b) {
    const loaded = await loadList(b);
    if (loaded.warning)
        throw new Error(loaded.warning);
    if (loaded.unavailable)
        throw new Error(`the password store is ${loaded.unavailable}, so nothing can be saved`);
    return loaded.entries;
}
/** Takes the named values out of the saved list, all or nothing, and says how many went. */
export async function removeEntries(b, values) {
    const entries = await loadUsable(b);
    const gone = new Set(values);
    const kept = entries.filter(e => !gone.has(e.value));
    if (kept.length < entries.length)
        await saveList(b, kept);
    return entries.length - kept.length;
}
export async function saveList(b, entries) {
    const text = encode(JSON.stringify(entries));
    const pieces = cut(text, b.pieceBytes);
    if (pieces.length > b.maxPieces)
        throw new StoreFull(`the list holds ${entries.length} secrets, which is more than this password store can keep`);
    const old = await readIndex(b);
    const generation = (old?.generation ?? 0) + 1;
    for (const [i, piece] of pieces.entries())
        await b.put(pieceName(generation, i), piece);
    for (const [i, piece] of pieces.entries()) {
        if ((await b.get(pieceName(generation, i))) !== piece)
            throw new Error('a saved piece did not read back the same, so the save was abandoned');
    }
    const index = { v: 1, generation, pieces: pieces.length, checksum: await checksumOf(text), count: entries.length };
    if (entries.length > 0)
        await b.markList?.(true);
    await b.put(INDEX, encode(JSON.stringify(index)));
    if (entries.length === 0)
        await b.markList?.(false);
    if (old)
        await clear(b, old.generation, 0, old.pieces);
    await clearStrays(b, generation, pieces.length);
}
