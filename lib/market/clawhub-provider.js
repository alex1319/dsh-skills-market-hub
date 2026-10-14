/**
 * ClawHub provider (https://clawhub.ai).
 *
 * Endpoints, all verified against captured responses (`tests/fixtures/market/`)
 * and by direct probe:
 *
 *   GET /api/v1/skills?limit=&sort=downloads[&cursor=]  → { items, nextCursor }
 *   GET /api/v1/search?q=                               → { results }  (no paging)
 *   GET /api/v1/skills/{slug}[?owner=]                  → { skill, latestVersion, owner, moderation }
 *   GET /api/v1/skills/{slug}/versions/{v}[?owner=]     → { version: { license, files[], security } }
 *   GET /api/v1/skills/{slug}/file?path=[&owner=]       → raw text
 *
 * Shape traps this module absorbs — each one observed in a real response:
 *
 *  - **Slugs are not unique.** The registry answers an ambiguous slug with
 *    `409 { code: 'AMBIGUOUS_SKILL_SLUG', matches: [{ ownerHandle }] }`. Without
 *    an owner the request is simply unanswerable, so this provider reports the
 *    candidates instead of guessing one — installing another author's bytes
 *    because their slug was more popular is not a recoverable mistake.
 *  - **`nextCursor` is a JSON string inside a JSON string.** Its inner `key`
 *    array contains values that appear nowhere in the payload, so it has to be
 *    passed back verbatim; it cannot be reconstructed.
 *  - **`tags.latest` is the version string**, not a list of tags. The same key on
 *    a search result's nested skill is a version *id*, which is why this module
 *    never reads tags from search results.
 *  - **Search aggregates other registries.** Results carry `source` and
 *    `install.kind`; entries whose `native` is null are not ClawHub skills and
 *    must not be offered as installable ClawHub slugs.
 *  - **The cursor query parameter is undocumented in the payload.** The list
 *    endpoint is called with `cursor`, which is the only spelling the registry
 *    accepts for the value it hands back.
 */
import { detectMarketLanguage, MARKET_LIMITS, skillId, } from "./types.js";
import { providerFetch, providerFetchJson, providerUrl, MarketUpstreamError, UPSTREAM_ERROR_CODES } from "./provider-fetch.js";
import { splitFrontmatter, stripFrontmatter, toSummary } from "./frontmatter.js";
export const SOURCE = 'clawhub';
/** Author handles are the registry's own identifier shape. */
export const CLAWHUB_OWNER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
/** Page size cap the registry tolerates. */
const MAX_PAGE_SIZE = 100;
/** Longest `q` accepted before the request is refused. */
const MAX_QUERY_LENGTH = 200;
// ── Small readers ───────────────────────────────────────────────────────────
function asString(value) {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed === '' ? undefined : trimmed;
    }
    if (typeof value === 'number' && Number.isFinite(value))
        return String(value);
    return undefined;
}
function asNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
function asRecord(value) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        return value;
    }
    return undefined;
}
function asArray(value) {
    return Array.isArray(value) ? value : [];
}
/** Topic strings, which the registry uses where SkillHub uses tag arrays. */
function topicsOf(value) {
    return asArray(value).filter((entry) => typeof entry === 'string' && entry.trim() !== '');
}
/** The human page for a skill; requires the owner, because the slug alone is ambiguous. */
function pageUrl(owner, slug) {
    return owner === undefined
        ? `https://clawhub.ai/skills/${encodeURIComponent(slug)}`
        : `https://clawhub.ai/${encodeURIComponent(owner)}/skills/${encodeURIComponent(slug)}`;
}
/**
 * Read `tags.latest`, which is a version string on the list and detail shapes.
 *
 * It is deliberately *not* read from search results: there the same key holds an
 * internal version id (`k97cz981…`), and showing that as a version would print a
 * database key under the word "version".
 */
function latestVersionString(tags, fallback) {
    const direct = asString(fallback);
    if (direct !== undefined)
        return direct;
    const record = asRecord(tags);
    return asString(record?.latest);
}
// ── Ambiguity ───────────────────────────────────────────────────────────────
/**
 * One ClawHub slug resolving to several authors.
 *
 * The route layer reports this as a 409 so the panel can ask which author the
 * reader meant, rather than silently picking the most downloaded one.
 */
