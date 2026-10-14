/**
 * Endpoint table for the Skills Market HTTP surface.
 *
 * This module owns the *shape* of the API: which path segments exist, which
 * methods they accept, and what a caller gets back. The filesystem and upstream
 * work lives behind it, so a route can be read at a glance against
 * `docs/CONTRACT.md` without following a call chain into the market layer.
 *
 * Every response is JSON with `Cache-Control: no-store` (set by the transport),
 * because the panel polls and every payload is either live upstream data or live
 * disk state. Failures are always the `{ error: { code, message } }` envelope.
 */

import { decodeCursor } from './market/cursor.ts'
import { getSourceStatus } from './market/provider-fetch.ts'
import {
  getMarketFileContent,
  getMarketSkillDetail,
  listMarketCategories,
  listMarketSkills,
  type InstalledFilter,
  type MarketQuery,
  type SecurityFilter,
  type SourceFilter,
} from './market/market-service.ts'
import { MARKET_SOURCES, parseSkillId, type MarketSource } from './market/types.ts'
import {
  installMarketSkill,
  readInstalledEntryFile,
  readInstalledSkill,
  uninstallInstalledEntry,
  uninstallMarketSkill,
} from './skills/install-service.ts'
import { scanInstalledSkills } from './skills/installed.ts'
import {
  enumQuery,
  optionalQuery,
  parseLimit,
  parseRefresh,
  parseSlug,
  requireMethod,
  RouteError,
  sendJson,
  type RouteContext,
  type RouteHandler,
} from './web-routes.ts'

/** Longest accepted `q` parameter. */
const MAX_QUERY_LENGTH = 200
/** Longest accepted opaque `cursor`. */
const MAX_CURSOR_LENGTH = 512
/** Longest accepted file path, for both market and installed previews. */
const MAX_FILE_PATH_LENGTH = 512
/** Owner handle shape, mirroring the registry's own identifier rules. */
const OWNER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/
/** Opaque installed-entry key: a SHA-256 hex digest. */
const ENTRY_KEY_PATTERN = /^[a-f0-9]{64}$/
/** Catalogue category key shape. */
const CATEGORY_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/

const SECURITY_FILTERS = ['verified', 'benign', 'unknown', 'flagged'] as const
const INSTALLED_FILTERS = ['all', 'installed', 'installable'] as const

function parseSourceSegment(segment: string | undefined): MarketSource {
  if (segment !== undefined && (MARKET_SOURCES as readonly string[]).includes(segment)) return segment as MarketSource
  throw new RouteError(400, 'BAD_REQUEST', `Invalid market source: ${segment ?? ''}`)
}

/**
 * Optional registry owner.
 *
 * A malformed owner is refused rather than dropped: silently falling back to "no
 * owner" would turn a pinned lookup into an ambiguous one, which is exactly the
 * failure this parameter exists to prevent.
 */
function parseOwner(raw: unknown): string | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined
  if (typeof raw !== 'string' || !OWNER_PATTERN.test(raw)) {
    throw new RouteError(400, 'BAD_REQUEST', `Invalid owner: ${String(raw)}`)
  }
  return raw
}

/**
 * `category` query parameter: a catalogue key, shape-checked only.
 *
 * Checked even though no catalogue ships yet, so a client cannot come to depend
 * on a malformed value being accepted.
 */
function parseCategory(url: URL): string | undefined {
  const raw = url.searchParams.get('category')
  if (raw === null || raw === '' || raw === 'all') return undefined
  if (!CATEGORY_PATTERN.test(raw)) throw new RouteError(400, 'BAD_REQUEST', `Invalid category: ${raw}`)
  return raw
}

/** `{ id: "source:slug" }` body of the install/uninstall endpoints. */
function parseBodyId(body: Record<string, unknown>): { source: MarketSource; slug: string } {
  const id = typeof body.id === 'string' ? body.id : ''
  const parsed = parseSkillId(id)
  if (parsed === null) throw new RouteError(400, 'BAD_REQUEST', `Invalid skill id: ${id === '' ? '(missing)' : id}`)
  return parsed
}

