/**
 * Skills Market HTTP surface.
 *
 * One `prefix` route owns every endpoint the panel needs. Two properties matter
 * more than the routing itself:
 *
 *  - **Nothing escapes as a non-JSON error.** The handler catches its own
 *    rejections; the web server's own catch-all would otherwise answer a thrown
 *    handler with a bare `400` and no body, and the browser client parses the
 *    `{ error: { code, message } }` envelope.
 *  - **The browser-trust gate runs first.** Raw `webServer` routes do not
 *    inherit the Connection service's Host/Origin fence, so a route registered
 *    here would otherwise be reachable by a cross-site request or a DNS-rebound
 *    page.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { MarketCacheStats } from './market/cache.ts'
import type { InstalledSkillRecord } from './market/types.ts'

/** Path prefix of the whole Skills Market API. */
export const ROUTE_PREFIX = '/api/skills-market-hub'

/** Request bodies here are small field objects; anything larger is an attack. */
const MAX_BODY_BYTES = 64 * 1024

/** Structural Web server contract (mirrors `webServer.register`). */
export interface WebServerLike {
  register(route: {
    kind: 'exact' | 'prefix'
    path: string
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  }): () => void
}

/**
 * Browser-trust gate, structurally equal to the frozen contract's predicate.
 *
 * The real `HostConnectionService.requestRejection` returns `401 | 403 |
 * undefined` rather than a boolean, so this plugin accepts both shapes: see
 * {@link evaluateGate} for why the numeric form is worth preserving.
 */
export interface RequestGate {
  requestRejection(req: IncomingMessage, res: ServerResponse): unknown
}

/**
 * Resolves the gate for one request.
 *
 * A getter, not the service itself: Loader rows activate concurrently, so the
 * Connection service frequently appears *after* this plugin registered its
 * route. Snapshotting it at registration time silently produces an unfenced
 * marketplace.
 */
export type GateSource = () => RequestGate | undefined

/**
 * A rejection produced by this module itself: status, envelope code and headers.
 *
 * Exported so the feature modules raise failures in the same vocabulary rather
 * than inventing their own error shapes.
 */
export class RouteError extends Error {
  readonly status: number
  readonly code: string
  readonly allow: string | undefined

  constructor(status: number, code: string, message: string, allow?: string) {
    super(message)
    this.name = 'RouteError'
    this.status = status
    this.code = code
    this.allow = allow
  }
}

/** One JSON response; the only place a body is written. */
export function sendJson(
  res: ServerResponse,
  status: number,
  payload: unknown,
  headers?: Record<string, string>,
): void {
  if (res.headersSent) {
    res.destroy()
    return
  }
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  })
  res.end(JSON.stringify(payload))
}

export function errorPayload(code: string, message: string): { error: { code: string; message: string } } {
  return { error: { code, message } }
}

/**
 * Map any thrown value onto the envelope's status/code pair.
 *
 * Two error families carry their own status and travel with it: this module's
 * {@link RouteError} (400/404/405/503) and the install service's
 * `SkillOperationError` (400/405/409/413/500/502). Neither is re-derived from a
 * code here, so there is exactly one place that decides a status.
 *
 * Anything else is unexpected: the response is a fixed sentence rather than the
 * thrown message. Raw messages are Node filesystem errors carrying absolute paths
 * ("EEXIST: … mkdir '/var/folders/…'"), which must not be echoed to the browser.
 */
function toHttpFailure(error: unknown): { status: number; code: string; message: string; allow: string | undefined } {
  if (error instanceof RouteError) {
    return { status: error.status, code: error.code, message: error.message, allow: error.allow }
  }
  const operation = asOperationError(error)
  if (operation !== undefined) {
    return { status: operation.status, code: operation.code, message: operation.message, allow: operation.allow }
  }
  return { status: 500, code: 'INTERNAL_ERROR', message: 'internal error', allow: undefined }
}

/**
 * Structural recognition of an install-service failure.
 *
 * `instanceof` would need this module to import the install service, which pulls
 * the filesystem layer into the transport's import graph for the sake of one
 * check. The shape is narrow enough to test directly, and a false positive is
 * impossible for an error that carries a valid HTTP status and a code string.
 */
function asOperationError(error: unknown): { status: number; code: string; message: string; allow: string | undefined } | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const candidate = error as { status?: unknown; code?: unknown; message?: unknown }
  if (typeof candidate.status !== 'number') return undefined
  if (typeof candidate.code !== 'string' || candidate.code === '') return undefined
  if (typeof candidate.message !== 'string') return undefined
  return {
    status: candidate.status,
    code: candidate.code,
    message: candidate.message,
    allow: candidate.status === 405 ? 'POST' : undefined,
  }
}

/** Answer one thrown value; the single exit for every failure path. */
export function sendFailure(res: ServerResponse, error: unknown): void {
  const failure = toHttpFailure(error)
  sendJson(
    res,
    failure.status,
    errorPayload(failure.code, failure.message),
    failure.allow === undefined ? undefined : { allow: failure.allow },
  )
}

