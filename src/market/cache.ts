/**
 * Market read cache: memory front, disk behind, provenance preserved.
 *
 * The policy this module implements, in one place so the routes cannot each
 * invent a different one:
 *
 *   - a **fresh** record answers the request and is reported `fromCache: true`;
 *   - an **expired** record is *not* served on its own — the caller goes to
 *     upstream — but it is kept as a fallback for when upstream is unreachable,
 *     where serving a two-day-old page beats showing an error;
 *   - `force` skips the fresh check entirely, which is what the panel's refresh
 *     button and every **install** decision use.
 *
 * `fetchedAt` is the moment upstream was read and is never restamped on a hit.
 * The panel prints its age; a restamping cache would make that age always read
 * "just now", which is the one thing it exists to prevent.
 *
 * The cache is an **instance**, not module state: a profile reload creates a new
 * plugin instance while the old one may still be draining a request, and two
 * instances sharing a module-level store would let one instance's teardown
 * silently reconfigure the other's cache.
 */

import * as path from 'node:path'
import { DiskCache } from './disk-cache.ts'
import { markSourceCached } from './provider-fetch.ts'
import type { MarketSource, SourceStatusInfo } from './types.ts'

/** How long an expired record may still be served when upstream is unreachable. */
const STALE_FALLBACK_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

/** Traffic counters: the evidence behind every "served from cache" claim. */
export interface MarketCacheStats {
  hits: number
  misses: number
  staleServed: number
  upstreamRequests: number
  forcedRefreshes: number
  writes: number
  writeFailures: number
}

export interface MarketCacheOptions {
  /** Directory holding the persisted snapshots. */
  directory: string
  /** How long a snapshot stays fresh. */
  ttlMs: number
  /** Reports a degraded store; called at most once per instance. */
  onError?: (error: unknown) => void
}

export interface CachedRead<T> {
  value: T
  fetchedAt: number
  fromCache: boolean
  source: MarketSource
}

export interface ReadThroughOptions<T> {
  key: string
  source: MarketSource
  /** Skip the fresh check and go to upstream. */
  force?: boolean
  /** Refuse to fall back to an expired record when upstream fails. */
  allowStale?: boolean
  /** The upstream read; only called on a miss, an expiry, or `force`. */
  load: () => Promise<T>
  /** Cancel the whole read. */
  signal?: AbortSignal
}

export class MarketCache {
  private readonly store: DiskCache
  private readonly ttlMs: number
  private warned = false
  private readonly counters: MarketCacheStats = {
    hits: 0,
    misses: 0,
    staleServed: 0,
    upstreamRequests: 0,
    forcedRefreshes: 0,
    writes: 0,
    writeFailures: 0,
  }

  constructor(options: MarketCacheOptions) {
    this.ttlMs = Math.max(1_000, options.ttlMs)
    this.store = new DiskCache({
      directory: options.directory,
      onError: (error) => {
        // A degraded store must not spam the log on every request: one warning is
        // enough to tell an operator the disk is not writable.
        if (this.warned) return
        this.warned = true
        options.onError?.(error)
      },
    })
  }

  /** Current counters. */
  stats(): MarketCacheStats {
    return { ...this.counters }
  }

  /**
   * Read through the cache.
   *
   * @throws whatever `load` throws when upstream fails and no acceptable stale
   *   record exists — the caller maps that onto the HTTP envelope.
   */
  async readThrough<T>(options: ReadThroughOptions<T>): Promise<CachedRead<T>> {
    const now = Date.now()
    if (options.force === true) this.counters.forcedRefreshes += 1

    if (options.force !== true) {
      const record = await this.store.read<T>(options.key, now)
      if (record !== null && !record.expired) {
        this.counters.hits += 1
        markSourceCached(options.source, record.fetchedAt)
        return { value: record.value, fetchedAt: record.fetchedAt, fromCache: true, source: options.source }
      }
    }

    // A forced refresh must not silently answer with the very record it was asked
    // to bypass, so the stale fallback is read only for an ordinary miss.
    const stale = options.force === true ? null : await this.store.read<T>(options.key, now)

    this.counters.misses += 1
    this.counters.upstreamRequests += 1

    try {
      const fetchedAt = Date.now()
      const value = await options.load()
      const stored = await this.store.write(options.key, value, this.ttlMs, fetchedAt)
      if (stored) this.counters.writes += 1
      else this.counters.writeFailures += 1
      return { value, fetchedAt, fromCache: false, source: options.source }
    } catch (error) {
      const usable = stale !== null
        && options.allowStale !== false
        && now - stale.fetchedAt <= STALE_FALLBACK_MAX_AGE_MS
      if (usable && stale !== null) {
        this.counters.staleServed += 1
        markSourceCached(options.source, stale.fetchedAt)
        return { value: stale.value, fetchedAt: stale.fetchedAt, fromCache: true, source: options.source }
      }
      throw error
    }
  }

  /** Clear the persisted store (used when the provider configuration changes). */
  async clear(): Promise<void> {
    await this.store.clear()
  }
}

/**
 * Cache key for one read.
 *
 * JSON-encoded rather than colon-joined: every component here can itself contain
 * a colon (a base URL, a file path), and joining them with the same character
 * that appears inside them makes two different requests collide.
 */
export function cacheKey(kind: string, parts: readonly (string | number | undefined)[]): string {
  return `${kind}:${JSON.stringify(parts.map((part) => part ?? null))}`
}

/** Default cache directory under the harness home. */
export function marketCacheDirectory(dshHome: string): string {
  return path.join(dshHome, 'cache', 'skills-market-hub', 'v1')
}

/** Source health vocabulary re-exported so routes do not import three modules. */
export type { SourceStatusInfo }