/** `{ key }` body or `?key=` parameter of the installed endpoints. */
function requireEntryKey(raw: unknown): string {
  if (typeof raw !== 'string' || !ENTRY_KEY_PATTERN.test(raw)) {
    throw new RouteError(400, 'BAD_REQUEST', 'Missing or malformed skill key')
  }
  return raw
}

/**
 * Whether a registry-supplied file path is safe to address.
 *
 * The strict reading — no absolute paths, no backslashes, no `..`, no NUL — is the
 * same rule the install path applies, so the preview endpoint refuses a path the
 * install would refuse rather than resolving it and reading something else.
 */
export function isSafeMarketFilePath(filePath: string): boolean {
  if (typeof filePath !== 'string' || filePath === '' || filePath.length > MAX_FILE_PATH_LENGTH) return false
  if (filePath.includes('\0') || filePath.includes('\\')) return false
  if (filePath.startsWith('/')) return false
  if (filePath.includes('..')) return false
  return true
}

/** Read one bounded optional query parameter once, rather than twice. */
function queryParam(url: URL, name: string, max: number): string | undefined {
  return optionalQuery(url, name, max)
}

/**
 * Build the dispatch table.
 *
 * A head segment absent from this map is a 404, which is why the map — not a
 * chain of `if`s — is the contract.
 */
