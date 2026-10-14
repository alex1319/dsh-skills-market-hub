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
/** Path prefix of the whole Skills Market API. */
export const ROUTE_PREFIX = '/api/skills-market-hub';
/** Request bodies here are small field objects; anything larger is an attack. */
const MAX_BODY_BYTES = 64 * 1024;
/**
 * A rejection produced by this module itself: status, envelope code and headers.
 *
 * Exported so the feature modules raise failures in the same vocabulary rather
 * than inventing their own error shapes.
 */
export class RouteError extends Error {
    status;
    code;
    allow;
    constructor(status, code, message, allow) {
        super(message);
        this.name = 'RouteError';
        this.status = status;
        this.code = code;
        this.allow = allow;
    }
}
/** One JSON response; the only place a body is written. */
export function sendJson(res, status, payload, headers) {
    if (res.headersSent) {
        res.destroy();
        return;
    }
    res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        ...headers,
    });
    res.end(JSON.stringify(payload));
}
export function errorPayload(code, message) {
    return { error: { code, message } };
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
function toHttpFailure(error) {
    if (error instanceof RouteError) {
        return { status: error.status, code: error.code, message: error.message, allow: error.allow };
    }
    const operation = asOperationError(error);
    if (operation !== undefined) {
        return { status: operation.status, code: operation.code, message: operation.message, allow: operation.allow };
    }
    return { status: 500, code: 'INTERNAL_ERROR', message: 'internal error', allow: undefined };
}
/**
 * Structural recognition of an install-service failure.
 *
 * `instanceof` would need this module to import the install service, which pulls
 * the filesystem layer into the transport's import graph for the sake of one
 * check. The shape is narrow enough to test directly, and a false positive is
 * impossible for an error that carries a valid HTTP status and a code string.
 */
function asOperationError(error) {
    if (typeof error !== 'object' || error === null)
        return undefined;
    const candidate = error;
    if (typeof candidate.status !== 'number')
        return undefined;
    if (typeof candidate.code !== 'string' || candidate.code === '')
        return undefined;
    if (typeof candidate.message !== 'string')
        return undefined;
    return {
        status: candidate.status,
        code: candidate.code,
        message: candidate.message,
        allow: candidate.status === 405 ? 'POST' : undefined,
    };
}
/** Answer one thrown value; the single exit for every failure path. */
export function sendFailure(res, error) {
    const failure = toHttpFailure(error);
    sendJson(res, failure.status, errorPayload(failure.code, failure.message), failure.allow === undefined ? undefined : { allow: failure.allow });
}
/**
 * Run the browser-trust gate and return the rejection status, if any.
 *
 * A gate that throws is treated as a rejection: failing closed is the only
 * defensible reading for a security fence, and an exception from the fence must
 * not turn into "serve the request anyway".
 */
function evaluateGate(gate, req, res) {
    let outcome;
    try {
        outcome = gate.requestRejection(req, res);
    }
    catch {
        return 403;
    }
    if (outcome === undefined || outcome === false || outcome === null)
        return undefined;
    return typeof outcome === 'number' ? outcome : 403;
}
/**
 * Read a bounded JSON object body.
 *
 * An oversized body stops being buffered immediately and the socket is drained,
 * so a hostile `Content-Length` cannot pin memory in the host process.
 */
export async function readJsonBody(req, maxBytes = MAX_BODY_BYTES) {
    const raw = await new Promise((resolve, reject) => {
        let size = 0;
        let settled = false;
        const chunks = [];
        const finish = (error) => {
            if (settled)
                return;
            settled = true;
            req.off('data', onData);
            req.off('end', onEnd);
            req.off('aborted', onAborted);
            req.off('error', onError);
            if (error !== undefined) {
                chunks.length = 0;
                req.once('error', () => undefined);
                req.resume();
                reject(error);
                return;
            }
            resolve(Buffer.concat(chunks).toString('utf8'));
        };
        const onData = (chunk) => {
            const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            size += part.length;
            if (size > maxBytes) {
                finish(new RouteError(400, 'BAD_REQUEST', `Request body exceeds ${maxBytes} bytes`));
            }
            else {
                chunks.push(part);
            }
        };
        const onEnd = () => finish();
        const onAborted = () => finish(new RouteError(400, 'BAD_REQUEST', 'Request body was aborted'));
        const onError = () => finish(new RouteError(400, 'BAD_REQUEST', 'Invalid request body'));
        req.on('data', onData);
        req.once('end', onEnd);
        req.once('aborted', onAborted);
        req.once('error', onError);
    });
    let value;
    try {
        value = raw.trim() === '' ? {} : JSON.parse(raw);
    }
    catch {
        throw new RouteError(400, 'BAD_REQUEST', 'Invalid JSON body');
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new RouteError(400, 'BAD_REQUEST', 'Body must be a JSON object');
    }
    return value;
}
/** Decode the path segments below {@link ROUTE_PREFIX}, rejecting malformed encoding. */
export function parseSegments(pathname) {
    if (pathname !== ROUTE_PREFIX && !pathname.startsWith(`${ROUTE_PREFIX}/`)) {
        throw new RouteError(404, 'NOT_FOUND', `Unknown route: ${pathname}`);
    }
    return pathname
        .slice(ROUTE_PREFIX.length)
        .split('/')
        .filter((segment) => segment !== '')
        .map((segment) => {
        try {
            return decodeURIComponent(segment);
        }
        catch {
            throw new RouteError(400, 'BAD_REQUEST', 'Malformed percent-encoding in the request path');
        }
    });
}
export function requireMethod(method, expected) {
    if (method !== expected) {
        throw new RouteError(405, 'METHOD_NOT_ALLOWED', `Method ${method} is not allowed here`, expected);
    }
}
/** Bounded optional string query parameter. */
export function optionalQuery(url, name, maxLength) {
    const value = url.searchParams.get(name)?.trim();
    if (value === undefined || value === '')
        return undefined;
    if (value.length > maxLength) {
        throw new RouteError(400, 'BAD_REQUEST', `Query parameter "${name}" exceeds ${maxLength} characters`);
    }
    return value;
}
/** Closed-set query parameter with a fallback. */
export function enumQuery(url, name, allowed, fallback) {
    const raw = url.searchParams.get(name);
    if (raw === null || raw === '')
        return fallback;
    if (allowed.includes(raw))
        return raw;
    throw new RouteError(400, 'BAD_REQUEST', `Invalid ${name} filter: ${raw}`);
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
export function parseRefresh(url) {
    const raw = url.searchParams.get('refresh');
    if (raw === null || raw === '' || raw === '0' || raw === 'false')
        return false;
    if (raw === '1' || raw === 'true')
        return true;
    throw new RouteError(400, 'BAD_REQUEST', `Invalid refresh flag: ${raw}`);
}
/** `limit` query parameter, clamped into the documented range. */
export function parseLimit(url, fallback) {
    const raw = url.searchParams.get('limit');
    if (raw === null || raw.trim() === '')
        return fallback;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed))
        throw new RouteError(400, 'BAD_REQUEST', `Invalid limit: ${raw}`);
    return Math.min(100, Math.max(1, parsed));
}
/** Reject anything that could escape a path when joined onto a URL or a file path. */
export function parseSlug(segment) {
    if (segment === undefined || segment === '')
        throw new RouteError(400, 'BAD_REQUEST', 'Missing skill slug');
    if (segment.length > 200)
        throw new RouteError(400, 'BAD_REQUEST', 'Skill slug is too long');
    if (segment.includes('/') || segment.includes('\\') || segment.includes('..')) {
        throw new RouteError(400, 'BAD_REQUEST', `Invalid skill slug: ${segment}`);
    }
    return segment;
}
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
export function registerSkillsMarketHubRoutes(webServer, gate, context, routes, ready) {
    return webServer.register({
        kind: 'prefix',
        path: ROUTE_PREFIX,
        handler: async (req, res) => {
            try {
                // Raw web routes bypass the Connection fence; ask it before doing any
                // work. Resolved per request, never captured at registration time.
                const resolvedGate = gate();
                if (resolvedGate !== undefined) {
                    const rejection = evaluateGate(resolvedGate, req, res);
                    if (rejection !== undefined) {
                        sendJson(res, rejection, errorPayload(rejection === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN', rejection === 401 ? 'unauthorized' : 'forbidden'));
                        return;
                    }
                }
                // The first local inventory scan must finish before any answer is
                // produced, or the panel would render every installed skill as
                // installable and invite the reader to download what they already have.
                await ready();
                const url = new URL(req.url ?? '/', 'http://localhost');
                const segments = parseSegments(url.pathname);
                const head = segments[0];
                const handler = head === undefined ? undefined : routes.get(head);
                if (handler === undefined) {
                    throw new RouteError(404, 'NOT_FOUND', `Unknown route: ${url.pathname}`);
                }
                await handler({ url, method: req.method ?? 'GET', segments, req, res }, context);
            }
            catch (error) {
                // Every rejection becomes the documented envelope: the transport keeps
                // working for the next request instead of letting the web server write
                // its own bodyless 400.
                sendFailure(res, error);
            }
        },
    });
}
//# sourceMappingURL=web-routes.js.map