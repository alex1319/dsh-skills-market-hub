/**
 * Merge rules for a two-source market.
 *
 * SkillHub mirrors ClawHub skills, so the same skill frequently arrives twice in
 * one page. Showing both is not a neutral choice: the two copies drift (the
 * mirror pipeline lags, and it drops files the original has), so a reader who
 * picks the mirror gets an older revision without being told.
 *
 * The rule is therefore: **the original wins, and the mirror's identity is
 * recorded on it.** The merge only fills fields the original left empty — it
 * never overwrites a value from the authoritative source with one from a copy.
 *
 * Inputs are never mutated: they may be shared with the cache, and a merge that
 * appended to `mirrors` in place would grow that array on every read of the same
 * cached page.
 */
import type { MarketSource, NormalizedSkill } from './types.ts';
/**
 * Collapse mirror duplicates, keeping the original entry.
 *
 * @param skills - one page's worth of entries from every source.
 * @returns the merged page, in the order the first occurrence of each skill was
 *   given. A mirror's position is dropped in favour of the original's.
 */
export declare function dedupeSkills(skills: readonly NormalizedSkill[]): NormalizedSkill[];
/** Order a merged page by popularity, most downloaded first. */
export declare function sortByDownloads(skills: readonly NormalizedSkill[]): NormalizedSkill[];
/** Source order used wherever a page mixes both registries. */
export declare const SOURCE_ORDER: readonly MarketSource[];
//# sourceMappingURL=dedupe.d.ts.map