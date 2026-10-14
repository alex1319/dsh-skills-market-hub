/**
 * SkillHub provider (https://api.skillhub.cn).
 *
 * Endpoints, all verified against captured responses (`tests/fixtures/market/`)
 * and by direct probe:
 *
 *   GET /api/skills?page=&pageSize=&keyword=   → { code, data: { skills[], total }, message }
 *   GET /api/v1/skills/{slug}                  → detail envelope-less object
 *   GET /api/v1/skills/{slug}/files            → { count, files: [{ path, sha256, size }], version }
 *   GET /api/v1/skills/{slug}/file?path=       → raw markdown/text
 *
 * Shape traps this module exists to absorb — every one of them observed in a real
 * response, not imagined:
 *
 *  - **Only the list/search endpoints carry the `{code, data, message}` envelope.**
 *    Detail and file reads answer with the payload directly.
 *  - **`page` must be the parameter name, and `pageSize` the page size.** `limit`
 *    is silently ignored by the upstream.
 *  - **The search parameter is `keyword`.** A `q` parameter is silently ignored,
 *    which would turn every search into an unfiltered browse.
 *  - **`last_synced_at` is null while `updated_at` is a number**, so recency must
 *    come from `updated_at`.
 *  - **`labels.requires_api_key` is the string `"true"`, not a boolean.**
 *  - **`tags` has three shapes depending on the endpoint**: `null` in list,
 *    `string[]` or `null` in search, and an object in detail.
 *  - **The detail response has no `name`, `version`, `downloads`, or `description`**;
 *    it uses `displayName`, `latestVersion.version`, `skill.stats`, `summary`.
 *  - **Security reports are an object map keyed by scanner name**, not an array.
 *  - **There are no repository-wide license fields** in any observed response.
 */
import { type MarketFileMeta, type MarketSource, type NormalizedSkill, type NormalizedSkillDetail, type SecurityReport, type SecurityStatus, type SourceStatusInfo } from './types.ts';
import type { MarketProvider } from './market-service.ts';
export declare const SOURCE: MarketSource;
/** One entry of `data.skills[]`, as far as this provider reads it. */
interface RawListItem {
    slug?: unknown;
    name?: unknown;
    description?: unknown;
    description_zh?: unknown;
    category?: unknown;
    subCategories?: unknown;
    downloads?: unknown;
    installs?: unknown;
    stars?: unknown;
    version?: unknown;
    updated_at?: unknown;
    created_at?: unknown;
    iconUrl?: unknown;
    ownerName?: unknown;
    namespace?: unknown;
    labels?: unknown;
    tags?: unknown;
    verified?: unknown;
    source?: unknown;
    upstream_url?: unknown;
    upstream_owner_login?: unknown;
}
/** One entry of the envelope-less detail response. */
interface RawDetail {
    slug?: unknown;
    contentZhAvailable?: unknown;
    latestVersion?: unknown;
    namespace?: unknown;
    owner?: unknown;
    securityReports?: unknown;
    skill?: unknown;
}
/** `{count, files, version}`. */
interface RawFiles {
    count?: unknown;
    version?: unknown;
    files?: unknown;
}
/**
 * Map the vendor security reports onto the shared vocabulary.
 *
 * The rule that matters: **an unrecognised vendor status is never treated as
 * safe.** Reporting `unknown` for a verdict this plugin has not seen would hide a
 * new scanner verdict behind the same chip as "not scanned"; `flagged` is the
 * honest reading of "someone, somewhere, said something we do not understand".
 */
export declare function mapSecurity(reports: readonly SecurityReport[], verified: boolean | undefined): SecurityStatus;
/** Parse `securityReports`, which is an object map keyed by scanner name. */
export declare function parseSecurityReports(value: unknown): SecurityReport[];
/**
 * Detect a ClawHub mirror.
 *
 * `source === 'clawhub'` plus an `upstream_url` naming the original.
 *
 * The owner is read **by position**, not by taking the second-to-last segment:
 * the URL comes in two shapes and only the owner is in the same place in both.
 *
 *   /{owner}/{slug}            → segments [owner, slug]
 *   /{owner}/skills/{slug}     → segments [owner, 'skills', slug]
 *   /skills/{slug}             → segments ['skills', slug] — no owner at all
 *
 * Dropping a leading `skills` route word is therefore the rule; testing the
 * second-to-last segment against the literal `"skills"` would mistake a
 * legitimate author named `skills` for a route word.
 */
export declare function parseUpstream(source: string | undefined, upstreamUrl: string | undefined, upstreamOwnerLogin: string | undefined): NormalizedSkill['upstream'];
/** Normalize one `data.skills[]` entry. */
export declare function normalizeListItem(raw: RawListItem): NormalizedSkill | null;
/**
 * Normalize the detail response.
 *
 * The traps here are worth restating because they are asymmetric with the list
 * shape: the name is `skill.displayName` (there is no `skill.name`), the version
 * is `latestVersion.version` (there is no `skill.version`), the counts live under
 * `skill.stats`, and the description keywords are `summary` / `summary_zh`.
 */
export declare function normalizeDetail(raw: RawDetail, slug: string, description: string): NormalizedSkillDetail;
/** Normalize the file inventory. */
export declare function normalizeFiles(raw: RawFiles): MarketFileMeta[];
export declare const skillhubProvider: MarketProvider;
/**
 * Drop a YAML frontmatter block from a skill document.
 *
 * The header would otherwise print as literal `name:` / `description:` lines
 * above the prose.
 */
export { stripFrontmatter } from './frontmatter.ts';
/** Health snapshot for this source, filled in by the fetch layer. */
export type { SourceStatusInfo };
//# sourceMappingURL=skillhub-provider.d.ts.map