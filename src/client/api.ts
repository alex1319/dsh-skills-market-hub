/**
 * Skills Market HTTP client (browser half).
 *
 * Every request goes to the host surface documented in `docs/CONTRACT.md`: one
 * prefix route under `/api/skills-market-hub`, JSON in and JSON out, errors
 * always shaped `{ error: { code, message } }`.
 *
 * Client purity: this module imports *types only* from the shared wire layer —
 * never a value from the host's `src/market/*`, which would drag Node code into
 * the browser bundle. The route prefix is likewise restated as a literal rather
 * than imported; `scripts/verify.mjs` asserts the two spellings agree.
 */

/** Host route prefix. Restated on purpose: the host module is Node code. */
export const API_BASE = '/api/skills-market-hub'

/** Registry identifiers, mirroring the host's `MarketSource`. */
export type MarketSource = 'clawhub' | 'skillhub'
export type SecurityStatus = 'verified' | 'benign' | 'unknown' | 'flagged'
export type InstallState = 'installed' | 'installable' | 'not-installable'
export type SourceHealthStatus = 'ok' | 'degraded' | 'failed' | 'cached'

export interface SecurityReport {
  vendor: string
  status: string
  statusText: string
  reportUrl?: string
  summary?: string
}

/**
 * One classification chip.
 *
 * Both labels travel rather than one pre-chosen string, so the panel renders in
 * whichever language the shell is using without the host cache having to know
 * which one that is. `key` is the registry's stable identifier and is the last
 * resort for display — see `categoryLabelText` in `ui.tsx`.
 */
export interface CategoryRef {
  key: string
  labelZh?: string
  labelEn?: string
}

export interface NormalizedSkill {
  id: string
  source: MarketSource
  slug: string
  name: string
  summary: string
  author: { handle: string; displayName?: string; avatarUrl?: string }
  stats: { downloads: number; installs?: number; stars?: number }
  tags: string[]
  categories?: CategoryRef[]
  version?: string
  updatedAt?: number
  iconUrl?: string
  securityStatus: SecurityStatus
  securityReports?: SecurityReport[]
  requiresApiKey?: boolean
  verified?: boolean
  upstream?: { source: MarketSource; slug: string; owner?: string }
  mirrors?: string[]
  installState: InstallState
  notInstallableReason?: string
  installedInfo?: { version?: string; installedAt?: string; dirName: string }
}

export interface MarketFileMeta {
  path: string
  size: number
  sha256?: string
  contentType?: string
  language: string
  tooBig: boolean
}

export interface NormalizedSkillDetail extends NormalizedSkill {
  description: string
  descriptionFrontmatter?: Record<string, unknown>
  license?: string
  files: MarketFileMeta[]
  totalSize: number
  changelog?: { version?: string; text: string; publishedAt?: number }
  pageUrl?: string
}

export interface MarketFileContent {
  path: string
  content: string
  language: string
  size: number
  truncated: boolean
}

export interface SourceStatusInfo {
  status: SourceHealthStatus
  fetchedAt?: number
  fromCache?: boolean
  error?: string
}

export interface MarketListResult {
  items: NormalizedSkill[]
  nextCursor: string | null
  total?: number
  sources: Record<MarketSource, SourceStatusInfo>
}

/**
 * One shelf of the Discover page.
 *
 * `metric` names the figure the host ranked by, so the panel prints the number
 * the ranking is actually about: a shelf ranked by installs that showed downloads
 * would be a claim the host never made.
 */
export type DiscoverCollectionId = 'featured' | 'trending' | 'official' | 'newest' | 'installs'

export type DiscoverMetric = 'downloads' | 'installs' | 'stars' | 'updatedAt'

export interface DiscoverCollection {
  id: DiscoverCollectionId
  metric: DiscoverMetric
  items: NormalizedSkill[]
}

export interface DiscoverResult {
  collections: DiscoverCollection[]
  sources: Record<MarketSource, SourceStatusInfo>
}

/** One classification in a registry's published vocabulary. */
export interface MarketCategory {
  key: string
  /** Chinese label; empty when the registry publishes none. */
  name: string
  /** English label, when the registry publishes one. */
  nameEn?: string
  sortOrder: number
  parent?: string
  level: number
}

/**
 * One installed entry.
 *
 * Declared here rather than imported from the host: that module reads the
 * filesystem through `node:fs`, so importing it would drag Node code into the
 * browser program. The client only ever *reads* this shape out of JSON.
 */
export interface InstalledSkillRecord {
  key: string
  linked: boolean
  removable: boolean
  id: string
  source: MarketSource | 'local'
  slug: string
  owner?: string
  name: string
  dirName: string
  dirPath: string
  version?: string
  summary?: string
  installedAt?: string
  managed: boolean
  bytes: number
  fileCount: number
}

export interface InstalledFileEntry {
  path: string
  size: number
  language: string
}

