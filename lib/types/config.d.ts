/**
 * Skills Market configuration.
 *
 * The schema below is this plugin's whole configuration surface: DSH validates
 * the profile's plugin row against it and hands `apply()` the resolved value.
 * Every field carries a default, so a row written as `{}` — or an `apply()`
 * called directly from a test — still boots the plugin with the shipped
 * behaviour instead of failing on a missing key.
 *
 * `skillsRoot: null` means "the user skills directory DSH itself scans"
 * (`$DSH_HOME/skills`); a string is an explicit override for tests, for
 * throwaway profiles, or for a deployment that keeps skills outside the harness
 * home.
 */
import z from '@deepseek-ai/schemastery';
export interface SkillsMarketHubConfig {
    /** Absolute skills directory to install into; `null` = the DSH user skills directory. */
    skillsRoot: string | null;
    /** ClawHub base URL (default `https://clawhub.ai`). */
    clawhubBaseUrl: string;
    /** SkillHub base URL (default `https://api.skillhub.cn`). */
    skillhubBaseUrl: string;
    /** Per-request upstream timeout in milliseconds. */
    timeoutMs: number;
    /** Extra upstream attempts after the first failure (network error, 429, 5xx). */
    requestRetries: number;
    /** Whether the uninstall endpoints may remove installed skills at all. */
    allowUninstall: boolean;
    /** Default `limit` for the list endpoint when the request omits one (clamped to 1…100). */
    pageSize: number;
    /** Lifetime of persisted market snapshots in minutes (1…1440). */
    cacheTtlMinutes: number;
}
/**
 * Shipped defaults. Exported so `apply()` can fill in a partially resolved
 * config when the plugin is mounted without going through the schema (unit
 * tests, direct composition), without restating the literals in two places.
 */
export declare const SKILLS_MARKET_HUB_DEFAULTS: SkillsMarketHubConfig;
/**
 * `null` must stay a legal value for `skillsRoot` (it is the "use the DSH
 * default" marker), so the field is modelled as a union rather than a nullable
 * string: a plain `z.string().default('')` would make "unset" and "empty
 * string" indistinguishable and would leak an empty path into `path.join`.
 *
 * Schemastery quirk worth knowing: its object resolver drops a key whose
 * resolved value is nullable and which was absent from the input, so
 * `Config({}).skillsRoot` is `undefined`, not `null`. Both mean "use the DSH
 * default", and {@link resolveConfig} normalizes either to `null` before use.
 */
export declare const Config: z<SkillsMarketHubConfig>;
/** Fill in defaults for a config that did not travel through the schema. */
export declare function resolveConfig(config: Partial<SkillsMarketHubConfig> | undefined): SkillsMarketHubConfig;
//# sourceMappingURL=config.d.ts.map