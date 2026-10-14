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
import { type RouteContext, type RouteHandler } from './web-routes.ts';
/**
 * Whether a registry-supplied file path is safe to address.
 *
 * The strict reading — no absolute paths, no backslashes, no `..`, no NUL — is the
 * same rule the install path applies, so the preview endpoint refuses a path the
 * install would refuse rather than resolving it and reading something else.
 */
export declare function isSafeMarketFilePath(filePath: string): boolean;
/**
 * Build the dispatch table.
 *
 * A head segment absent from this map is a 404, which is why the map — not a
 * chain of `if`s — is the contract.
 */
export declare function createRoutes(): Map<string, RouteHandler>;
export type { RouteContext, RouteHandler };
//# sourceMappingURL=routes.d.ts.map