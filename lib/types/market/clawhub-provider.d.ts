/**
 * ClawHub provider (https://clawhub.ai).
 *
 * Endpoints, all verified against captured responses (`tests/fixtures/market/`)
 * and by direct probe:
 *
 *   GET /api/v1/skills?limit=&sort=downloads[&cursor=]  → { items, nextCursor }
 *   GET /api/v1/search?q=                               → { results }  (no paging)
 *   GET /api/v1/skills/{slug}[?owner=]                  → { skill, latestVersion, owner, moderation }
 *   GET /api/v1/skills/{slug}/versions/{v}[?owner=]     → { version: { license, files[], security } }
 *   GET /api/v1/skills/{slug}/file?path=[&owner=]       → raw text
 *
 * Shape traps this module absorbs — each one observed in a real response:
 *
 *  - **Slugs are not unique.** The registry answers an ambiguous slug with
 *    `409 { code: 'AMBIGUOUS_SKILL_SLUG', matches: [{ ownerHandle }] }`. Without
 *    an owner the request is simply unanswerable, so this provider reports the
 *    candidates instead of guessing one — installing another author's bytes
 *    because their slug was more popular is not a recoverable mistake.
 *  - **`nextCursor` is a JSON string inside a JSON string.** Its inner `key`
 *    array contains values that appear nowhere in the payload, so it has to be
 *    passed back verbatim; it cannot be reconstructed.
 *  - **`tags.latest` is the version string**, not a list of tags. The same key on
 *    a search result's nested skill is a version *id*, which is why this module
 *    never reads tags from search results.
 *  - **Search aggregates other registries.** Results carry `source` and
 *    `install.kind`; entries whose `native` is null are not ClawHub skills and
 *    must not be offered as installable ClawHub slugs.
 *  - **The cursor query parameter is undocumented in the payload.** The list
 *    endpoint is called with `cursor`, which is the only spelling the registry
 *    accepts for the value it hands back.
 */
import { type MarketFileMeta, type MarketSource, type NormalizedSkill, type NormalizedSkillDetail, type SecurityReport, type SecurityStatus } from './types.ts';
import type { MarketProvider } from './market-service.ts';
export declare const SOURCE: MarketSource;
/** Author handles are the registry's own identifier shape. */
export declare const CLAWHUB_OWNER_PATTERN: RegExp;
interface RawListItem {
    ownerHandle?: unknown;
    slug?: unknown;
    displayName?: unknown;
    summary?: unknown;
    topics?: unknown;
    tags?: unknown;
    stats?: unknown;
    createdAt?: unknown;
    updatedAt?: unknown;
    latestVersion?: unknown;
}
interface RawSearchResult {
    slug?: unknown;
    displayName?: unknown;
    summary?: unknown;
    ownerHandle?: unknown;
    owner?: unknown;
    publisher?: unknown;
    downloads?: unknown;
    updatedAt?: unknown;
    metrics?: unknown;
    source?: unknown;
    install?: unknown;
    native?: unknown;
    official?: unknown;
    trust?: unknown;
}
interface RawDetail {
    skill?: unknown;
    latestVersion?: unknown;
    owner?: unknown;
    moderation?: unknown;
}
/**
 * One ClawHub slug resolving to several authors.
 *
 * The route layer reports this as a 409 so the panel can ask which author the
 * reader meant, rather than silently picking the most downloaded one.
 */
export declare class AmbiguousSkillSlugError extends Error {
    readonly slug: string;
    /** Author handles that publish this slug, most downloaded first. */
    readonly owners: readonly string[];
    constructor(slug: string, 
    /** Author handles that publish this slug, most downloaded first. */
    owners: readonly string[]);
}
/** Whether a search result is a native ClawHub skill rather than an aggregated one. */
export declare function isNativeSearchResult(raw: RawSearchResult): boolean;
/** Normalize one `/api/v1/skills` list entry. */
export declare function normalizeListItem(raw: RawListItem): NormalizedSkill | null;
/** Normalize one `/api/v1/search` result. */
export declare function normalizeSearchResult(raw: RawSearchResult): NormalizedSkill | null;
/**
 * Map a ClawHub version's security block onto the shared vocabulary.
 *
 * The three scanners the registry publishes (VirusTotal, SkillSpector, and an LLM
 * review) each become a report row.
 *
 * Ordering matters here. A scanner finding is evaluated **before** the block's own
 * `status` field, because the two can disagree: a block that calls itself
 * `benign` while one of its scanners returned a verdict this plugin does not
 * recognise is exactly the case where a naive "declared status wins" reading
 * would put a green chip on an unscanned-by-us skill.
 *
 * An unrecognised verdict is `flagged`, never `unknown`: `unknown` is the panel's
 * word for "not scanned", and a scanner that said something unintelligible is not
 * the same thing.
 */
export declare function parseClawhubSecurity(security: unknown): {
    status: SecurityStatus;
    reports: SecurityReport[];
};
/** Normalize the detail response. */
export declare function normalizeDetail(raw: RawDetail, slug: string, requestedOwner: string | undefined): NormalizedSkillDetail;
/** Normalize a version's file inventory. */
export declare function normalizeFiles(files: unknown): MarketFileMeta[];
export declare const clawhubProvider: MarketProvider;
export {};
//# sourceMappingURL=clawhub-provider.d.ts.map