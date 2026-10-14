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
export interface MarketCursor {
    clawhub?: string;
    skillhub?: string;
}
/** Encode a cursor for the `nextCursor` field. `null` means "no more pages". */
export declare function encodeCursor(cursor: MarketCursor): string | null;
/**
 * Decode a cursor produced by {@link encodeCursor}.
 *
 * @returns the per-source positions, or `null` when the value is not a cursor
 *   this plugin produced. A malformed cursor is a caller error, and the route
 *   layer turns `null` into a 400 rather than silently starting from page one.
 */
export declare function decodeCursor(raw: string | undefined): MarketCursor | null;
//# sourceMappingURL=cursor.d.ts.map