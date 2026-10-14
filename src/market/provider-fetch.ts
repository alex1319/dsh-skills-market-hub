/**
 * Upstream fetch layer shared by both market providers.
 *
 * Everything that must behave identically against ClawHub and SkillHub lives
 * here: base URLs, the timeout, the retry budget, bounded body reads, and the
 * per-source health record the panel's status bar shows.
 *
 * Two properties matter:
 *
 *  - **Configuration is pinned per operation, not per module.** A profile reload
 *    can change the base URLs while a multi-step operation (a list page, a
 *    detail plus its file list) is still in flight. `AsyncLocalStorage` carries
 *    one immutable snapshot through that operation, so a request can never read
 *    page 1 from one host and page 2 from another.
 *  - **Bodies are bounded while streaming.** A hostile or broken upstream can
 *    answer with an unbounded stream; the read is capped and the socket is
 *    cancelled the moment the cap is passed, rather than after buffering it all.
 */

import { AsyncLocalStorage } from 'node:async_hooks'
import type { MarketSource, SourceHealthStatus, SourceStatusInfo } from './types.ts'
import { MARKET_LIMITS } from './types.ts'

/** Upstream defaults, overridden by `Config` through {@link configureProviderFetch}. */
export interface ProviderFetchConfiguration {
  clawhubBaseUrl: string
  skillhubBaseUrl: string
  /** Per-attempt timeout in milliseconds. */
  timeoutMs: number
  /** Extra attempts after the first failure (network error, 429, 5xx). */
  retries: number
  userAgent: string
}

const DEFAULTS: ProviderFetchConfiguration = {
  clawhubBaseUrl: 'https://clawhub.ai',
  skillhubBaseUrl: 'https://api.skillhub.cn',
  timeoutMs: 15_000,
  retries: 1,
  userAgent: 'dsh-skills-market-hub',
}

let current: ProviderFetchConfiguration = { ...DEFAULTS }
const scope = new AsyncLocalStorage<ProviderFetchConfiguration>()

/** Apply the plugin's configuration. Called once from `apply()`. */
export function configureProviderFetch(patch: Partial<ProviderFetchConfiguration>): void {
  current = {
    ...current,
    ...patch,
    // Trailing slashes would double up when a provider joins a path onto the base.
    ...(patch.clawhubBaseUrl === undefined ? {} : { clawhubBaseUrl: stripTrailingSlash(patch.clawhubBaseUrl) }),
    ...(patch.skillhubBaseUrl === undefined ? {} : { skillhubBaseUrl: stripTrailingSlash(patch.skillhubBaseUrl) }),
  }
}

