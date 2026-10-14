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

import {
  detectMarketLanguage,
  MARKET_LIMITS,
  skillId,
  type MarketFileMeta,
  type MarketSource,
  type NormalizedSkill,
  type NormalizedSkillDetail,
  type SecurityReport,
  type SecurityStatus,
  type SourceStatusInfo,
} from './types.ts'
import { providerFetch, providerFetchJson, providerUrl, MarketUpstreamError, UPSTREAM_ERROR_CODES } from './provider-fetch.ts'
import { stripFrontmatter, toSummary } from './frontmatter.ts'
import type { MarketProvider } from './market-service.ts'

export const SOURCE: MarketSource = 'skillhub'

/** Vendor security verdicts that mean "no findings". Anything else is not benign. */
const BENIGN_STATUSES = new Set(['benign', 'safe', 'clean'])

/** Page size cap the upstream tolerates well; also the plugin's own list cap. */
const MAX_PAGE_SIZE = 100

/** Longest `keyword` accepted before the request is refused. */
const MAX_KEYWORD_LENGTH = 200

// ── Response shapes ─────────────────────────────────────────────────────────

/** The `{code, data, message}` envelope the list and search endpoints use. */
interface ListEnvelope {
  code?: unknown
  message?: unknown
  data?: {
    skills?: unknown
    total?: unknown
  }
}

/** One entry of `data.skills[]`, as far as this provider reads it. */
interface RawListItem {
  slug?: unknown
  name?: unknown
  description?: unknown
  description_zh?: unknown
  category?: unknown
  subCategories?: unknown
  downloads?: unknown
  installs?: unknown
  stars?: unknown
  version?: unknown
  updated_at?: unknown
  created_at?: unknown
  iconUrl?: unknown
  ownerName?: unknown
  namespace?: unknown
  labels?: unknown
  tags?: unknown
  verified?: unknown
  source?: unknown
  upstream_url?: unknown
  upstream_owner_login?: unknown
}

/** One entry of the envelope-less detail response. */
interface RawDetail {
  slug?: unknown
  contentZhAvailable?: unknown
  latestVersion?: unknown
  namespace?: unknown
  owner?: unknown
  securityReports?: unknown
  skill?: unknown
}

/** `{count, files, version}`. */
interface RawFiles {
  count?: unknown
  version?: unknown
  files?: unknown
}

// ── Small readers ───────────────────────────────────────────────────────────

function asString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed === '' ? undefined : trimmed
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** `labels.requires_api_key` is the string `"true"`; a real boolean is also accepted. */
function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value
  if (value === 'true') return true
  if (value === 'false') return false
  return undefined
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return undefined
}

/** Read `skillhub.cn/skills/{slug}` — the human page for a skill. */
function pageUrl(slug: string): string {
  return `https://skillhub.cn/skills/${encodeURIComponent(slug)}`
}

/**
 * The author to display.
 *
 * `ownerName` equals `namespace.displayName` and is the name the registry shows;
 * `namespace.handle` is the addressable account (`@handle/slug`). The display
 * name is preferred and the handle is the fallback, because a card that shows the
 * namespace handle instead of the author's name reads as a different author.
 */
function authorOf(raw: RawListItem | undefined, detailNamespace?: Record<string, unknown>): NormalizedSkill['author'] {
  const namespace = asRecord(raw?.namespace) ?? detailNamespace
  const handle = asString(namespace?.handle) ?? asString(raw?.ownerName) ?? 'unknown'
  const displayName = asString(raw?.ownerName) ?? asString(namespace?.displayName)
  return { handle, ...(displayName === undefined ? {} : { displayName }) }
}

/**
 * Map the vendor security reports onto the shared vocabulary.
 *
 * The rule that matters: **an unrecognised vendor status is never treated as
 * safe.** Reporting `unknown` for a verdict this plugin has not seen would hide a
 * new scanner verdict behind the same chip as "not scanned"; `flagged` is the
 * honest reading of "someone, somewhere, said something we do not understand".
 */
