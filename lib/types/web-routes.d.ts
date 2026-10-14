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
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { MarketCacheStats } from './market/cache.ts';
import type { InstalledSkillRecord } from './market/types.ts';
/** Path prefix of the whole Skills Market API. */
export declare const ROUTE_PREFIX = "/api/skills-market-hub";
/** Structural Web server contract (mirrors `webServer.register`). */
export interface WebServerLike {
    register(route: {
        kind: 'exact' | 'prefix';
        path: string;
        handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
    }): () => void;
}
/**
 * Browser-trust gate, structurally equal to the frozen contract's predicate.
 *
 * The real `HostConnectionService.requestRejection` returns `401 | 403 |
 * undefined` rather than a boolean, so this plugin accepts both shapes: see
 * {@link evaluateGate} for why the numeric form is worth preserving.
 */
export interface RequestGate {
    requestRejection(req: IncomingMessage, res: ServerResponse): unknown;
}
/**
 * Resolves the gate for one request.
 *
 * A getter, not the service itself: Loader rows activate concurrently, so the
 * Connection service frequently appears *after* this plugin registered its
 * route. Snapshotting it at registration time silently produces an unfenced
 * marketplace.
 */
export type GateSource = () => RequestGate | undefined;
/**
 * A rejection produced by this module itself: status, envelope code and headers.
 *
 * Exported so the feature modules raise failures in the same vocabulary rather
 * than inventing their own error shapes.
 */
export declare class RouteError extends Error {
    readonly status: number;
    readonly code: string;
    readonly allow: string | undefined;
    constructor(status: number, code: string, message: string, allow?: string);
}
/** One JSON response; the only place a body is written. */
export declare function sendJson(res: ServerResponse, status: number, payload: unknown, headers?: Record<string, string>): void;
export declare function errorPayload(code: string, message: string): {
    error: {
        code: string;
        message: string;
    };
};
/** Answer one thrown value; the single exit for every failure path. */
export declare function sendFailure(res: ServerResponse, error: unknown): void;
/**
 * Read a bounded JSON object body.
 *
 * An oversized body stops being buffered immediately and the socket is drained,
 * so a hostile `Content-Length` cannot pin memory in the host process.
 */
export declare function readJsonBody(req: IncomingMessage, maxBytes?: number): Promise<Record<string, unknown>>;
/** Decode the path segments below {@link ROUTE_PREFIX}, rejecting malformed encoding. */
export declare function parseSegments(pathname: string): string[];
export declare function requireMethod(method: string, expected: 'GET' | 'POST'): void;
/** Bounded optional string query parameter. */
export declare function optionalQuery(url: URL, name: string, maxLength: number): string | undefined;
/** Closed-set query parameter with a fallback. */
export declare function enumQuery<T extends string>(url: URL, name: string, allowed: readonly T[], fallback: T): T;
/**
 * `refresh` query parameter.
 *
 * A reader who presses refresh means "do not answer me from your cache". Without
 * this flag the request looks exactly like the automatic one, so the panel
 * re-renders the same cached page and presents it as fresh. Only the explicit
 * spellings are accepted; anything else is a bad request rather than a silently
 * ignored intent.
 */
export declare function parseRefresh(url: URL): boolean;
/** `limit` query parameter, clamped into the documented range. */
export declare function parseLimit(url: URL, fallback: number): number;
/** Reject anything that could escape a path when joined onto a URL or a file path. */
export declare function parseSlug(segment: string | undefined): string;
/**
 * Everything the endpoint table needs from its owner.
 *
 * Passed as one object rather than closed over so a route cannot reach a piece of
 * the plugin's state its declaration did not ask for.
 */
export interface RouteContext {
    /** Default page size, resolved from Config at activation. */
    readonly pageSize: number;
    /** Plugin version, reported by `/version` for diagnostics. */
    readonly version: string;
    /** Read one bounded JSON request body. */
    readBody: (req: IncomingMessage) => Promise<Record<string, unknown>>;
    /** Absolute directory market installs are written into. */
    skillsRoot: () => Promise<string>;
    /** Every directory the local inventory is scanned from. */
    scanRoots: () => Promise<string[]>;
    /** The local inventory, as the last refresh recorded it. */
    inventory: () => Promise<InstalledSkillRecord[]>;
    /** Whether removal is permitted at all. */
    allowUninstall: () => boolean;
    /** Rebuild the inventory and settle the harness skill catalog. */
    rescan: () => Promise<void>;
    /**
     * Called with the absolute path of a staging directory that could not be
     * removed.
     *
     * A staging directory nobody can delete is the visible symptom of something on
     * this machine holding a handle on it, and the user is the only one who can act
     * on that — so it is logged with its path rather than swallowed.
     */
    onStuckStaging: (stagingPath: string) => void;
    /** Cache and upstream counters. */
    stats: () => MarketCacheStats;
}
/** Dispatch table: one entry per endpoint, keyed by the first path segment. */
export type RouteHandler = (request: {
    readonly url: URL;
    readonly method: string;
    readonly segments: readonly string[];
    readonly req: IncomingMessage;
    readonly res: ServerResponse;
}, context: RouteContext) => Promise<void> | void;
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
export declare function registerSkillsMarketHubRoutes(webServer: WebServerLike, gate: GateSource, context: RouteContext, routes: ReadonlyMap<string, RouteHandler>, ready: () => Promise<void>): () => void;
//# sourceMappingURL=web-routes.d.ts.map