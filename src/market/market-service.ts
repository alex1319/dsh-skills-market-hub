/**
 * Market aggregation: filters, paging, and the install-state annotation.
 *
 * This module is the one place that decides what a reader sees. Three rules
 * shape it:
 *
 *  - **Install state is recomputed on every request, never cached.** Upstream
 *    data is cacheable because it changes on someone else's schedule; whether a
 *    skill is on *this* disk changes the moment a user installs or deletes one,
 *    and a stale answer either re-downloads a skill the reader already has or
 *    hides one they kept.
 *  - **A slug that cannot become a directory name is not installable**, and the
 *    reason is reported rather than the entry being dropped: hiding it would
 *    look like a bug in the marketplace.
 *  - **Filtering happens before paging.** Paging a filtered list by slicing the
 *    unfiltered one produces pages that are short, or empty, while more matches
 *    exist behind them.
 */

import { cacheKey, type MarketCache, type MarketCacheStats } from './cache.ts'
import { dedupeSkills, sortByDownloads } from './dedupe.ts'
import type { MarketCursor } from './cursor.ts'
import { categoryVocabulary, ensureCategoryVocabulary } from './taxonomy.ts'
import { detectMarketLanguage, MARKET_LIMITS, sanitizeDirName, skillId } from './types.ts'
import type {
  InstallState,
  MarketCategory,
  MarketFileContent,
  MarketFileMeta,
  MarketListResult,
  MarketSource,
  NormalizedSkill,
  NormalizedSkillDetail,
  NotInstallableReason,
  SecurityStatus,
  SourceStatusInfo,
} from './types.ts'

/** What the market layer needs to know about locally installed skills. */
export interface InstalledLookup {
  /** Whether `source:slug` is present locally. */
  has(id: string): boolean
  /** Version and directory of an installed skill, when known. */
  info(id: string): { version?: string; installedAt?: string; dirName: string } | undefined
}

/** A lookup that reports nothing installed (before the first scan completes). */
export const EMPTY_INSTALLED_LOOKUP: InstalledLookup = {
  has: () => false,
  info: () => undefined,
}

let installed: InstalledLookup = EMPTY_INSTALLED_LOOKUP

/** Install the local inventory lookup. Called by the host half after each scan. */
export function setInstalledLookup(next: InstalledLookup): void {
  installed = next
}

/** Restore the empty lookup (unload). */
export function resetInstalledLookup(): void {
  installed = EMPTY_INSTALLED_LOOKUP
}

/** The lookup in force, for callers that need it directly. */
export function installedLookup(): InstalledLookup {
  return installed
}

/**
 * Decide one entry's install state.
 *
 * @param skill - the upstream entry.
 * @returns the state plus, when it is not installable, the reason.
 */
export function annotateInstallState(
  skill: NormalizedSkill,
): { installState: InstallState; notInstallableReason?: NotInstallableReason; installedInfo?: NormalizedSkill['installedInfo'] } {
  const dirName = sanitizeDirName(skill.slug)
  if (dirName === null) {
    return { installState: 'not-installable', notInstallableReason: 'invalid-name' }
  }

  const id = skillId(skill.source, skill.slug)
  if (installed.has(id)) {
    const info = installed.info(id)
    return {
      installState: 'installed',
      installedInfo: {
        dirName: info?.dirName ?? dirName,
        ...(info?.version === undefined ? {} : { version: info.version }),
        ...(info?.installedAt === undefined ? {} : { installedAt: info.installedAt }),
      },
    }
  }

  return { installState: 'installable' }
}

/** Apply {@link annotateInstallState} to a page. */
export function annotatePage(skills: readonly NormalizedSkill[]): NormalizedSkill[] {
  return skills.map((skill) => ({ ...skill, ...annotateInstallState(skill) }))
}

/**
 * Tighten an entry's install state from its file inventory.
 *
 * Called once the file list is known — at detail time, and again immediately
 * before an install. `not-installable` here is a *hard* finding: the skill
 * cannot be written to disk (no `SKILL.md`, too many files, a file over the
 * per-file limit), as opposed to an advisory one.
 */