export function createRoutes(): Map<string, RouteHandler> {
  const routes = new Map<string, RouteHandler>()

  // ── Diagnostics ───────────────────────────────────────────────────────────

  routes.set('ping', ({ method, res }) => {
    requireMethod(method, 'GET')
    sendJson(res, 200, { ok: true })
  })

  routes.set('version', ({ method, res }, context) => {
    requireMethod(method, 'GET')
    sendJson(res, 200, { name: 'skills-market-hub', version: context.version })
  })

  /** Traffic counters: the evidence behind every "served from cache" claim. */
  routes.set('stats', ({ method, res }, context) => {
    requireMethod(method, 'GET')
    sendJson(res, 200, { stats: context.stats() })
  })

  // ── Market ────────────────────────────────────────────────────────────────

  routes.set('status', ({ method, res }) => {
    requireMethod(method, 'GET')
    sendJson(res, 200, { sources: getSourceStatus() })
  })

  routes.set('categories', ({ method, res }) => {
    requireMethod(method, 'GET')
    sendJson(res, 200, listMarketCategories())
  })

  routes.set('skills', async ({ url, method, segments, res }) => {
    requireMethod(method, 'GET')

    if (segments.length === 1) {
      const q = queryParam(url, 'q', MAX_QUERY_LENGTH)
      const cursor = queryParam(url, 'cursor', MAX_CURSOR_LENGTH)
      const query: MarketQuery = {
        ...(q === undefined ? {} : { q }),
        source: enumQuery<'all' | MarketSource>(url, 'source', ['all', ...MARKET_SOURCES], 'all') as SourceFilter,
        security: enumQuery<'all' | (typeof SECURITY_FILTERS)[number]>(
          url, 'security', ['all', ...SECURITY_FILTERS], 'all',
        ) as SecurityFilter,
        installed: enumQuery<(typeof INSTALLED_FILTERS)[number]>(
          url, 'installed', INSTALLED_FILTERS, 'all',
        ) as InstalledFilter,
        limit: parseLimit(url, 24),
        refresh: parseRefresh(url),
        ...(cursor === undefined ? {} : { cursor }),
      }
      // Validated even though no catalogue ships yet, so a client cannot come to
      // depend on a malformed category being accepted.
      void parseCategory(url)
      // `scope` is accepted for forward compatibility with a shipped catalogue;
      // today both scopes read live registries.
      void enumQuery<'catalog' | 'market'>(url, 'scope', ['catalog', 'market'], 'catalog')

      const decoded = cursor === undefined ? {} : decodeCursor(cursor)
      if (decoded === null) throw new RouteError(400, 'BAD_REQUEST', 'Invalid cursor')

      sendJson(res, 200, await listMarketSkills(query, decoded, getSourceStatus()))
      return
    }

    // Shape first: an unknown depth stays a 404 even when the segments that would
    // have been parsed happen to be invalid.
    if (segments.length === 3 || (segments.length === 4 && segments[3] === 'file')) {
      const source = parseSourceSegment(segments[1])
      const slug = parseSlug(segments[2])

      if (segments.length === 3) {
        const owner = parseOwner(url.searchParams.get('owner'))
        const skill = await getMarketSkillDetail(source, slug, {
          force: parseRefresh(url),
          ...(owner === undefined ? {} : { owner }),
        })
        sendJson(res, 200, { skill, sourceStatus: getSourceStatus()[source] })
        return
      }

      const filePath = url.searchParams.get('path') ?? ''
      if (!isSafeMarketFilePath(filePath)) {
        throw new RouteError(400, 'BAD_REQUEST', `Invalid file path: ${filePath}`)
      }
      const owner = parseOwner(url.searchParams.get('owner'))
      const file = await getMarketFileContent(source, slug, filePath, {
        ...(owner === undefined ? {} : { owner }),
      })
      sendJson(res, 200, { file })
      return
    }

    throw new RouteError(404, 'NOT_FOUND', `Unknown route: ${url.pathname}`)
  })

  routes.set('install', async ({ req, method, res }, context) => {
    requireMethod(method, 'POST')
    const body = await context.readBody(req)
    const { source, slug } = parseBodyId(body)
    const owner = parseOwner(body.owner)
    const result = await installMarketSkill(source, slug, {
      skillsRoot: await context.skillsRoot(),
      ...(owner === undefined ? {} : { owner }),
    })
    // Refresh before answering, so the next list or inventory read is correct.
    await context.rescan().catch(() => undefined)
    sendJson(res, 200, { ok: true, installedPath: result.installedPath, skill: result.skill })
  })

  routes.set('uninstall', async ({ req, method, res }, context) => {
    requireMethod(method, 'POST')
    const { source, slug } = parseBodyId(await context.readBody(req))
    const result = await uninstallMarketSkill(source, slug, {
      skillsRoot: await context.skillsRoot(),
      allowUninstall: context.allowUninstall(),
    })
    await context.rescan().catch(() => undefined)
    sendJson(res, 200, { ok: true, removedPath: result.removedPath, skill: result.skill })
  })

  // ── Local inventory ───────────────────────────────────────────────────────

  routes.set('installed', async ({ req, url, method, segments, res }, context) => {
    // Disk is the single source of truth, and it is read per request: the panel's
    // whole job on this tab is to show what is installed *now*, including a skill
    // the user copied in by hand a second ago and excluding one they just deleted.
    // A cached inventory would be wrong in both directions.
    const scan = async () => {
      const roots = await context.scanRoots()
      return { roots, items: await scanInstalledSkills(roots) }
    }

    if (segments.length === 1) {
      requireMethod(method, 'GET')
      const { items } = await scan()
      sendJson(res, 200, { items: items.map((item) => ({ ...item, removable: context.allowUninstall() })) })
      return
    }

    const { roots } = await scan()

    if (segments.length === 2 && segments[1] === 'detail') {
      requireMethod(method, 'GET')
      sendJson(res, 200, await readInstalledSkill(roots, requireEntryKey(url.searchParams.get('key'))))
      return
    }

    if (segments.length === 2 && segments[1] === 'file') {
      requireMethod(method, 'GET')
      const file = await readInstalledEntryFile(
        roots,
        requireEntryKey(url.searchParams.get('key')),
        url.searchParams.get('path') ?? '',
      )
      sendJson(res, 200, { file })
      return
    }

    if (segments.length === 2 && segments[1] === 'uninstall') {
      requireMethod(method, 'POST')
      const body = await context.readBody(req)
      const result = await uninstallInstalledEntry(roots, requireEntryKey(body.key), {
        skillsRoot: await context.skillsRoot(),
        allowUninstall: context.allowUninstall(),
      })
      await context.rescan().catch(() => undefined)
      sendJson(res, 200, { ok: true, removedPath: result.removedPath, item: result.item })
      return
    }

    throw new RouteError(404, 'NOT_FOUND', `Unknown route: ${url.pathname}`)
  })

  return routes
}

export type { RouteContext, RouteHandler }