export class AmbiguousSkillSlugError extends Error {
    slug;
    owners;
    constructor(slug, 
    /** Author handles that publish this slug, most downloaded first. */
    owners) {
        super(`the slug "${slug}" is published by ${owners.length} authors; specify one of: ${owners.join(', ')}`);
        this.slug = slug;
        this.owners = owners;
        this.name = 'AmbiguousSkillSlugError';
    }
}
/**
 * Turn a 409 into the ambiguity signal, and anything else into an upstream error.
 *
 * The registry can also answer 409 for a non-ambiguity conflict; the body's
 * `code` is what distinguishes them, so a missing `matches` array degrades to a
 * plain upstream error instead of claiming the reader must choose an author.
 */
function rejectionFor(slug, status, body) {
    let parsed;
    try {
        parsed = JSON.parse(body);
    }
    catch {
        parsed = undefined;
    }
    if (status === 409 && parsed?.code === 'AMBIGUOUS_SKILL_SLUG') {
        const owners = asArray(parsed.matches)
            .map((match) => asString(asRecord(match)?.ownerHandle))
            .filter((owner) => owner !== undefined);
        if (owners.length > 0)
            return new AmbiguousSkillSlugError(slug, owners);
    }
    return new MarketUpstreamError(SOURCE, status === 404 ? UPSTREAM_ERROR_CODES.badResponse : UPSTREAM_ERROR_CODES.error, `clawhub answered ${status} for ${slug}`);
}
// ── Normalization ───────────────────────────────────────────────────────────
/** Whether a search result is a native ClawHub skill rather than an aggregated one. */
export function isNativeSearchResult(raw) {
    // `native === null` is the most reliable discriminator the registry offers: the
    // aggregated rows carry `native: null` while native rows always carry the object.
    if (raw.native !== undefined && raw.native !== null)
        return true;
    const kind = asString(asRecord(raw.install)?.kind);
    if (kind !== undefined)
        return kind === 'clawhub';
    return asString(raw.source) === 'clawhub';
}
/** Normalize one `/api/v1/skills` list entry. */
export function normalizeListItem(raw) {
    const slug = asString(raw.slug);
    const owner = asString(raw.ownerHandle);
    if (slug === undefined || owner === undefined)
        return null;
    const stats = asRecord(raw.stats) ?? {};
    const latest = asRecord(raw.latestVersion);
    const version = latestVersionString(raw.tags, latest?.version);
    const updatedAt = asNumber(raw.updatedAt) ?? asNumber(latest?.createdAt);
    return {
        id: skillId(SOURCE, slug),
        source: SOURCE,
        slug,
        name: asString(raw.displayName) ?? slug,
        // The list summary is already truncated upstream; if it is absent, the
        // shortest honest answer is an empty string rather than a title repeat.
        summary: toSummary(asString(raw.summary) ?? ''),
        author: { handle: owner },
        stats: {
            downloads: asNumber(stats.downloads) ?? 0,
            ...(asNumber(stats.installs) === undefined ? {} : { installs: asNumber(stats.installs) }),
            ...(asNumber(stats.stars) === undefined ? {} : { stars: asNumber(stats.stars) }),
        },
        tags: topicsOf(raw.topics),
        securityStatus: 'unknown',
        installState: 'installable',
        ...(version === undefined ? {} : { version }),
        ...(updatedAt === undefined ? {} : { updatedAt }),
        ...(asString(latest?.license) === undefined ? {} : { license: asString(latest?.license) }),
    };
}
/** Normalize one `/api/v1/search` result. */
export function normalizeSearchResult(raw) {
    const slug = asString(raw.slug);
    const owner = asString(raw.ownerHandle) ?? asString(asRecord(raw.owner)?.handle) ?? asString(asRecord(raw.publisher)?.handle);
    if (slug === undefined || owner === undefined)
        return null;
    const downloads = asNumber(raw.downloads) ?? 0;
    const updatedAt = asNumber(raw.updatedAt) ?? asNumber(asRecord(asRecord(raw.metrics))?.updatedAt);
    const nativeSkill = asRecord(raw.native) ? asRecord(asRecord(raw.native)?.skill) : undefined;
    const nativeStats = asRecord(nativeSkill?.stats) ?? {};
    return {
        id: skillId(SOURCE, slug),
        source: SOURCE,
        slug,
        name: asString(raw.displayName) ?? slug,
        summary: toSummary(asString(raw.summary) ?? ''),
        author: {
            handle: owner,
            ...(asString(asRecord(raw.owner)?.displayName) === undefined
                ? {}
                : { displayName: asString(asRecord(raw.owner)?.displayName) }),
        },
        stats: {
            downloads,
            ...(asNumber(nativeStats.installs) === undefined ? {} : { installs: asNumber(nativeStats.installs) }),
            ...(asNumber(nativeStats.stars) === undefined ? {} : { stars: asNumber(nativeStats.stars) }),
        },
        // Topics live on the nested native skill; the flat result has none.
        tags: topicsOf(nativeSkill?.topics),
        securityStatus: 'unknown',
        installState: 'installable',
        ...(updatedAt === undefined ? {} : { updatedAt }),
        ...(asString(asRecord(raw.publisher)?.official) === undefined && typeof asRecord(raw.publisher)?.official !== 'boolean'
            ? {}
            : { verified: asRecord(raw.publisher)?.official === true }),
    };
}
/**
 * Map a ClawHub version's security block onto the shared vocabulary.
 *
 * The three scanners the registry publishes (VirusTotal, SkillSpector, and an LLM
 * review) each become a report row.
 *
 * Ordering matters here. A scanner finding is evaluated **before** the block's own
 * `status` field, because the two can disagree: a block that calls itself
 * `benign` while one of its scanners returned a verdict this plugin does not
 * recognise is exactly the case where a naive "declared status wins" reading
 * would put a green chip on an unscanned-by-us skill.
 *
 * An unrecognised verdict is `flagged`, never `unknown`: `unknown` is the panel's
 * word for "not scanned", and a scanner that said something unintelligible is not
 * the same thing.
 */
