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
import type { MarketSource, SourceStatusInfo } from './types.ts';
/** Traffic counters: the evidence behind every "served from cache" claim. */
export interface MarketCacheStats {
    hits: number;
    misses: number;
    staleServed: number;
    upstreamRequests: number;
    forcedRefreshes: number;
    writes: number;
    writeFailures: number;
}
export interface MarketCacheOptions {
    /** Directory holding the persisted snapshots. */
    directory: string;
    /** How long a snapshot stays fresh. */
    ttlMs: number;
    /** Reports a degraded store; called at most once per instance. */
    onError?: (error: unknown) => void;
}
export interface CachedRead<T> {
    value: T;
    fetchedAt: number;
    fromCache: boolean;
    source: MarketSource;
}
export interface ReadThroughOptions<T> {
    key: string;
    source: MarketSource;
    /** Skip the fresh check and go to upstream. */
    force?: boolean;
    /** Refuse to fall back to an expired record when upstream fails. */
    allowStale?: boolean;
    /** The upstream read; only called on a miss, an expiry, or `force`. */
    load: () => Promise<T>;
    /** Cancel the whole read. */
    signal?: AbortSignal;
}
export declare class MarketCache {
    private readonly store;
    private readonly ttlMs;
    private warned;
    private readonly counters;
    constructor(options: MarketCacheOptions);
    /** Current counters. */
    stats(): MarketCacheStats;
    /**
     * Read through the cache.
     *
     * @throws whatever `load` throws when upstream fails and no acceptable stale
     *   record exists — the caller maps that onto the HTTP envelope.
     */
    readThrough<T>(options: ReadThroughOptions<T>): Promise<CachedRead<T>>;
    /** Clear the persisted store (used when the provider configuration changes). */
    clear(): Promise<void>;
}
/**
 * Cache key for one read.
 *
 * JSON-encoded rather than colon-joined: every component here can itself contain
 * a colon (a base URL, a file path), and joining them with the same character
 * that appears inside them makes two different requests collide.
 */
export declare function cacheKey(kind: string, parts: readonly (string | number | undefined)[]): string;
/** Default cache directory under the harness home. */
export declare function marketCacheDirectory(dshHome: string): string;
/** Source health vocabulary re-exported so routes do not import three modules. */
export type { SourceStatusInfo };
//# sourceMappingURL=cache.d.ts.map