export function applyFileLimits(
  skill: NormalizedSkill,
  files: readonly MarketFileMeta[],
): NormalizedSkill {
  if (skill.installState === 'installed') return skill

  const hasSkillFile = files.some((file) => file.path.toLowerCase() === 'skill.md')
  if (files.length === 0 || !hasSkillFile) {
    return { ...skill, installState: 'not-installable', notInstallableReason: 'empty-file-list' }
  }
  if (files.length > MARKET_LIMITS.maxFileCount) {
    return { ...skill, installState: 'not-installable', notInstallableReason: 'too-many-files' }
  }
  if (files.some((file) => file.size > MARKET_LIMITS.maxFileSize)) {
    return { ...skill, installState: 'not-installable', notInstallableReason: 'file-too-large' }
  }
  const total = files.reduce((sum, file) => sum + file.size, 0)
  if (total > MARKET_LIMITS.maxTotalSize) {
    return { ...skill, installState: 'not-installable', notInstallableReason: 'too-many-files' }
  }
  return skill
}

// ── Filters ─────────────────────────────────────────────────────────────────

export type SourceFilter = 'all' | MarketSource
export type SecurityFilter = 'all' | SecurityStatus
export type InstalledFilter = 'all' | 'installed' | 'installable'

export interface MarketQuery {
  q?: string
  source: SourceFilter
  security: SecurityFilter
  installed: InstalledFilter
  limit: number
  cursor?: string
  refresh?: boolean
}

/**
 * Case- and width-insensitive match, plus a containment test.
 *
 * `NFKC` folds full-width and compatibility characters so a search for "pdf"
 * matches a name written with full-width letters, and the markdown emphasis many
 * skills put in their `description` (`**Fetch** forecasts`) is stripped before
 * comparison — otherwise searching for the visible word would miss.
 */