/** Restore the shipped defaults (tests, and an unload that must not leak config). */
export function resetProviderFetchConfiguration(): void {
  current = { ...DEFAULTS }
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

/**
 * Run one operation against a single configuration snapshot.
 *
 * Every upstream read and every cache key derived from a base URL must go
 * through this, so a reload mid-flight cannot mix two configurations.
 */
export function withProviderConfiguration<T>(operation: () => Promise<T>): Promise<T> {
  return scope.run({ ...current }, operation)
}

/** The configuration in force for the current operation. */
function configuration(): ProviderFetchConfiguration {
  return scope.getStore() ?? current
}

/** Base URL of one provider, under the current operation's configuration. */
export function baseUrlFor(source: MarketSource): string {
  const config = configuration()
  return source === 'clawhub' ? config.clawhubBaseUrl : config.skillhubBaseUrl
}

/** One upstream failure, carrying the market error code the route layer maps. */
export class MarketUpstreamError extends Error {
  constructor(
    readonly source: MarketSource,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'MarketUpstreamError'
  }
}

/** Error codes this layer raises (`MARKET_ERROR_CODES` subset). */
export const UPSTREAM_ERROR_CODES = {
  error: 'MARKET_UPSTREAM_ERROR',
  timeout: 'MARKET_UPSTREAM_TIMEOUT',
  badResponse: 'MARKET_UPSTREAM_BAD_RESPONSE',
} as const

// ── Per-source health ───────────────────────────────────────────────────────
// The panel's status bar answers "is this source healthy right now, and how old
// is the answer I am looking at". Both facts are produced here, at the only
// place that sees a real request.

const health = new Map<MarketSource, SourceStatusInfo>()

/** Record one source's health after a read. */
function markHealth(source: MarketSource, status: SourceHealthStatus, error?: string): void {
  const previous = health.get(source)
  health.set(source, {
    status,
    fetchedAt: Date.now(),
    // A degraded source that later succeeds must not keep reporting cached data.
    fromCache: false,
    ...(error === undefined || status === 'ok' ? {} : { error }),
    ...(previous === undefined ? {} : {}),
  })
}

/** Mark a read answered from a cached snapshot rather than from upstream. */
export function markSourceCached(source: MarketSource, fetchedAt: number): void {
  health.set(source, { status: 'cached', fetchedAt, fromCache: true })
}

/** Current health of every source, for the `/status` endpoint. */
export function getSourceStatus(): Record<MarketSource, SourceStatusInfo> {
  const record = {} as Record<MarketSource, SourceStatusInfo>
  for (const source of ['clawhub', 'skillhub'] as const) {
    record[source] = health.get(source) ?? { status: 'unknown' as SourceHealthStatus }
  }
  return record
}

/** Drop all recorded health (unload, or a new plugin instance taking over). */
export function resetSourceStatus(): void {
  health.clear()
}

// ── Fetch ───────────────────────────────────────────────────────────────────

export interface ProviderFetchOptions {
  /** Query parameters; `undefined` values are omitted. */
  query?: Record<string, string | number | undefined>
  /** Extra request headers. */
  headers?: Record<string, string>
  /** Body text limit; defaults to the largest installable skill size. */
  maxBytes?: number
  /** Caller cancellation. */
  signal?: AbortSignal
  /** Accept header override (file reads want text, not JSON). */
  accept?: string
}

/** A capped response body, plus whether the upstream announced a longer one. */
export interface ProviderTextResponse {
  text: string
  /** Byte length of the received text. */
  bytes: number
  /** The response's own content-length, when it sent one. */
  declaredBytes?: number
}

/**
 * Read one upstream URL as text.
 *
 * Retries on network failures, `429`, and `5xx` — the statuses that mean "try
 * again" rather than "your request was wrong". Every other status (including
 * `404`) is returned to the caller, which is the layer that knows what a missing
 * skill means.
 */
export async function providerFetch(
  source: MarketSource,
  url: URL,
  options: ProviderFetchOptions = {},
): Promise<ProviderTextResponse & { status: number; ok: boolean }> {
  if (options.query !== undefined) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value === undefined) continue
      url.searchParams.set(key, String(value))
    }
  }

  const config = configuration()
  const attempts = Math.max(1, config.retries + 1)
  let lastError: unknown

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => { controller.abort(new Error('timeout')) }, config.timeoutMs)
    // A caller abort must also stop this attempt, whichever fires first.
    const signal = options.signal === undefined
      ? controller.signal
      : AbortSignal.any([options.signal, controller.signal])

    try {
      const response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        headers: {
          accept: options.accept ?? 'application/json, text/plain, */*',
          'user-agent': config.userAgent,
          ...options.headers,
        },
        signal,
      })

      const retryable = response.status === 429 || response.status >= 500
      if (retryable && attempt < attempts) {
        // Drain so the socket can be reused, then try again.
        await response.arrayBuffer().catch(() => undefined)
        lastError = new MarketUpstreamError(source, UPSTREAM_ERROR_CODES.error, `upstream answered ${response.status}`)
        continue
      }

      const limit = options.maxBytes ?? MARKET_LIMITS.maxTotalSize
      const { text, bytes, declaredBytes } = await readCappedText(source, response, limit)
      markHealth(source, response.ok ? 'ok' : 'degraded', response.ok ? undefined : `HTTP ${response.status}`)
      return { text, bytes, status: response.status, ok: response.ok, ...(declaredBytes === undefined ? {} : { declaredBytes }) }
    } catch (error) {
      lastError = error
      // A caller abort is not a retryable upstream failure: propagate it as-is so
      // the client's stale-response logic can tell cancellation from a fault.
      if (options.signal?.aborted === true) throw error
      if (isTimeout(error, controller)) {
        lastError = new MarketUpstreamError(source, UPSTREAM_ERROR_CODES.timeout, `upstream timed out after ${config.timeoutMs}ms`)
      }
      if (attempt >= attempts) break
    } finally {
      clearTimeout(timer)
    }
  }

  markHealth(source, 'failed', lastError instanceof Error ? lastError.message : String(lastError))
  if (lastError instanceof MarketUpstreamError) throw lastError
  throw new MarketUpstreamError(
    source,
    UPSTREAM_ERROR_CODES.error,
    lastError instanceof Error ? lastError.message : String(lastError),
  )
}

/** Whether a thrown value came from this attempt's own timeout. */
function isTimeout(error: unknown, controller: AbortController): boolean {
  if (!controller.signal.aborted) return false
  if (!(error instanceof Error)) return false
  return error.name === 'AbortError' || error.name === 'TimeoutError' || error.message === 'timeout'
}

/**
 * Read a response body with a hard byte cap, cancelling the stream when passed.
 *
 * `content-length` is only a hint: it is absent on chunked responses and can be
 * wrong, so the running total is what actually stops the read.
 */
async function readCappedText(
  source: MarketSource,
  response: Response,
  maxBytes: number,
): Promise<{ text: string; bytes: number; declaredBytes?: number }> {
  const declared = Number.parseInt(response.headers.get('content-length') ?? '', 10)
  const declaredBytes = Number.isFinite(declared) ? declared : undefined
  const body = response.body
  if (body === null) {
    const text = await response.text()
    if (text.length > maxBytes) {
      throw new MarketUpstreamError(source, UPSTREAM_ERROR_CODES.badResponse, `upstream body exceeds ${maxBytes} bytes`)
    }
    return { text, bytes: Buffer.byteLength(text), ...(declaredBytes === undefined ? {} : { declaredBytes }) }
  }

  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value === undefined) continue
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined)
        throw new MarketUpstreamError(
          source,
          UPSTREAM_ERROR_CODES.badResponse,
          `upstream body exceeds ${maxBytes} bytes`,
        )
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return { text: new TextDecoder().decode(merged), bytes: total, ...(declaredBytes === undefined ? {} : { declaredBytes }) }
}

/**
 * Fetch and parse a JSON response.
 *
 * A body that is not the promised JSON is a *bad response*, not an empty result:
 * reporting it as "no skills found" would hide a broken upstream behind a
 * plausible-looking empty page.
 */
export async function providerFetchJson<T>(
  source: MarketSource,
  url: URL,
  options: ProviderFetchOptions = {},
): Promise<{ value: T; status: number }> {
  const response = await providerFetch(source, url, options)
  let value: unknown
  try {
    value = JSON.parse(response.text)
  } catch {
    throw new MarketUpstreamError(
      source,
      UPSTREAM_ERROR_CODES.badResponse,
      `upstream answered ${response.status} with a body that is not JSON`,
    )
  }
  return { value: value as T, status: response.status }
}

/** Build a URL under one source's base, resolving `path` against it. */
export function providerUrl(source: MarketSource, path: string): URL {
  return new URL(path, baseUrlFor(source))
}
