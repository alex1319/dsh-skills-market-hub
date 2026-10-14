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
import type { MarketSource, SourceStatusInfo } from './types.ts';
/** Upstream defaults, overridden by `Config` through {@link configureProviderFetch}. */
export interface ProviderFetchConfiguration {
    clawhubBaseUrl: string;
    skillhubBaseUrl: string;
    /** Per-attempt timeout in milliseconds. */
    timeoutMs: number;
    /** Extra attempts after the first failure (network error, 429, 5xx). */
    retries: number;
    userAgent: string;
}
/** Apply the plugin's configuration. Called once from `apply()`. */
export declare function configureProviderFetch(patch: Partial<ProviderFetchConfiguration>): void;
/** Restore the shipped defaults (tests, and an unload that must not leak config). */
export declare function resetProviderFetchConfiguration(): void;
/**
 * Run one operation against a single configuration snapshot.
 *
 * Every upstream read and every cache key derived from a base URL must go
 * through this, so a reload mid-flight cannot mix two configurations.
 */
export declare function withProviderConfiguration<T>(operation: () => Promise<T>): Promise<T>;
/** Base URL of one provider, under the current operation's configuration. */
export declare function baseUrlFor(source: MarketSource): string;
/** One upstream failure, carrying the market error code the route layer maps. */
export declare class MarketUpstreamError extends Error {
    readonly source: MarketSource;
    readonly code: string;
    constructor(source: MarketSource, code: string, message: string);
}
/** Error codes this layer raises (`MARKET_ERROR_CODES` subset). */
export declare const UPSTREAM_ERROR_CODES: {
    readonly error: "MARKET_UPSTREAM_ERROR";
    readonly timeout: "MARKET_UPSTREAM_TIMEOUT";
    readonly badResponse: "MARKET_UPSTREAM_BAD_RESPONSE";
};
/** Mark a read answered from a cached snapshot rather than from upstream. */
export declare function markSourceCached(source: MarketSource, fetchedAt: number): void;
/** Current health of every source, for the `/status` endpoint. */
export declare function getSourceStatus(): Record<MarketSource, SourceStatusInfo>;
/** Drop all recorded health (unload, or a new plugin instance taking over). */
export declare function resetSourceStatus(): void;
export interface ProviderFetchOptions {
    /** Query parameters; `undefined` values are omitted. */
    query?: Record<string, string | number | undefined>;
    /** Extra request headers. */
    headers?: Record<string, string>;
    /** Body text limit; defaults to the largest installable skill size. */
    maxBytes?: number;
    /** Caller cancellation. */
    signal?: AbortSignal;
    /** Accept header override (file reads want text, not JSON). */
    accept?: string;
}
/** A capped response body, plus whether the upstream announced a longer one. */
export interface ProviderTextResponse {
    text: string;
    /** Byte length of the received text. */
    bytes: number;
    /** The response's own content-length, when it sent one. */
    declaredBytes?: number;
}
/**
 * Read one upstream URL as text.
 *
 * Retries on network failures, `429`, and `5xx` — the statuses that mean "try
 * again" rather than "your request was wrong". Every other status (including
 * `404`) is returned to the caller, which is the layer that knows what a missing
 * skill means.
 */
export declare function providerFetch(source: MarketSource, url: URL, options?: ProviderFetchOptions): Promise<ProviderTextResponse & {
    status: number;
    ok: boolean;
}>;
/**
 * Fetch and parse a JSON response.
 *
 * A body that is not the promised JSON is a *bad response*, not an empty result:
 * reporting it as "no skills found" would hide a broken upstream behind a
 * plausible-looking empty page.
 */
export declare function providerFetchJson<T>(source: MarketSource, url: URL, options?: ProviderFetchOptions): Promise<{
    value: T;
    status: number;
}>;
/** Build a URL under one source's base, resolving `path` against it. */
export declare function providerUrl(source: MarketSource, path: string): URL;
//# sourceMappingURL=provider-fetch.d.ts.map