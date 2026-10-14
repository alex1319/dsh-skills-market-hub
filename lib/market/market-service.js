/**
 * Market aggregation: filters, paging, and the install-state annotation.
 *
 * This module is the one place that decides what a reader sees. Three rules
 * shape it:
 *
 *  - **Install state is recomputed on every request, never cached.** Upstream
 *    data is cacheable because it changes on someone else's schedule; whether a
 *    skill is on *this* disk changes the moment a user installs or deletes one,
 *    and a stale answer either re-downloads a skill the reader already has or
 *    hides one they kept.
 *  - **A slug that cannot become a directory name is not installable**, and the
 *    reason is reported rather than the entry being dropped: hiding it would
 *    look like a bug in the marketplace.
 *  - **Filtering happens before paging.** Paging a filtered list by slicing the
 *    unfiltered one produces pages that are short, or empty, while more matches
 *    exist behind them.
 */
import { cacheKey } from "./cache.js";
import { dedupeSkills, sortByDownloads } from "./dedupe.js";
import { detectMarketLanguage, MARKET_LIMITS, sanitizeDirName, skillId } from "./types.js";
/** A lookup that reports nothing installed (before the first scan completes). */
export const EMPTY_INSTALLED_LOOKUP = {
    has: () => false,
    info: () => undefined,
};
let installed = EMPTY_INSTALLED_LOOKUP;
/** Install the local inventory lookup. Called by the host half after each scan. */
export function setInstalledLookup(next) {
    installed = next;
}
/** Restore the empty lookup (unload). */
export function resetInstalledLookup() {
    installed = EMPTY_INSTALLED_LOOKUP;
}
/** The lookup in force, for callers that need it directly. */
export function installedLookup() {
    return installed;
}
/**
 * Decide one entry's install state.
 *
 * @param skill - the upstream entry.
 * @returns the state plus, when it is not installable, the reason.
 */
export function annotateInstallState(skill) {
    const dirName = sanitizeDirName(skill.slug);
    if (dirName === null) {
        return { installState: 'not-installable', notInstallableReason: 'invalid-name' };
    }
    const id = skillId(skill.source, skill.slug);
    if (installed.has(id)) {
        const info = installed.info(id);
        return {
            installState: 'installed',
            installedInfo: {
                dirName: info?.dirName ?? dirName,
                ...(info?.version === undefined ? {} : { version: info.version }),
                ...(info?.installedAt === undefined ? {} : { installedAt: info.installedAt }),
            },
        };
    }
    return { installState: 'installable' };
}
/** Apply {@link annotateInstallState} to a page. */
export function annotatePage(skills) {
    return skills.map((skill) => ({ ...skill, ...annotateInstallState(skill) }));
}
/**
 * Tighten an entry's install state from its file inventory.
 *
 * Called once the file list is known — at detail time, and again immediately
 * before an install. `not-installable` here is a *hard* finding: the skill
 * cannot be written to disk (no `SKILL.md`, too many files, a file over the
 * per-file limit), as opposed to an advisory one.
 */
export function applyFileLimits(skill, files) {
    if (skill.installState === 'installed')
        return skill;
    const hasSkillFile = files.some((file) => file.path.toLowerCase() === 'skill.md');
    if (files.length === 0 || !hasSkillFile) {
        return { ...skill, installState: 'not-installable', notInstallableReason: 'empty-file-list' };
    }
    if (files.length > MARKET_LIMITS.maxFileCount) {
        return { ...skill, installState: 'not-installable', notInstallableReason: 'too-many-files' };
    }
    if (files.some((file) => file.size > MARKET_LIMITS.maxFileSize)) {
        return { ...skill, installState: 'not-installable', notInstallableReason: 'file-too-large' };
    }
    const total = files.reduce((sum, file) => sum + file.size, 0);
    if (total > MARKET_LIMITS.maxTotalSize) {
        return { ...skill, installState: 'not-installable', notInstallableReason: 'too-many-files' };
    }
    return skill;
}
/**
 * Case- and width-insensitive match, plus a containment test.
 *
 * `NFKC` folds full-width and compatibility characters so a search for "pdf"
 * matches a name written with full-width letters, and the markdown emphasis many
 * skills put in their `description` (`**Fetch** forecasts`) is stripped before
 * comparison — otherwise searching for the visible word would miss.
 */
