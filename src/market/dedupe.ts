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

import type { MarketSource, NormalizedSkill } from './types.ts'

/** Download count used for ordering; absent stats sort last. */
function downloads(skill: NormalizedSkill): number {
  return Number.isFinite(skill.stats.downloads) ? skill.stats.downloads : -1
}

/**
 * Whether `mirror` is a copy of `original`.
 *
 * Both halves must agree: the mirror has to name an upstream skill with the same
 * slug, and the authorship has to match when the mirror states one. A slug match
 * alone is not enough — ClawHub slugs are shared across authors, so "same slug,
 * different author" is a different skill that happens to have a popular name.
 */
function isMirrorOf(mirror: NormalizedSkill, original: NormalizedSkill): boolean {
  const upstream = mirror.upstream
  if (upstream === undefined || upstream.source !== original.source) return false
  if (upstream.slug !== original.slug) return false
  if (upstream.owner === undefined) return true
  return upstream.owner === original.author.handle
}

/**
 * Collapse mirror duplicates, keeping the original entry.
 *
 * @param skills - one page's worth of entries from every source.
 * @returns the merged page, in the order the first occurrence of each skill was
 *   given. A mirror's position is dropped in favour of the original's.
 */
export function dedupeSkills(skills: readonly NormalizedSkill[]): NormalizedSkill[] {
  const merged: NormalizedSkill[] = []

  for (const skill of skills) {
    const index = merged.findIndex((candidate) => candidate.id !== skill.id && isMirrorOf(skill, candidate))
    if (index === -1) {
      merged.push({
        ...skill,
        tags: [...skill.tags],
        ...(skill.categories === undefined ? {} : { categories: [...skill.categories] }),
      })
      continue
    }

    const original = merged[index]!
    merged[index] = {
      ...original,
      mirrors: [...(original.mirrors ?? []), skill.id],
      // Only empty fields are filled, and only from the copy: a value the
      // authoritative source already stated is never replaced.
      ...(original.iconUrl === undefined && skill.iconUrl !== undefined ? { iconUrl: skill.iconUrl } : {}),
      ...(original.securityStatus === 'unknown' && skill.securityStatus !== 'unknown'
        ? {
            securityStatus: skill.securityStatus,
            ...(skill.securityReports === undefined ? {} : { securityReports: skill.securityReports }),
          }
        : {}),
      ...(original.tags.length === 0 && skill.tags.length > 0 ? { tags: [...skill.tags] } : {}),
      ...((original.categories ?? []).length === 0 && (skill.categories ?? []).length > 0
        ? { categories: [...skill.categories!] }
        : {}),
    }
  }

  return merged
}

/** Order a merged page by popularity, most downloaded first. */
export function sortByDownloads(skills: readonly NormalizedSkill[]): NormalizedSkill[] {
  // A stable sort keeps each source's own ordering as the tie-break, which is
  // what makes paging through a merged list reproducible.
  return [...skills].sort((a, b) => downloads(b) - downloads(a))
}

/** Source order used wherever a page mixes both registries. */
export const SOURCE_ORDER: readonly MarketSource[] = ['clawhub', 'skillhub']