function normalizeForSearch(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Whether an entry matches the free-text query. */
function matchesQuery(skill: NormalizedSkill, query: string): boolean {
  // Every whitespace-separated term must appear somewhere; a multi-word query is
  // an AND, which is what readers expect from "weather api".
  const terms = normalizeForSearch(query).split(' ').filter((term) => term !== '')
  if (terms.length === 0) return true
  const haystack = normalizeForSearch([
    skill.name,
    skill.slug,
    skill.summary,
    skill.author.handle,
    skill.author.displayName ?? '',
    skill.tags.join(' '),
  ].join(' '))
  return terms.every((term) => haystack.includes(term))
}

/**
 * Apply every filter.
 *
 * @param skills - the candidate page.
 * @param query - the resolved query.
 * @returns the matching entries, in input order.
 */
export function filterSkills(skills: readonly NormalizedSkill[], query: MarketQuery): NormalizedSkill[] {
  const text = query.q?.trim() ?? ''
  return skills.filter((skill) => {
    if (query.source !== 'all' && skill.source !== query.source) return false
    if (query.security !== 'all' && skill.securityStatus !== query.security) return false
    if (query.installed === 'installed' && skill.installState !== 'installed') return false
    if (query.installed === 'installable' && skill.installState !== 'installable') return false
    if (text !== '' && !matchesQuery(skill, text)) return false
    return true
  })
}

/** One page of a merged, annotated list, plus where to continue. */
export interface MarketPage {
  items: NormalizedSkill[]
  nextCursor: string | null
  total?: number
  sources: Record<MarketSource, SourceStatusInfo>
}

/**
 * Slice one page out of a known-length list.
 *
 * Cursors produced here are `catalog:<offset>` strings; {@link parseOffsetCursor}
 * is the only reader, and it refuses anything else so a client cannot splice a
 * provider cursor into a local page.
 */
export function paginate(
  skills: readonly NormalizedSkill[],
  limit: number,
  cursor: string | undefined,
): { items: NormalizedSkill[]; nextCursor: string | null; total: number } {
  const offset = parseOffsetCursor(cursor)
  const start = Math.max(0, Math.min(offset, skills.length))
  const end = Math.min(start + limit, skills.length)
  const items = skills.slice(start, end)
  return {
    items,
    nextCursor: end < skills.length ? `catalog:${end}` : null,
    total: skills.length,
  }
}

/** Read a `catalog:<offset>` cursor; an absent one means the first page. */
export function parseOffsetCursor(cursor: string | undefined): number {
  if (cursor === undefined || cursor === '') return 0
  const match = /^catalog:(\d+)$/.exec(cursor)
  if (match === null) return 0
  const parsed = Number.parseInt(match[1]!, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

// ── Detail reads ────────────────────────────────────────────────────────────

/** The provider contract the aggregation layer drives. */
export interface MarketProvider {
  readonly source: MarketSource
  /**
   * Whether this registry interprets an `owner` argument as a **pin**.
   *
   * True only where a slug alone does not identify a skill: ClawHub publishes the
   * same slug under many authors, so an `owner` there selects *which* skill is
   * meant, and a resolved author that disagrees is a different skill.
   *
   * False where the account is already part of the address (SkillHub's detail
   * route is `/skills/{slug}` and its account is fixed by the request). There the
   * panel's `owner` is display metadata, the argument is ignored upstream, and
   * comparing it against the resolved author compares two unrelated handles — the
   * listing's account handle against the detail's user handle — which is how a
   * perfectly installable skill gets refused.
   */
  readonly pinsOwner: boolean
  list(params: { cursor?: string; limit: number; signal?: AbortSignal }): Promise<{ items: NormalizedSkill[]; nextCursor?: string; total?: number }>
  search(params: { q: string; cursor?: string; limit: number; signal?: AbortSignal }): Promise<{ items: NormalizedSkill[]; nextCursor?: string; total?: number }>
  detail(slug: string, params: { owner?: string; signal?: AbortSignal }): Promise<NormalizedSkillDetail>
  listFiles(slug: string, params: { version?: string; owner?: string; signal?: AbortSignal }): Promise<MarketFileMeta[]>
  fetchFile(slug: string, params: { path: string; owner?: string; signal?: AbortSignal }): Promise<{ content: string; size: number }>
}

let providers: Partial<Record<MarketSource, MarketProvider>> = {}

/** Install the provider table. Called once from `apply()`. */
export function setProviders(next: Partial<Record<MarketSource, MarketProvider>>): void {
  providers = next
}

let cache: MarketCache | null = null

/** Install the cache instance. Called once from `apply()`. */
export function setMarketCache(next: MarketCache | null): void {
  cache = next
}

/** The cache in force, for callers that need its counters. */
export function marketCache(): MarketCache | null {
  return cache
}

/**
 * Counters behind every "served from cache" claim.
 *
 * A composition without a cache reports a table of zeroes rather than throwing:
 * the diagnostics endpoint answering `0` is the truth — nothing was cached.
 */
export function getMarketStats(instance: MarketCache | null = cache): MarketCacheStats {
  return instance?.stats() ?? {
    hits: 0,
    misses: 0,
    staleServed: 0,
    upstreamRequests: 0,
    forcedRefreshes: 0,
    writes: 0,
    writeFailures: 0,
  }
}

/** One provider by source, or `undefined` when the composition has none. */
export function provider(source: MarketSource): MarketProvider | undefined {
  return providers[source]
}

/** Detail options accepted by the routes. */
export interface DetailOptions {
  /** Bypass the cache — mandatory before an install. */
  force?: boolean
  /** Refuse to answer from a stale snapshot when upstream fails. */
  allowStale?: boolean
  /** Pin the author, for registries whose slugs are shared. */
  owner?: string
  signal?: AbortSignal
}

/**
 * Read one skill's detail through the cache, then annotate it.
 *
 * The annotation runs *after* the cache on purpose: the cached payload is the
 * upstream record, and the local facts are added fresh on every read.
 */
export async function getMarketSkillDetail(
  source: MarketSource,
  slug: string,
  options: DetailOptions = {},
): Promise<NormalizedSkillDetail> {
  const target = providers[source]
  if (target === undefined) {
    throw new Error(`no provider is configured for source ${source}`)
  }

  // Before the provider runs, not after: the classification *keys* arrive on the
  // skill, but their labels come from a separate vocabulary endpoint, and the
  // provider is where a ref is built. A failure here costs labels, never the read.
  await ensureCategoryVocabulary({ ...(options.force === undefined ? {} : { force: options.force }) })

  const key = cacheKey('detail', [source, slug, options.owner])
  const read = await readWithCache<NormalizedSkillDetail>(key, source, options, () => target.detail(slug, {
    ...(options.owner === undefined ? {} : { owner: options.owner }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  }))

  return { ...read.value, ...annotateInstallState(read.value) }
}

/**
 * Read through the cache instance, or go straight to upstream when the
 * composition has no cache (a test harness, or a profile where the cache
 * directory could not be prepared).
 */
async function readWithCache<T>(
  key: string,
  source: MarketSource,
  options: DetailOptions,
  load: () => Promise<T>,
): Promise<{ value: T; fetchedAt: number; fromCache: boolean }> {
  if (cache === null) return { value: await load(), fetchedAt: Date.now(), fromCache: false }
  return cache.readThrough<T>({
    key,
    source,
    ...(options.force === undefined ? {} : { force: options.force }),
    ...(options.allowStale === undefined ? {} : { allowStale: options.allowStale }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    load,
  })
}

/**
 * Read one skill file through the cache.
 *
 * A preview is truncated to the documented limit *after* the cache, so the cached
 * record is the document as upstream served it and a later, larger preview limit
 * does not have to re-fetch everything.
 */
export async function getMarketFileContent(
  source: MarketSource,
  slug: string,
  filePath: string,
  options: DetailOptions = {},
): Promise<MarketFileContent> {
  const target = providers[source]
  if (target === undefined) {
    throw new Error(`no provider is configured for source ${source}`)
  }

  const key = cacheKey('file', [source, slug, filePath, options.owner])
  const read = await readWithCache<{ content: string; size: number }>(key, source, options, () => target.fetchFile(slug, {
    path: filePath,
    ...(options.owner === undefined ? {} : { owner: options.owner }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  }))

  const truncated = Buffer.byteLength(read.value.content, 'utf8') > MARKET_LIMITS.previewTruncateBytes
  return {
    path: filePath,
    content: truncated ? read.value.content.slice(0, MARKET_LIMITS.previewTruncateBytes) : read.value.content,
    language: detectMarketLanguage(filePath),
    size: read.value.size,
    truncated,
  }
}

/** Run every requested source's list or search, and merge the results. */
export async function listMarketSkills(
  query: MarketQuery,
  cursor: MarketCursor,
  status: Record<MarketSource, SourceStatusInfo>,
): Promise<MarketListResult> {
  const requested = query.source === 'all' ? (['clawhub', 'skillhub'] as const) : ([query.source] as const)

  // Awaited *before* the providers run, so the first page a reader ever sees
  // already carries words instead of classification keys. It costs one extra
  // request on a cold start (the vocabulary is then reused for an hour), which is
  // the right trade against a first page that renders `design-media`.
  await ensureCategoryVocabulary({ ...(query.refresh === true ? { force: true } : {}) })

  const pages = await Promise.all(requested.map(async (source) => {
    const target = providers[source]
    if (target === undefined) return { source, items: [] as NormalizedSkill[], nextCursor: undefined as string | undefined }

    // A source missing from the decoded cursor has no further pages: resuming a
    // merged list must not re-request pages the reader already passed.
    const position = cursor[source]
    if (query.cursor !== undefined && position === undefined) {
      return { source, items: [] as NormalizedSkill[], nextCursor: undefined }
    }

    const limit = query.q === undefined ? query.limit : Math.max(query.limit, MARKET_LIMITS.searchResultCap)
    const result = query.q === undefined
      ? await target.list({ ...(position === undefined ? {} : { cursor: position }), limit })
      : await target.search({ q: query.q, ...(position === undefined ? {} : { cursor: position }), limit })

    return { source, items: result.items, nextCursor: result.nextCursor }
  }))

  const merged = sortByDownloads(annotatePage(dedupeSkills(pages.flatMap((page) => page.items))))
  const filtered = filterSkills(merged, query)

  const nextCursor: MarketCursor = {}
  for (const page of pages) {
    if (page.nextCursor !== undefined && page.nextCursor !== '') nextCursor[page.source] = page.nextCursor
  }

  return {
    items: filtered.slice(0, query.limit),
    // The cursor describes where upstream stopped, not where the filtered view
    // ended: the next request re-filters a fresh upstream page.
    nextCursor: Object.keys(nextCursor).length > 0
      ? Buffer.from(JSON.stringify(nextCursor), 'utf8').toString('base64url')
      : null,
    sources: status,
  }
}

/** Sources the plugin can serve, for the status endpoint and the panel's filter bar. */
export function configuredSources(): MarketSource[] {
  return (['clawhub', 'skillhub'] as const).filter((source) => providers[source] !== undefined)
}

/**
 * The classification vocabulary, for the panel's filter bar.
 *
 * Read through the same cache and TTL as the labels on a card, so the dropdown
 * and the chips can never disagree about what the categories are called. An
 * unreachable registry answers with the empty vocabulary this endpoint shipped
 * with, rather than a failure: the filter bar degrades to "no categories known",
 * which is true.
 */
export async function listMarketCategories(): Promise<{ items: MarketCategory[]; status: SourceStatusInfo }> {
  await ensureCategoryVocabulary()
  const items = [...categoryVocabulary().values()].sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key))
  return { items, status: { status: 'ok', fromCache: items.length > 0 } }
}