function normalizeForSearch(text) {
    return text
        .normalize('NFKC')
        .toLowerCase()
        .replace(/[*_`~]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}
/** Whether an entry matches the free-text query. */
function matchesQuery(skill, query) {
    // Every whitespace-separated term must appear somewhere; a multi-word query is
    // an AND, which is what readers expect from "weather api".
    const terms = normalizeForSearch(query).split(' ').filter((term) => term !== '');
    if (terms.length === 0)
        return true;
    const haystack = normalizeForSearch([
        skill.name,
        skill.slug,
        skill.summary,
        skill.author.handle,
        skill.author.displayName ?? '',
        skill.tags.join(' '),
    ].join(' '));
    return terms.every((term) => haystack.includes(term));
}
/**
 * Apply every filter.
 *
 * @param skills - the candidate page.
 * @param query - the resolved query.
 * @returns the matching entries, in input order.
 */
export function filterSkills(skills, query) {
    const text = query.q?.trim() ?? '';
    return skills.filter((skill) => {
        if (query.source !== 'all' && skill.source !== query.source)
            return false;
        if (query.security !== 'all' && skill.securityStatus !== query.security)
            return false;
        if (query.installed === 'installed' && skill.installState !== 'installed')
            return false;
        if (query.installed === 'installable' && skill.installState !== 'installable')
            return false;
        if (text !== '' && !matchesQuery(skill, text))
            return false;
        return true;
    });
}
/**
 * Slice one page out of a known-length list.
 *
 * Cursors produced here are `catalog:<offset>` strings; {@link parseOffsetCursor}
 * is the only reader, and it refuses anything else so a client cannot splice a
 * provider cursor into a local page.
 */
export function paginate(skills, limit, cursor) {
    const offset = parseOffsetCursor(cursor);
    const start = Math.max(0, Math.min(offset, skills.length));
    const end = Math.min(start + limit, skills.length);
    const items = skills.slice(start, end);
    return {
        items,
        nextCursor: end < skills.length ? `catalog:${end}` : null,
        total: skills.length,
    };
}
/** Read a `catalog:<offset>` cursor; an absent one means the first page. */
export function parseOffsetCursor(cursor) {
    if (cursor === undefined || cursor === '')
        return 0;
    const match = /^catalog:(\d+)$/.exec(cursor);
    if (match === null)
        return 0;
    const parsed = Number.parseInt(match[1], 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}
let providers = {};
/** Install the provider table. Called once from `apply()`. */
export function setProviders(next) {
    providers = next;
}
let cache = null;
/** Install the cache instance. Called once from `apply()`. */
export function setMarketCache(next) {
    cache = next;
}
/** The cache in force, for callers that need its counters. */
export function marketCache() {
    return cache;
}
/**
 * Counters behind every "served from cache" claim.
 *
 * A composition without a cache reports a table of zeroes rather than throwing:
 * the diagnostics endpoint answering `0` is the truth — nothing was cached.
 */
export function getMarketStats(instance = cache) {
    return instance?.stats() ?? {
        hits: 0,
        misses: 0,
        staleServed: 0,
        upstreamRequests: 0,
        forcedRefreshes: 0,
        writes: 0,
        writeFailures: 0,
    };
}
/** One provider by source, or `undefined` when the composition has none. */
export function provider(source) {
    return providers[source];
}
/**
 * Read one skill's detail through the cache, then annotate it.
 *
 * The annotation runs *after* the cache on purpose: the cached payload is the
 * upstream record, and the local facts are added fresh on every read.
 */
export async function getMarketSkillDetail(source, slug, options = {}) {
    const target = providers[source];
    if (target === undefined) {
        throw new Error(`no provider is configured for source ${source}`);
    }
    const key = cacheKey('detail', [source, slug, options.owner]);
    const read = await readWithCache(key, source, options, () => target.detail(slug, {
        ...(options.owner === undefined ? {} : { owner: options.owner }),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
    }));
    return { ...read.value, ...annotateInstallState(read.value) };
}
/**
 * Read through the cache instance, or go straight to upstream when the
 * composition has no cache (a test harness, or a profile where the cache
 * directory could not be prepared).
 */
async function readWithCache(key, source, options, load) {
    if (cache === null)
        return { value: await load(), fetchedAt: Date.now(), fromCache: false };
    return cache.readThrough({
        key,
        source,
        ...(options.force === undefined ? {} : { force: options.force }),
        ...(options.allowStale === undefined ? {} : { allowStale: options.allowStale }),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
        load,
    });
}
/**
 * Read one skill file through the cache.
 *
 * A preview is truncated to the documented limit *after* the cache, so the cached
 * record is the document as upstream served it and a later, larger preview limit
 * does not have to re-fetch everything.
 */
export async function getMarketFileContent(source, slug, filePath, options = {}) {
    const target = providers[source];
    if (target === undefined) {
        throw new Error(`no provider is configured for source ${source}`);
    }
    const key = cacheKey('file', [source, slug, filePath, options.owner]);
    const read = await readWithCache(key, source, options, () => target.fetchFile(slug, {
        path: filePath,
        ...(options.owner === undefined ? {} : { owner: options.owner }),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
    }));
    const truncated = Buffer.byteLength(read.value.content, 'utf8') > MARKET_LIMITS.previewTruncateBytes;
    return {
        path: filePath,
        content: truncated ? read.value.content.slice(0, MARKET_LIMITS.previewTruncateBytes) : read.value.content,
        language: detectMarketLanguage(filePath),
        size: read.value.size,
        truncated,
    };
}
/** Run every requested source's list or search, and merge the results. */
export async function listMarketSkills(query, cursor, status) {
    const requested = query.source === 'all' ? ['clawhub', 'skillhub'] : [query.source];
    const pages = await Promise.all(requested.map(async (source) => {
        const target = providers[source];
        if (target === undefined)
            return { source, items: [], nextCursor: undefined };
        // A source missing from the decoded cursor has no further pages: resuming a
        // merged list must not re-request pages the reader already passed.
        const position = cursor[source];
        if (query.cursor !== undefined && position === undefined) {
            return { source, items: [], nextCursor: undefined };
        }
        const limit = query.q === undefined ? query.limit : Math.max(query.limit, MARKET_LIMITS.searchResultCap);
        const result = query.q === undefined
            ? await target.list({ ...(position === undefined ? {} : { cursor: position }), limit })
            : await target.search({ q: query.q, ...(position === undefined ? {} : { cursor: position }), limit });
        return { source, items: result.items, nextCursor: result.nextCursor };
    }));
    const merged = sortByDownloads(annotatePage(dedupeSkills(pages.flatMap((page) => page.items))));
    const filtered = filterSkills(merged, query);
    const nextCursor = {};
    for (const page of pages) {
        if (page.nextCursor !== undefined && page.nextCursor !== '')
            nextCursor[page.source] = page.nextCursor;
    }
    return {
        items: filtered.slice(0, query.limit),
        // The cursor describes where upstream stopped, not where the filtered view
        // ended: the next request re-filters a fresh upstream page.
        nextCursor: Object.keys(nextCursor).length > 0
            ? Buffer.from(JSON.stringify(nextCursor), 'utf8').toString('base64url')
            : null,
        sources: status,
    };
}
/** Sources the plugin can serve, for the status endpoint and the panel's filter bar. */
export function configuredSources() {
    return ['clawhub', 'skillhub'].filter((source) => providers[source] !== undefined);
}
/** Curated category list; empty until a catalogue ships with the package. */
export function listMarketCategories() {
    return { items: [], status: { status: 'ok', fromCache: true } };
}
//# sourceMappingURL=market-service.js.map