export function mapSecurity(reports: readonly SecurityReport[], verified: boolean | undefined): SecurityStatus {
  if (reports.length === 0) return 'unknown'
  const statuses = reports.map((report) => report.status.toLowerCase())
  if (statuses.some((status) => !BENIGN_STATUSES.has(status))) return 'flagged'
  return verified === true ? 'verified' : 'benign'
}

/** Parse `securityReports`, which is an object map keyed by scanner name. */
export function parseSecurityReports(value: unknown): SecurityReport[] {
  const map = asRecord(value)
  if (map === undefined) return []
  const out: SecurityReport[] = []
  for (const [vendor, entry] of Object.entries(map)) {
    const report = asRecord(entry)
    if (report === undefined) continue
    const status = asString(report.status)
    const statusText = asString(report.statusText)
    const reportUrl = asString(report.reportUrl)
    out.push({
      vendor,
      status: status ?? 'unknown',
      statusText: statusText ?? status ?? 'unknown',
      // A signed, expiring URL: it is shown to the reader now and never cached
      // beyond the detail record's own lifetime.
      ...(reportUrl === undefined ? {} : { reportUrl }),
    })
  }
  return out
}

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
export function parseUpstream(
  source: string | undefined,
  upstreamUrl: string | undefined,
  upstreamOwnerLogin: string | undefined,
): NormalizedSkill['upstream'] {
  if (source !== 'clawhub') return undefined
  if (upstreamOwnerLogin !== undefined) {
    // The explicit field is authoritative, but the slug still has to come from a
    // URL this plugin can parse; without one there is nothing to mirror-match on.
    const slug = slugFromUrl(upstreamUrl)
    return slug === undefined ? undefined : { source: 'clawhub', slug, owner: upstreamOwnerLogin }
  }
  if (upstreamUrl === undefined) return undefined

  let parsed: URL
  try {
    parsed = new URL(upstreamUrl)
  } catch {
    return undefined
  }
  const segments = parsed.pathname.split('/').filter((segment) => segment !== '')
  // Normalize the two URL shapes to one token list:
  //   /{owner}/skills/{slug} → [owner, slug]
  //   /{owner}/{slug}        → [owner, slug]
  //   /skills/{slug}         → [slug]   (no owner to report)
  // Both the leading and the inner route word are dropped, because the registry
  // has used both spellings and `skills` is a plausible author name.
  if (segments[0] === 'skills') segments.shift()
  const routeWord = segments.indexOf('skills')
  if (routeWord > 0) segments.splice(routeWord, 1)

  const slug = segments[segments.length - 1]
  if (slug === undefined || slug === '') return undefined
  const owner = segments.length >= 2 ? segments[segments.length - 2] : undefined
  return {
    source: 'clawhub',
    slug,
    ...(owner === undefined ? {} : { owner }),
  }
}

/** Last path segment of an upstream URL, when it parses. */
function slugFromUrl(upstreamUrl: string | undefined): string | undefined {
  if (upstreamUrl === undefined) return undefined
  try {
    const segments = new URL(upstreamUrl).pathname.split('/').filter((segment) => segment !== '')
    return segments[segments.length - 1] ?? undefined
  } catch {
    return undefined
  }
}

/** Read one `tags` value whatever shape the endpoint used. */
function tagsOf(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
  }
  return []
}

// ── Normalization ───────────────────────────────────────────────────────────