/**
 * Run the browser-trust gate and return the rejection status, if any.
 *
 * A gate that throws is treated as a rejection: failing closed is the only
 * defensible reading for a security fence, and an exception from the fence must
 * not turn into "serve the request anyway".
 */
function evaluateGate(gate: RequestGate, req: IncomingMessage, res: ServerResponse): number | undefined {
  let outcome: unknown
  try {
    outcome = gate.requestRejection(req, res)
  } catch {
    return 403
  }
  if (outcome === undefined || outcome === false || outcome === null) return undefined
  return typeof outcome === 'number' ? outcome : 403
}

/**
 * Read a bounded JSON object body.
 *
 * An oversized body stops being buffered immediately and the socket is drained,
 * so a hostile `Content-Length` cannot pin memory in the host process.
 */
export async function readJsonBody(req: IncomingMessage, maxBytes = MAX_BODY_BYTES): Promise<Record<string, unknown>> {
  const raw = await new Promise<string>((resolve, reject) => {
    let size = 0
    let settled = false
    const chunks: Buffer[] = []
    const finish = (error?: Error): void => {
      if (settled) return
      settled = true
      req.off('data', onData)
      req.off('end', onEnd)
      req.off('aborted', onAborted)
      req.off('error', onError)
      if (error !== undefined) {
        chunks.length = 0
        req.once('error', () => undefined)
        req.resume()
        reject(error)
        return
      }
      resolve(Buffer.concat(chunks).toString('utf8'))
    }
    const onData = (chunk: Buffer | string): void => {
      const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += part.length
      if (size > maxBytes) {
        finish(new RouteError(400, 'BAD_REQUEST', `Request body exceeds ${maxBytes} bytes`))
      } else {
        chunks.push(part)
      }
    }
    const onEnd = (): void => finish()
    const onAborted = (): void => finish(new RouteError(400, 'BAD_REQUEST', 'Request body was aborted'))
    const onError = (): void => finish(new RouteError(400, 'BAD_REQUEST', 'Invalid request body'))
    req.on('data', onData)
    req.once('end', onEnd)
    req.once('aborted', onAborted)
    req.once('error', onError)
  })

  let value: unknown
  try {
    value = raw.trim() === '' ? {} : JSON.parse(raw)
  } catch {
    throw new RouteError(400, 'BAD_REQUEST', 'Invalid JSON body')
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new RouteError(400, 'BAD_REQUEST', 'Body must be a JSON object')
  }
  return value as Record<string, unknown>
}

/** Decode the path segments below {@link ROUTE_PREFIX}, rejecting malformed encoding. */
export function parseSegments(pathname: string): string[] {
  if (pathname !== ROUTE_PREFIX && !pathname.startsWith(`${ROUTE_PREFIX}/`)) {
    throw new RouteError(404, 'NOT_FOUND', `Unknown route: ${pathname}`)
  }
  return pathname
    .slice(ROUTE_PREFIX.length)
    .split('/')
    .filter((segment) => segment !== '')
    .map((segment) => {
      try {
        return decodeURIComponent(segment)
      } catch {
        throw new RouteError(400, 'BAD_REQUEST', 'Malformed percent-encoding in the request path')
      }
    })
}

export function requireMethod(method: string, expected: 'GET' | 'POST'): void {
  if (method !== expected) {
    throw new RouteError(405, 'METHOD_NOT_ALLOWED', `Method ${method} is not allowed here`, expected)
  }
}

/** Bounded optional string query parameter. */
export function optionalQuery(url: URL, name: string, maxLength: number): string | undefined {
  const value = url.searchParams.get(name)?.trim()
  if (value === undefined || value === '') return undefined
  if (value.length > maxLength) {
    throw new RouteError(400, 'BAD_REQUEST', `Query parameter "${name}" exceeds ${maxLength} characters`)
  }
  return value
}

/** Closed-set query parameter with a fallback. */
export function enumQuery<T extends string>(
  url: URL,
  name: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const raw = url.searchParams.get(name)
  if (raw === null || raw === '') return fallback
  if ((allowed as readonly string[]).includes(raw)) return raw as T
  throw new RouteError(400, 'BAD_REQUEST', `Invalid ${name} filter: ${raw}`)
}

/**
 * `refresh` query parameter.
 *
 * A reader who presses refresh means "do not answer me from your cache". Without
 * this flag the request looks exactly like the automatic one, so the panel
 * re-renders the same cached page and presents it as fresh. Only the explicit
 * spellings are accepted; anything else is a bad request rather than a silently
 * ignored intent.
 */
