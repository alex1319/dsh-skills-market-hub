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
import { type MarketCache, type MarketCacheStats } from './cache.ts';
import type { MarketCursor } from './cursor.ts';
import type { InstallState, MarketCategory, MarketFileContent, MarketFileMeta, MarketListResult, MarketSource, NormalizedSkill, NormalizedSkillDetail, NotInstallableReason, SecurityStatus, SourceStatusInfo } from './types.ts';
/** What the market layer needs to know about locally installed skills. */
export interface InstalledLookup {
    /** Whether `source:slug` is present locally. */
    has(id: string): boolean;
    /** Version and directory of an installed skill, when known. */
    info(id: string): {
        version?: string;
        installedAt?: string;
        dirName: string;
    } | undefined;
}
/** A lookup that reports nothing installed (before the first scan completes). */
export declare const EMPTY_INSTALLED_LOOKUP: InstalledLookup;
/** Install the local inventory lookup. Called by the host half after each scan. */
export declare function setInstalledLookup(next: InstalledLookup): void;
/** Restore the empty lookup (unload). */
export declare function resetInstalledLookup(): void;
/** The lookup in force, for callers that need it directly. */
export declare function installedLookup(): InstalledLookup;
/**
 * Decide one entry's install state.
 *
 * @param skill - the upstream entry.
 * @returns the state plus, when it is not installable, the reason.
 */
export declare function annotateInstallState(skill: NormalizedSkill): {
    installState: InstallState;
    notInstallableReason?: NotInstallableReason;
    installedInfo?: NormalizedSkill['installedInfo'];
};
/** Apply {@link annotateInstallState} to a page. */
export declare function annotatePage(skills: readonly NormalizedSkill[]): NormalizedSkill[];
/**
 * Tighten an entry's install state from its file inventory.
 *
 * Called once the file list is known — at detail time, and again immediately
 * before an install. `not-installable` here is a *hard* finding: the skill
 * cannot be written to disk (no `SKILL.md`, too many files, a file over the
 * per-file limit), as opposed to an advisory one.
 */
export declare function applyFileLimits(skill: NormalizedSkill, files: readonly MarketFileMeta[]): NormalizedSkill;
export type SourceFilter = 'all' | MarketSource;
export type SecurityFilter = 'all' | SecurityStatus;
export type InstalledFilter = 'all' | 'installed' | 'installable';
export interface MarketQuery {
    q?: string;
    source: SourceFilter;
    security: SecurityFilter;
    installed: InstalledFilter;
    limit: number;
    cursor?: string;
    refresh?: boolean;
}
/**
 * Apply every filter.
 *
 * @param skills - the candidate page.
 * @param query - the resolved query.
 * @returns the matching entries, in input order.
 */
export declare function filterSkills(skills: readonly NormalizedSkill[], query: MarketQuery): NormalizedSkill[];
/** One page of a merged, annotated list, plus where to continue. */
export interface MarketPage {
    items: NormalizedSkill[];
    nextCursor: string | null;
    total?: number;
    sources: Record<MarketSource, SourceStatusInfo>;
}
/**
 * Slice one page out of a known-length list.
 *
 * Cursors produced here are `catalog:<offset>` strings; {@link parseOffsetCursor}
 * is the only reader, and it refuses anything else so a client cannot splice a
 * provider cursor into a local page.
 */
export declare function paginate(skills: readonly NormalizedSkill[], limit: number, cursor: string | undefined): {
    items: NormalizedSkill[];
    nextCursor: string | null;
    total: number;
};
/** Read a `catalog:<offset>` cursor; an absent one means the first page. */
export declare function parseOffsetCursor(cursor: string | undefined): number;
/** The provider contract the aggregation layer drives. */
export interface MarketProvider {
    readonly source: MarketSource;
    list(params: {
        cursor?: string;
        limit: number;
        signal?: AbortSignal;
    }): Promise<{
        items: NormalizedSkill[];
        nextCursor?: string;
        total?: number;
    }>;
    search(params: {
        q: string;
        cursor?: string;
        limit: number;
        signal?: AbortSignal;
    }): Promise<{
        items: NormalizedSkill[];
        nextCursor?: string;
        total?: number;
    }>;
    detail(slug: string, params: {
        owner?: string;
        signal?: AbortSignal;
    }): Promise<NormalizedSkillDetail>;
    listFiles(slug: string, params: {
        version?: string;
        owner?: string;
        signal?: AbortSignal;
    }): Promise<MarketFileMeta[]>;
    fetchFile(slug: string, params: {
        path: string;
        owner?: string;
        signal?: AbortSignal;
    }): Promise<{
        content: string;
        size: number;
    }>;
}
/** Install the provider table. Called once from `apply()`. */
export declare function setProviders(next: Partial<Record<MarketSource, MarketProvider>>): void;
/** Install the cache instance. Called once from `apply()`. */
export declare function setMarketCache(next: MarketCache | null): void;
/** The cache in force, for callers that need its counters. */
export declare function marketCache(): MarketCache | null;
/**
 * Counters behind every "served from cache" claim.
 *
 * A composition without a cache reports a table of zeroes rather than throwing:
 * the diagnostics endpoint answering `0` is the truth — nothing was cached.
 */
export declare function getMarketStats(instance?: MarketCache | null): MarketCacheStats;
/** One provider by source, or `undefined` when the composition has none. */
export declare function provider(source: MarketSource): MarketProvider | undefined;
/** Detail options accepted by the routes. */
export interface DetailOptions {
    /** Bypass the cache — mandatory before an install. */
    force?: boolean;
    /** Refuse to answer from a stale snapshot when upstream fails. */
    allowStale?: boolean;
    /** Pin the author, for registries whose slugs are shared. */
    owner?: string;
    signal?: AbortSignal;
}
/**
 * Read one skill's detail through the cache, then annotate it.
 *
 * The annotation runs *after* the cache on purpose: the cached payload is the
 * upstream record, and the local facts are added fresh on every read.
 */
export declare function getMarketSkillDetail(source: MarketSource, slug: string, options?: DetailOptions): Promise<NormalizedSkillDetail>;
/**
 * Read one skill file through the cache.
 *
 * A preview is truncated to the documented limit *after* the cache, so the cached
 * record is the document as upstream served it and a later, larger preview limit
 * does not have to re-fetch everything.
 */
export declare function getMarketFileContent(source: MarketSource, slug: string, filePath: string, options?: DetailOptions): Promise<MarketFileContent>;
/** Run every requested source's list or search, and merge the results. */
export declare function listMarketSkills(query: MarketQuery, cursor: MarketCursor, status: Record<MarketSource, SourceStatusInfo>): Promise<MarketListResult>;
/** Sources the plugin can serve, for the status endpoint and the panel's filter bar. */
export declare function configuredSources(): MarketSource[];
/** Curated category list; empty until a catalogue ships with the package. */
export declare function listMarketCategories(): {
    items: MarketCategory[];
    status: SourceStatusInfo;
};
//# sourceMappingURL=market-service.d.ts.map