export interface InstalledSkillDetail {
  item: InstalledSkillRecord
  markdown: string
  frontmatter: string | null
  files: InstalledFileEntry[]
}

/** List query accepted by `GET /skills`. */
export interface MarketQuery {
  q?: string
  source: 'all' | MarketSource
  security: 'all' | SecurityStatus
  installed: 'all' | 'installed' | 'installable'
  limit?: number
  cursor?: string
}

/** One failure from the Skills Market surface (transport, HTTP, or malformed body). */
export class SkillsMarketHubApiError extends Error {
  /** Host error code (`MARKET_*`, `BAD_REQUEST`, …) or a client-side code. */
  readonly code: string
  /** HTTP status; `0` when the request never reached the host. */
  readonly status: number

  constructor(code: string, status: number, message: string) {
    super(message)
    this.name = 'SkillsMarketHubApiError'
    this.code = code
    this.status = status
  }
}

/** Client-side code for a request that never reached the host (offline, DNS, CORS). */
const NETWORK_ERROR_CODE = 'NETWORK_ERROR'
/** Code for a successful response whose body is not the promised JSON. */
const BAD_RESPONSE_CODE = 'MARKET_UPSTREAM_BAD_RESPONSE'

/**
 * Whether a rejection is an aborted request.
 *
 * `AbortError` is control flow, not a failure: the controller aborts superseded
 * requests on purpose, and surfacing one as a user-facing error would put a
 * spurious banner in front of a perfectly healthy panel. Checked by `name` (not
 * `instanceof`) because an abort may cross realms (iframes, workers).
 */
export function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError'
}

/** `fetch` wrapper turning every failure mode into either an abort or an API error. */
async function send(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init)
  } catch (error) {
    if (isAbortError(error)) throw error
    throw new SkillsMarketHubApiError(NETWORK_ERROR_CODE, 0, error instanceof Error ? error.message : String(error))
  }
}

/** Parse the host's `{ error: { code, message } }` envelope, degrading to the status line. */
async function toApiError(response: Response): Promise<SkillsMarketHubApiError> {
  let code = `HTTP_${response.status}`
  let message = `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`
  try {
    const payload = (await response.json()) as { error?: { code?: unknown; message?: unknown } }
    const envelope = payload?.error
    if (envelope && typeof envelope.code === 'string' && envelope.code !== '') code = envelope.code
    if (envelope && typeof envelope.message === 'string' && envelope.message !== '') message = envelope.message
  } catch {
    // A non-JSON error body (proxy page, truncated stream): the status line is the best available text.
  }
  return new SkillsMarketHubApiError(code, response.status, message)
}