export function parseRefresh(url: URL): boolean {
  const raw = url.searchParams.get('refresh')
  if (raw === null || raw === '' || raw === '0' || raw === 'false') return false
  if (raw === '1' || raw === 'true') return true
  throw new RouteError(400, 'BAD_REQUEST', `Invalid refresh flag: ${raw}`)
}

/** `limit` query parameter, clamped into the documented range. */
export function parseLimit(url: URL, fallback: number): number {
  const raw = url.searchParams.get('limit')
  if (raw === null || raw.trim() === '') return fallback
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed)) throw new RouteError(400, 'BAD_REQUEST', `Invalid limit: ${raw}`)
  return Math.min(100, Math.max(1, parsed))
}

/** Reject anything that could escape a path when joined onto a URL or a file path. */
export function parseSlug(segment: string | undefined): string {
  if (segment === undefined || segment === '') throw new RouteError(400, 'BAD_REQUEST', 'Missing skill slug')
  if (segment.length > 200) throw new RouteError(400, 'BAD_REQUEST', 'Skill slug is too long')
  if (segment.includes('/') || segment.includes('\\') || segment.includes('..')) {
    throw new RouteError(400, 'BAD_REQUEST', `Invalid skill slug: ${segment}`)
  }
  return segment
}

/**
 * Everything the endpoint table needs from its owner.
 *
 * Passed as one object rather than closed over so a route cannot reach a piece of
 * the plugin's state its declaration did not ask for.
 */
export interface RouteContext {
  /** Default page size, resolved from Config at activation. */
  readonly pageSize: number
  /** Plugin version, reported by `/version` for diagnostics. */
  readonly version: string
  /** Read one bounded JSON request body. */
  readBody: (req: IncomingMessage) => Promise<Record<string, unknown>>
  /** Absolute directory market installs are written into. */
  skillsRoot: () => Promise<string>
  /** Every directory the local inventory is scanned from. */
  scanRoots: () => Promise<string[]>
  /** The local inventory, as the last refresh recorded it. */
  inventory: () => Promise<InstalledSkillRecord[]>
  /** Whether removal is permitted at all. */
  allowUninstall: () => boolean
  /** Rebuild the inventory and settle the harness skill catalog. */
  rescan: () => Promise<void>
  /** Cache and upstream counters. */
  stats: () => MarketCacheStats
}

/** Dispatch table: one entry per endpoint, keyed by the first path segment. */
export type RouteHandler = (
  request: {
    readonly url: URL
    readonly method: string
    readonly segments: readonly string[]
    readonly req: IncomingMessage
    readonly res: ServerResponse
  },
  context: RouteContext,
) => Promise<void> | void

/**
 * Register the Skills Market prefix route.
 *
 * @param webServer - the `webServer`/`httpServer` service (`ctx.get` guarded by the caller).
 * @param gate - resolves the browser-trust gate (`ctx.get('connection')`) *per
 *   request*; `undefined` means the composition has no Connection fence to
 *   consult. It is a function rather than a snapshot because the Connection row
 *   may activate after this route is registered.
 * @param context - the endpoint table's owner: roots, inventory, policy, counters.
 * @param routes - the endpoint table, keyed by first path segment.
 * @param ready - resolves once the first local inventory scan finished; awaited
 *   before any endpoint runs, so no read can report a stale install state.
 * @returns the route disposer (yield it from `ctx.effect`).
 */
export function registerSkillsMarketHubRoutes(
  webServer: WebServerLike,
  gate: GateSource,
  context: RouteContext,
  routes: ReadonlyMap<string, RouteHandler>,
  ready: () => Promise<void>,
): () => void {
  return webServer.register({
    kind: 'prefix',
    path: ROUTE_PREFIX,
    handler: async (req, res) => {
      try {
        // Raw web routes bypass the Connection fence; ask it before doing any
        // work. Resolved per request, never captured at registration time.
        const resolvedGate = gate()
        if (resolvedGate !== undefined) {
          const rejection = evaluateGate(resolvedGate, req, res)
          if (rejection !== undefined) {
            sendJson(
              res,
              rejection,
              errorPayload(
                rejection === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN',
                rejection === 401 ? 'unauthorized' : 'forbidden',
              ),
            )
            return
          }
        }

        // The first local inventory scan must finish before any answer is
        // produced, or the panel would render every installed skill as
        // installable and invite the reader to download what they already have.
        await ready()

        const url = new URL(req.url ?? '/', 'http://localhost')
        const segments = parseSegments(url.pathname)
        const head = segments[0]
        const handler = head === undefined ? undefined : routes.get(head)
        if (handler === undefined) {
          throw new RouteError(404, 'NOT_FOUND', `Unknown route: ${url.pathname}`)
        }
        await handler(
          { url, method: req.method ?? 'GET', segments, req, res },
          context,
        )
      } catch (error) {
        // Every rejection becomes the documented envelope: the transport keeps
        // working for the next request instead of letting the web server write
        // its own bodyless 400.
        sendFailure(res, error)
      }
    },
  })
}