/** Normalize one `data.skills[]` entry. */
export function normalizeListItem(raw: RawListItem): NormalizedSkill | null {
  const slug = asString(raw.slug)
  if (slug === undefined) return null

  const summaryZh = asString(raw.description_zh)
  const summary = asString(raw.description)
  const labels = asRecord(raw.labels)
  const upstream = parseUpstream(
    asString(raw.source),
    asString(raw.upstream_url),
    asString(raw.upstream_owner_login),
  )
  const updatedAt = asNumber(raw.updated_at) ?? asNumber(raw.created_at)

  return {
    id: skillId(SOURCE, slug),
    source: SOURCE,
    slug,
    name: asString(raw.name) ?? slug,
    // The Chinese description is the reader-facing text for a Chinese-first UI;
    // the fallback chain keeps an English-only skill readable.
    summary: toSummary(summaryZh ?? summary ?? ''),
    author: authorOf(raw),
    stats: {
      downloads: asNumber(raw.downloads) ?? 0,
      ...(asNumber(raw.installs) === undefined ? {} : { installs: asNumber(raw.installs)! }),
      ...(asNumber(raw.stars) === undefined ? {} : { stars: asNumber(raw.stars)! }),
    },
    tags: tagsOf(raw.tags),
    securityStatus: 'unknown',
    installState: 'installable',
    ...(asNumber(raw.verified) === undefined && asBoolean(raw.verified) === undefined ? {} : { verified: asBoolean(raw.verified) }),
    ...(asString(raw.version) === undefined ? {} : { version: asString(raw.version) }),
    ...(updatedAt === undefined ? {} : { updatedAt }),
    ...(asString(raw.iconUrl) === undefined ? {} : { iconUrl: asString(raw.iconUrl) }),
    ...(upstream === undefined ? {} : { upstream }),
    ...(asBoolean(labels?.requires_api_key) === true ? { requiresApiKey: true } : {}),
  }
}

/**
 * Normalize the detail response.
 *
 * The traps here are worth restating because they are asymmetric with the list
 * shape: the name is `skill.displayName` (there is no `skill.name`), the version
 * is `latestVersion.version` (there is no `skill.version`), the counts live under
 * `skill.stats`, and the description keywords are `summary` / `summary_zh`.
 */
export function normalizeDetail(raw: RawDetail, slug: string, description: string): NormalizedSkillDetail {
  const skill = asRecord(raw.skill) ?? {}
  const latest = asRecord(raw.latestVersion) ?? {}
  const namespace = asRecord(raw.namespace)
  const owner = asRecord(raw.owner)
  const stats = asRecord(skill.stats) ?? {}
  const labels = asRecord(skill.labels)
  const reports = parseSecurityReports(raw.securityReports)
  const verified = asBoolean(skill.verified)
  const updatedAt = asNumber(skill.updatedAt) ?? asNumber(skill.createdAt)

  const authorHandle = asString(owner?.handle) ?? asString(namespace?.handle) ?? 'unknown'
  const authorDisplay = asString(owner?.displayName) ?? asString(namespace?.displayName)

  const summaryZh = asString(skill.summary_zh)
  const summary = asString(skill.summary)
  const changelog = asString(latest.changelog)
  const upstream = parseUpstream(
    asString(skill.source),
    asString(skill.upstream_url),
    asString(skill.upstream_owner_login),
  )

  return {
    id: skillId(SOURCE, slug),
    source: SOURCE,
    slug,
    name: asString(skill.displayName) ?? slug,
    summary: toSummary(summaryZh ?? summary ?? ''),
    author: { handle: authorHandle, ...(authorDisplay === undefined ? {} : { displayName: authorDisplay }) },
    stats: {
      downloads: asNumber(stats.downloads) ?? 0,
      ...(asNumber(stats.installs) === undefined ? {} : { installs: asNumber(stats.installs)! }),
      ...(asNumber(stats.stars) === undefined ? {} : { stars: asNumber(stats.stars)! }),
    },
    tags: tagsOf(skill.tags),
    securityStatus: mapSecurity(reports, verified),
    ...(reports.length === 0 ? {} : { securityReports: reports }),
    installState: 'installable',
    ...(verified === undefined ? {} : { verified }),
    ...(asString(latest.version) === undefined ? {} : { version: asString(latest.version) }),
    ...(updatedAt === undefined ? {} : { updatedAt }),
    ...(asString(skill.iconUrl) === undefined ? {} : { iconUrl: asString(skill.iconUrl) }),
    ...(upstream === undefined ? {} : { upstream }),
    ...(asBoolean(labels?.requires_api_key) === true ? { requiresApiKey: true } : {}),
    description,
    files: [],
    totalSize: 0,
    ...(changelog === undefined ? {} : { changelog: { text: changelog, ...(asString(latest.version) === undefined ? {} : { version: asString(latest.version)! }) } }),
    pageUrl: pageUrl(slug),
  }
}