export function parseClawhubSecurity(security) {
    const record = asRecord(security);
    if (record === undefined)
        return { status: 'unknown', reports: [] };
    const reports = [];
    const scanners = asRecord(record.scanners);
    for (const [vendor, entry] of Object.entries(scanners ?? {})) {
        const scanner = asRecord(entry);
        if (scanner === undefined)
            continue;
        const status = asString(scanner.status) ?? 'unknown';
        const summary = asString(scanner.summary) ?? asString(scanner.statusText);
        const reportUrl = asString(scanner.url) ?? asString(scanner.reportUrl);
        reports.push({
            vendor,
            status,
            statusText: asString(scanner.statusText) ?? status,
            ...(summary === undefined ? {} : { summary }),
            ...(reportUrl === undefined ? {} : { reportUrl }),
        });
    }
    const virustotal = asString(record.virustotalUrl);
    if (virustotal !== undefined && !reports.some((report) => report.reportUrl === virustotal)) {
        reports.push({
            vendor: 'virustotal',
            status: asString(record.status) ?? 'unknown',
            statusText: 'VirusTotal',
            reportUrl: virustotal,
        });
    }
    // A scanner finding outranks the block's own summary verdict.
    const benignVerdicts = new Set(['benign', 'clean', 'safe', 'pass', 'ok']);
    const statuses = reports.map((report) => report.status.toLowerCase());
    if (statuses.some((status) => !benignVerdicts.has(status))) {
        return { status: 'flagged', reports };
    }
    const declared = asString(record.status)?.toLowerCase();
    if (declared !== undefined) {
        if (declared === 'malicious' || declared === 'blocked' || declared === 'suspicious') {
            return { status: 'flagged', reports };
        }
        if (declared === 'verified')
            return { status: 'verified', reports };
        if (benignVerdicts.has(declared))
            return { status: 'benign', reports };
        // An unrecognised declared verdict with no contradicting scanner still means
        // a human should look, not that the skill is clean.
        return { status: 'flagged', reports };
    }
    if (reports.length === 0)
        return { status: 'unknown', reports };
    return { status: 'benign', reports };
}
/** Normalize the detail response. */
export function normalizeDetail(raw, slug, requestedOwner) {
    const skill = asRecord(raw.skill) ?? {};
    const latest = asRecord(raw.latestVersion);
    const owner = asRecord(raw.owner);
    const stats = asRecord(skill.stats) ?? {};
    const ownerHandle = asString(owner?.handle) ?? requestedOwner ?? 'unknown';
    const updatedAt = asNumber(skill.updatedAt) ?? asNumber(latest?.createdAt) ?? asNumber(skill.createdAt);
    const version = latestVersionString(skill.tags, latest?.version);
    const license = asString(latest?.license);
    const changelog = asString(latest?.changelog);
    const description = asString(skill.description) ?? '';
    return {
        id: skillId(SOURCE, slug),
        source: SOURCE,
        slug,
        name: asString(skill.displayName) ?? slug,
        // The long-form description follows; `summary` is the registry's own short line.
        summary: toSummary(asString(skill.summary) ?? ''),
        author: {
            handle: ownerHandle,
            ...(asString(owner?.displayName) === undefined ? {} : { displayName: asString(owner?.displayName) }),
            ...(asString(owner?.image) === undefined ? {} : { avatarUrl: asString(owner?.image) }),
        },
        stats: {
            downloads: asNumber(stats.downloads) ?? 0,
            ...(asNumber(stats.installs) === undefined ? {} : { installs: asNumber(stats.installs) }),
            ...(asNumber(stats.stars) === undefined ? {} : { stars: asNumber(stats.stars) }),
        },
        tags: topicsOf(skill.topics),
        securityStatus: 'unknown',
        installState: 'installable',
        ...(version === undefined ? {} : { version }),
        ...(updatedAt === undefined ? {} : { updatedAt }),
        ...(asString(skill.icon) === undefined ? {} : { iconUrl: asString(skill.icon) }),
        // The detail body is a full SKILL.md; its frontmatter is surfaced separately
        // so the reader sees prose, and the metadata panel sees the parsed header.
        description: stripFrontmatter(description),
        descriptionFrontmatter: splitFrontmatter(description).meta,
        ...(license === undefined ? {} : { license }),
        files: [],
        totalSize: 0,
        ...(changelog === undefined ? {} : { changelog: { text: changelog, ...(version === undefined ? {} : { version }) } }),
        pageUrl: pageUrl(ownerHandle === 'unknown' ? undefined : ownerHandle, slug),
    };
}
/** Normalize a version's file inventory. */
export function normalizeFiles(files) {
    const out = [];
    for (const entry of asArray(files)) {
        const file = asRecord(entry);
        if (file === undefined)
            continue;
        const path = asString(file.path);
        if (path === undefined)
            continue;
        const size = asNumber(file.size) ?? 0;
        const sha256 = asString(file.sha256);
        const contentType = asString(file.contentType);
        out.push({
            path,
            size,
            language: detectMarketLanguage(path),
            tooBig: size > MARKET_LIMITS.maxFileSize,
            ...(sha256 === undefined ? {} : { sha256 }),
            ...(contentType === undefined ? {} : { contentType }),
        });
    }
    return out;
}
// ── Provider ────────────────────────────────────────────────────────────────
export const clawhubProvider = {
    source: SOURCE,
    // One slug is published under many authors here, so an `owner` argument selects
    // which skill is meant rather than merely labelling it.
    pinsOwner: true,
    async list({ cursor, limit, signal }) {
        const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, limit));
        const { value } = await providerFetchJson(SOURCE, providerUrl(SOURCE, '/api/v1/skills'), {
            // `sort=downloads` is what the index name in `nextCursor` refers to; changing
            // it would invalidate a cursor handed out for the previous ordering.
            query: { limit: pageSize, sort: 'downloads', ...(cursor === undefined ? {} : { cursor }) },
            ...(signal === undefined ? {} : { signal }),
        });
        const items = asArray(value.items)
            .map((entry) => normalizeListItem(entry))
            .filter((entry) => entry !== null);
        // The registry reports no total; a short page is the only end signal, and the
        // opaqueness of the cursor means it is passed back verbatim or not at all.
        const next = asString(value.nextCursor);
        return { items, ...(next === undefined ? {} : { nextCursor: next }) };
    },
    async search({ q, limit, signal }) {
        const query = q.trim().slice(0, MAX_QUERY_LENGTH);
        if (query === '')
            return this.list({ limit, ...(signal === undefined ? {} : { signal }) });
        const { value } = await providerFetchJson(SOURCE, providerUrl(SOURCE, '/api/v1/search'), {
            query: { q: query },
            ...(signal === undefined ? {} : { signal }),
        });
        const items = asArray(value.results)
            .map((entry) => entry)
            // Aggregated rows from other registries are not installable ClawHub slugs.
            .filter((entry) => isNativeSearchResult(entry))
            .map((entry) => normalizeSearchResult(entry))
            .filter((entry) => entry !== null);
        // Search has no pagination field at all, so the caller caps the merged list.
        return { items: items.slice(0, Math.min(MAX_PAGE_SIZE, Math.max(1, limit))) };
    },
    async detail(slug, { owner, signal }) {
        const path = `/api/v1/skills/${encodeURIComponent(slug)}`;
        const response = await providerFetch(SOURCE, providerUrl(SOURCE, path), {
            query: { ...(owner === undefined ? {} : { owner }) },
            ...(signal === undefined ? {} : { signal }),
        });
        if (!response.ok)
            throw rejectionFor(slug, response.status, response.text);
        let raw;
        try {
            raw = JSON.parse(response.text);
        }
        catch {
            throw new MarketUpstreamError(SOURCE, UPSTREAM_ERROR_CODES.badResponse, `clawhub answered a non-JSON detail body for ${slug}`);
        }
        const resolvedOwner = asString(asRecord(raw.owner)?.handle) ?? owner;
        const detail = normalizeDetail(raw, slug, resolvedOwner);
        // The version block carries the license, the file inventory, and the security
        // scan. A failure here must not cost the reader the detail they asked for:
        // the page renders without a file list, and the install path re-reads the
        // inventory itself before writing anything.
        const version = detail.version;
        if (version === undefined)
            return detail;
        try {
            const { value } = await providerFetchJson(SOURCE, providerUrl(SOURCE, `${path}/versions/${encodeURIComponent(version)}`), { query: { ...(resolvedOwner === undefined ? {} : { owner: resolvedOwner }) }, ...(signal === undefined ? {} : { signal }) });
            const versionBody = asRecord(value.version) ?? {};
            const files = normalizeFiles(versionBody.files);
            const security = parseClawhubSecurity(versionBody.security);
            return {
                ...detail,
                files,
                totalSize: files.reduce((sum, file) => sum + file.size, 0),
                securityStatus: security.status,
                ...(security.reports.length === 0 ? {} : { securityReports: security.reports }),
                ...(asString(versionBody.license) === undefined ? {} : { license: asString(versionBody.license) }),
                ...(asString(versionBody.changelog) === undefined ? {} : { changelog: { text: asString(versionBody.changelog), version } }),
            };
        }
        catch (error) {
            if (error instanceof AmbiguousSkillSlugError)
                throw error;
            return detail;
        }
    },
    async listFiles(slug, { version, owner, signal }) {
        if (version === undefined) {
            // Without a version there is no inventory endpoint; the detail read supplies
            // one, and the install path always resolves a version first.
            throw new MarketUpstreamError(SOURCE, UPSTREAM_ERROR_CODES.error, `no version is known for ${slug}`);
        }
        const { value } = await providerFetchJson(SOURCE, providerUrl(SOURCE, `/api/v1/skills/${encodeURIComponent(slug)}/versions/${encodeURIComponent(version)}`), { query: { ...(owner === undefined ? {} : { owner }) }, ...(signal === undefined ? {} : { signal }) });
        return normalizeFiles(asRecord(value.version)?.files);
    },
    async fetchFile(slug, { path: filePath, owner, signal }) {
        const response = await providerFetch(SOURCE, providerUrl(SOURCE, `/api/v1/skills/${encodeURIComponent(slug)}/file`), {
            query: { path: filePath, ...(owner === undefined ? {} : { owner }) },
            maxBytes: MARKET_LIMITS.maxFileSize,
            // The endpoint answers raw markdown or text, never JSON.
            accept: 'text/plain, text/markdown, */*',
            ...(signal === undefined ? {} : { signal }),
        });
        if (!response.ok)
            throw rejectionFor(slug, response.status, response.text);
        return { content: response.text, size: response.bytes };
    },
};
//# sourceMappingURL=clawhub-provider.js.map