/** Decode a successful JSON body, mapping a malformed one onto the bad-response code. */
async function toJson<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T
  } catch {
    throw new SkillsMarketHubApiError(BAD_RESPONSE_CODE, response.status, 'The Skills Market returned a response that is not valid JSON')
  }
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  // `same-origin` credentials: the panel is served by the host itself, and the
  // connection gate (when present) authenticates through the session cookie.
  const response = await send(`${API_BASE}${path}`, {
    method: 'GET',
    credentials: 'same-origin',
    headers: { accept: 'application/json' },
    ...(signal === undefined ? {} : { signal }),
  })
  if (!response.ok) throw await toApiError(response)
  return toJson<T>(response)
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await send(`${API_BASE}${path}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw await toApiError(response)
  return toJson<T>(response)
}

/** Split a `source:slug` skill id, rejecting anything the host routes cannot address. */
function parseMarketId(id: string): { source: MarketSource; slug: string } {
  const separator = id.indexOf(':')
  const source = separator > 0 ? id.slice(0, separator) : ''
  const slug = separator > 0 ? id.slice(separator + 1) : ''
  if ((source === 'clawhub' || source === 'skillhub') && slug !== '') return { source, slug }
  throw new SkillsMarketHubApiError(
    'BAD_REQUEST',
    400,
    `"${id}" is not a market skill id (expected "<source>:<slug>")`,
  )
}

/** Search the registries — the market list page. */
export async function fetchMarketList(
  query: MarketQuery,
  signal?: AbortSignal,
  options: { refresh?: boolean } = {},
): Promise<MarketListResult> {
  const search = new URLSearchParams()
  const q = query.q?.trim()
  if (q) search.set('q', q)
  // `all` is the route's default; omitting it keeps the URL (and cache keys) canonical.
  if (query.source !== 'all') search.set('source', query.source)
  if (query.security !== 'all') search.set('security', query.security)
  if (query.installed !== 'all') search.set('installed', query.installed)
  if (query.cursor !== undefined && query.cursor !== '') search.set('cursor', query.cursor)
  if (typeof query.limit === 'number' && Number.isFinite(query.limit)) search.set('limit', String(query.limit))
  // A reader-requested refresh has to reach the host: without the flag the request
  // is indistinguishable from an automatic one and comes back cached.
  if (options.refresh === true) search.set('refresh', '1')
  const suffix = search.toString()
  return getJson<MarketListResult>(`/skills${suffix === '' ? '' : `?${suffix}`}`, signal)
}

/** One skill's full detail plus the health of the source that served it. */
export async function fetchSkillDetail(
  id: string,
  signal?: AbortSignal,
  options: { refresh?: boolean; owner?: string } = {},
): Promise<{ skill: NormalizedSkillDetail; sourceStatus: SourceStatusInfo }> {
  const { source, slug } = parseMarketId(id)
  const search = new URLSearchParams()
  if (options.refresh === true) search.set('refresh', '1')
  // ClawHub slugs are shared across authors: name the one the card showed.
  if (options.owner) search.set('owner', options.owner)
  const suffix = search.size > 0 ? `?${search.toString()}` : ''
  return getJson(`/skills/${source}/${encodeURIComponent(slug)}${suffix}`, signal)
}

/** One file of a market skill, for the Files tab. */
export async function fetchSkillFile(
  id: string,
  path: string,
  signal?: AbortSignal,
  owner?: string,
): Promise<MarketFileContent> {
  const { source, slug } = parseMarketId(id)
  const ownerParam = owner ? `&owner=${encodeURIComponent(owner)}` : ''
  const payload = await getJson<{ file: MarketFileContent }>(
    `/skills/${source}/${encodeURIComponent(slug)}/file?path=${encodeURIComponent(path)}${ownerParam}`,
    signal,
  )
  return payload.file
}

/** Health of every market source, refreshed independently of the list. */
export async function fetchSourceStatus(signal?: AbortSignal): Promise<Record<MarketSource, SourceStatusInfo>> {
  const payload = await getJson<{ sources: Record<MarketSource, SourceStatusInfo> }>('/status', signal)
  return payload.sources
}

/** The registries' classification vocabulary, for labelling cards and the filter bar. */
export async function fetchCategories(signal?: AbortSignal): Promise<MarketCategory[]> {
  const payload = await getJson<{ items: MarketCategory[]; status: SourceStatusInfo }>('/categories', signal)
  return payload.items
}

/**
 * The Discover page: five ranked shelves, each already capped and annotated.
 *
 * The only parameter is `refresh`, and that is the contract rather than an
 * omission: how deep a shelf goes and how the two registries are merged are
 * properties of the ranking, which lives on the host. The panel renders what it is
 * given — but it does have to be able to say "not from your cache", because the
 * host caches the three upstream pages behind this endpoint, and a refresh button
 * that quietly returned the same shelves would be lying.
 */
export function fetchDiscover(
  signal?: AbortSignal,
  options: { refresh?: boolean } = {},
): Promise<DiscoverResult> {
  const suffix = options.refresh === true ? '?refresh=1' : ''
  return getJson<DiscoverResult>(`/discover${suffix}`, signal)
}

/**
 * Every skill DSH can currently see, including directories this plugin did not
 * install (`managed: false`). This is the local index behind the "installed"
 * filter — no upstream request is involved.
 */
export async function fetchInstalled(signal?: AbortSignal): Promise<InstalledSkillRecord[]> {
  const payload = await getJson<{ items: InstalledSkillRecord[] }>('/installed', signal)
  return payload.items
}

/** Install a market skill into the local skills directory. */
export async function installSkill(id: string, owner?: string): Promise<{ installedPath: string; skill: NormalizedSkill }> {
  const payload = await postJson<{ ok: boolean; installedPath: string; skill: NormalizedSkill }>(
    '/install',
    owner ? { id, owner } : { id },
  )
  return { installedPath: payload.installedPath, skill: payload.skill }
}

/** Remove a skill this plugin installed (the host refuses unmanaged directories). */
export async function uninstallSkill(id: string): Promise<{ removedPath: string; skill: NormalizedSkill }> {
  const payload = await postJson<{ ok: boolean; removedPath: string; skill: NormalizedSkill }>('/uninstall', { id })
  return { removedPath: payload.removedPath, skill: payload.skill }
}

/** Preview one installed skill: its document, its header, and its file list. */
export function fetchInstalledDetail(key: string, signal?: AbortSignal): Promise<InstalledSkillDetail> {
  return getJson(`/installed/detail?key=${encodeURIComponent(key)}`, signal)
}

/** One file of an installed skill; the host validates the key and contains the path. */
export async function fetchInstalledFile(key: string, path: string, signal?: AbortSignal): Promise<MarketFileContent> {
  const payload = await getJson<{ file: MarketFileContent }>(
    `/installed/file?key=${encodeURIComponent(key)}&path=${encodeURIComponent(path)}`,
    signal,
  )
  return payload.file
}

/** Remove a specifically selected local entry after the management UI confirmation. */
export function removeInstalled(key: string): Promise<{ item: InstalledSkillRecord; removedPath: string }> {
  return postJson('/installed/uninstall', { key })
}
