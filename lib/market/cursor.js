/**
 * Opaque pagination cursor for a two-source list.
 *
 * Each provider pages differently — ClawHub hands back an opaque JSON string,
 * SkillHub's cursor is "the next page number" — and the merged list needs to
 * remember where *each* source stopped. The cursor therefore carries one slot
 * per source.
 *
 * It is base64url-encoded so a caller cannot mistake it for something it can
 * construct, and so a client that hard-codes a page number cannot accidentally
 * work today and break when a provider changes its paging scheme.
 *
 * A source absent from a decoded cursor is **exhausted**, not "start over":
 * resuming a merged list must never re-request pages the reader already scrolled
 * past, or the list would repeat itself.
 */
/** Encode a cursor for the `nextCursor` field. `null` means "no more pages". */
export function encodeCursor(cursor) {
    const entries = Object.entries(cursor).filter(([, value]) => typeof value === 'string' && value !== '');
    if (entries.length === 0)
        return null;
    const json = JSON.stringify(Object.fromEntries(entries));
    return Buffer.from(json, 'utf8').toString('base64url');
}
/**
 * Decode a cursor produced by {@link encodeCursor}.
 *
 * @returns the per-source positions, or `null` when the value is not a cursor
 *   this plugin produced. A malformed cursor is a caller error, and the route
 *   layer turns `null` into a 400 rather than silently starting from page one.
 */
export function decodeCursor(raw) {
    if (raw === undefined || raw === '')
        return {};
    let json;
    try {
        json = Buffer.from(raw, 'base64url').toString('utf8');
    }
    catch {
        return null;
    }
    let parsed;
    try {
        parsed = JSON.parse(json);
    }
    catch {
        return null;
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
        return null;
    const cursor = {};
    for (const [key, value] of Object.entries(parsed)) {
        if (key !== 'clawhub' && key !== 'skillhub')
            return null;
        if (typeof value !== 'string' || value === '')
            return null;
        cursor[key] = value;
    }
    return cursor;
}
//# sourceMappingURL=cursor.js.map