/**
 * Skills Market — shared wire types.
 *
 * Upstream sources:
 *  - ClawHub  (https://clawhub.ai)      — cursor pagination, no security audits
 *  - SkillHub (https://api.skillhub.cn) — page/pageSize pagination, security reports
 *
 * This module is the single source of truth for the shapes that cross the HTTP
 * boundary. The browser half may `import type` from it (types are erased at
 * build time); it must never import a *value* from here, because every other
 * module in `src/market/` touches `node:*` and would drag Node code into the
 * browser bundle.
 */

export type MarketSource = 'clawhub' | 'skillhub'

export const MARKET_SOURCES: readonly MarketSource[] = ['clawhub', 'skillhub']

export type SecurityStatus = 'verified' | 'benign' | 'unknown' | 'flagged'

export type InstallState = 'installed' | 'installable' | 'not-installable'

export type SourceHealthStatus = 'ok' | 'degraded' | 'failed' | 'cached'

export type NotInstallableReason =
  | 'empty-file-list'
  | 'file-too-large'
  | 'too-many-files'
  | 'invalid-name'
  | 'name-conflict'
  | 'source-unavailable'

export type SecurityReport = {
  vendor: string
  status: string
  statusText: string
  reportUrl?: string
  /** The scanner's own explanation of its verdict, when it gives one. */
  summary?: string
}

export type NormalizedSkill = {
  /** `${source}:${slug}` — globally unique. */
  id: string
  source: MarketSource
  slug: string
  name: string
  summary: string
  author: { handle: string; displayName?: string; avatarUrl?: string }
  stats: { downloads: number; installs?: number; stars?: number }
  tags: string[]
  version?: string
  updatedAt?: number
  iconUrl?: string
  securityStatus: SecurityStatus
  securityReports?: SecurityReport[]
  requiresApiKey?: boolean
  verified?: boolean
  /** Set on SkillHub entries that mirror a ClawHub skill. */
  upstream?: { source: MarketSource; slug: string; owner?: string }
  /** After dedupe: ids of merged duplicate entries from other sources. */
  mirrors?: string[]
  installState: InstallState
  notInstallableReason?: NotInstallableReason
  installedInfo?: { version?: string; installedAt?: string; dirName: string }
}

export type MarketFileMeta = {
  path: string
  size: number
  sha256?: string
  contentType?: string
  language: string
  /** File exceeds the preview/install size limit. */
  tooBig: boolean
}

export type NormalizedSkillDetail = NormalizedSkill & {
  /** Full SKILL.md body (markdown, frontmatter stripped). */
  description: string
  /** Raw frontmatter parsed from SKILL.md, when present. */
  descriptionFrontmatter?: Record<string, unknown>
  license?: string
  files: MarketFileMeta[]
  totalSize: number
  /** Release note of the latest version, when upstream has a meaningful one. */
  changelog?: { version?: string; text: string; publishedAt?: number }
  /** The skill's page on its registry (http(s) only). */
  pageUrl?: string
}

export type MarketFileContent = {
  path: string
  content: string
  language: string
  size: number
  truncated: boolean
}

export type SourceStatusInfo = {
  status: SourceHealthStatus
  fetchedAt?: number
  fromCache?: boolean
  error?: string
}

export type MarketListResult = {
  items: NormalizedSkill[]
  nextCursor: string | null
  /** Matching skills in total, when known. */
  total?: number
  sources: Record<MarketSource, SourceStatusInfo>
}

/** One curated-catalogue category. */
export type MarketCategory = {
  key: string
  name: string
  nameEn?: string
  sortOrder: number
  /** Skills the catalogue holds in this category. */
  count?: number
}

/** One installed skill as the local inventory reports it. */
export type InstalledSkillRecord = {
  /** `sha256(absolute path)` — the caller never handles a real path. */
  key: string
  linked: boolean
  removable: boolean
  /** `source:slug` when the provenance sidecar exists, else `local:<dirName>`. */
  id: string
  source: MarketSource | 'local'
  slug: string
  /** Registry author recorded at install time, when known. */
  owner?: string
  name: string
  dirName: string
  dirPath: string
  version?: string
  summary?: string
  installedAt?: string
  /** Installed by this plugin (the provenance sidecar is present). */
  managed: boolean
  bytes: number
  fileCount: number
}

export type MarketErrorCode =
  | 'MARKET_UPSTREAM_ERROR'
  | 'MARKET_UPSTREAM_TIMEOUT'
  | 'MARKET_UPSTREAM_BAD_RESPONSE'
  | 'MARKET_INSTALL_IN_PROGRESS'
  | 'MARKET_ALREADY_INSTALLED'
  | 'MARKET_NOT_INSTALLABLE'
  | 'MARKET_CHECKSUM_MISMATCH'
  | 'MARKET_DISK_ERROR'
  | 'MARKET_NOT_INSTALLED'
  | 'MARKET_NOT_MANAGED'

/** Limits applied to one installable skill. */
export const MARKET_LIMITS = {
  /** Max bytes for a single skill file (install + preview). */
  maxFileSize: 5 * 1024 * 1024,
  /** Max total bytes for an installable skill. */
  maxTotalSize: 20 * 1024 * 1024,
  /** Max file count for an installable skill. */
  maxFileCount: 200,
  /** File preview content is truncated beyond this many bytes. */
  previewTruncateBytes: 300 * 1024,
  /** ClawHub search has no pagination — cap merged search results. */
  searchResultCap: 50,
} as const

export function skillId(source: MarketSource, slug: string): string {
  return `${source}:${slug}`
}

export function parseSkillId(id: string): { source: MarketSource; slug: string } | null {
  const idx = id.indexOf(':')
  if (idx <= 0) return null
  const source = id.slice(0, idx)
  const slug = id.slice(idx + 1)
  if (!MARKET_SOURCES.includes(source as MarketSource) || slug === '') return null
  return { source: source as MarketSource, slug }
}

/** Directory-name whitelist: lowercase alnum, dash, underscore, dot (no leading dot). */
export function sanitizeDirName(slug: string): string | null {
  // Upstream payloads are untrusted: a non-string slug is simply not a usable
  // directory name, and must degrade to "not installable" instead of throwing.
  if (typeof slug !== 'string') return null
  const name = slug.toLowerCase()
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(name)) return null
  if (name.includes('..')) return null
  return name
}

const LANG_MAP: Record<string, string> = {
  md: 'markdown', markdown: 'markdown', mdx: 'markdown',
  ts: 'typescript', tsx: 'typescript',
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  json: 'json', yaml: 'yaml', yml: 'yaml', sh: 'bash', bash: 'bash', zsh: 'bash',
  py: 'python', toml: 'toml', css: 'css', html: 'html',
  txt: 'text', xml: 'xml', sql: 'sql', rs: 'rust', go: 'go', rb: 'ruby',
}

export function detectMarketLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  return LANG_MAP[ext] ?? 'text'
}