/** Normalize the file inventory. */
export function normalizeFiles(raw: RawFiles): MarketFileMeta[] {
  const list = Array.isArray(raw.files) ? raw.files : []
  const out: MarketFileMeta[] = []
  for (const entry of list) {
    const file = asRecord(entry)
    if (file === undefined) continue
    const path = asString(file.path)
    if (path === undefined) continue
    const size = asNumber(file.size) ?? 0
    const sha256 = asString(file.sha256)
    out.push({
      path,
      size,
      language: detectMarketLanguage(path),
      tooBig: size > MARKET_LIMITS.maxFileSize,
      // SkillHub's inventory carries no content type; the extension mapping is
      // the only signal, and it lives in `language`.
      ...(sha256 === undefined ? {} : { sha256 }),
    })
  }
  return out
}

// ── Provider ────────────────────────────────────────────────────────────────

/** Unwrap `{code, data, message}`, refusing a non-zero code. */
function unwrapList(value: ListEnvelope, what: string): { skills: unknown[]; total: number } {
  if (value.code !== 0) {
    const message = asString(value.message) ?? 'no message'
    throw new MarketUpstreamError(SOURCE, UPSTREAM_ERROR_CODES.badResponse, `skillhub ${what} failed: code ${String(value.code)} (${message})`)
  }
  const skills = Array.isArray(value.data?.skills) ? value.data.skills : []
  return { skills, total: asNumber(value.data?.total) ?? 0 }
}

export const skillhubProvider: MarketProvider = {
  source: SOURCE,

  // The account is already part of the address (`/api/v1/skills/{slug}` resolves
  // one account's skill) and this registry does not interpret an `owner` argument
  // at all. The panel's `owner` is display metadata here, not a pin.
  pinsOwner: false,

  async list({ cursor, limit, signal }) {
    // The cursor is the next page number: the response carries no page field at
    // all, so the only position a client can express is "how far in I am".
    //
    // Caveat, verified against the raw endpoint: this registry's offset paging
    // overlaps at the page boundary. `page=1&pageSize=3` and `page=2&pageSize=3`
    // share one entry (a shift of one, not a fixed offset). That is upstream
    // behaviour, not something a cursor here can avoid — the provider reports the
    // page as it arrives, and the *client* deduplicates by id so the repeat never
    // reaches the reader as a duplicate card. A caller that needs a strictly
    // disjoint stream has to do the same.
    const page = Math.max(1, Number.parseInt(cursor ?? '1', 10) || 1)
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, limit))

    const { value } = await providerFetchJson<ListEnvelope>(SOURCE, providerUrl(SOURCE, '/api/skills'), {
      query: { page, pageSize },
      ...(signal === undefined ? {} : { signal }),
    })
    const { skills, total } = unwrapList(value, 'list')

    const items = skills
      .map((entry) => normalizeListItem(entry as RawListItem))
      .filter((entry): entry is NormalizedSkill => entry !== null)

    // An empty page in the middle of a large result set means the upstream's own
    // paging is inconsistent; stopping is honest, and the caller still has the
    // entries that did arrive.
    const hasMore = page * pageSize < total && items.length > 0
    return { items, total, ...(hasMore ? { nextCursor: String(page + 1) } : {}) }
  },

  async search({ q, cursor, limit, signal }) {
    const keyword = q.trim().slice(0, MAX_KEYWORD_LENGTH)
    if (keyword === '') return this.list({ ...(cursor === undefined ? {} : { cursor }), limit, ...(signal === undefined ? {} : { signal }) })

    const page = Math.max(1, Number.parseInt(cursor ?? '1', 10) || 1)
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, limit))

    const { value } = await providerFetchJson<ListEnvelope>(SOURCE, providerUrl(SOURCE, '/api/skills'), {
      // `keyword` is the only searched parameter; `q` is ignored upstream.
      query: { page, pageSize, keyword },
      ...(signal === undefined ? {} : { signal }),
    })
    const { skills, total } = unwrapList(value, 'search')

    const items = skills
      .map((entry) => normalizeListItem(entry as RawListItem))
      .filter((entry): entry is NormalizedSkill => entry !== null)

    // Reported as a browse result even if the upstream returned the unfiltered
    // set — but a client-side match check keeps a broken upstream from filling
    // the panel with unrelated entries under a search heading.
    const needle = keyword.toLowerCase()
    const relevant = items.filter((item) => [
      item.name, item.slug, item.summary, item.author.handle, item.tags.join(' '),
    ].join(' ').toLowerCase().includes(needle))

    const hasMore = page * pageSize < total && items.length > 0
    return { items: relevant, total, ...(hasMore ? { nextCursor: String(page + 1) } : {}) }
  },

  async detail(slug, { signal }) {
    const { value } = await providerFetchJson<RawDetail>(
      SOURCE,
      providerUrl(SOURCE, `/api/v1/skills/${encodeURIComponent(slug)}`),
      { ...(signal === undefined ? {} : { signal }) },
    )

    const files = await this.listFiles(slug, { ...(signal === undefined ? {} : { signal }) })
    // The detail body is the skill's own SKILL.md when it has one: `overviewMd`
    // is empty on observed skills, so the file endpoint is the dependable source.
    const skillFile = files.find((file) => file.path.toLowerCase() === 'skill.md')
    let description = asString(asRecord(value.skill)?.overviewMd) ?? ''
    if (description === '' && skillFile !== undefined) {
      description = await this.fetchFile(slug, { path: skillFile.path, ...(signal === undefined ? {} : { signal }) })
        .then((file) => file.content)
        .catch(() => '')
    }

    const normalized = normalizeDetail(value, slug, stripFrontmatter(description))
    const withFiles: NormalizedSkillDetail = {
      ...normalized,
      files,
      totalSize: files.reduce((sum, file) => sum + file.size, 0),
    }
    return withFiles
  },

  async listFiles(slug, { signal }) {
    const { value } = await providerFetchJson<RawFiles>(
      SOURCE,
      providerUrl(SOURCE, `/api/v1/skills/${encodeURIComponent(slug)}/files`),
      { ...(signal === undefined ? {} : { signal }) },
    )
    return normalizeFiles(value)
  },

  async fetchFile(slug, { path: filePath, signal }) {
    const response = await providerFetch(
      SOURCE,
      providerUrl(SOURCE, `/api/v1/skills/${encodeURIComponent(slug)}/file`),
      { query: { path: filePath }, maxBytes: MARKET_LIMITS.maxFileSize, ...(signal === undefined ? {} : { signal }) },
    )
    if (!response.ok) {
      throw new MarketUpstreamError(
        SOURCE,
        response.status === 404 ? UPSTREAM_ERROR_CODES.badResponse : UPSTREAM_ERROR_CODES.error,
        `skillhub answered ${response.status} for ${filePath}`,
      )
    }
    return { content: response.text, size: response.bytes }
  },
}

/**
 * Drop a YAML frontmatter block from a skill document.
 *
 * The header would otherwise print as literal `name:` / `description:` lines
 * above the prose.
 */
export { stripFrontmatter } from './frontmatter.ts'

/** Health snapshot for this source, filled in by the fetch layer. */
export type { SourceStatusInfo }
