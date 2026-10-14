/**
 * Skills Market controller: one state machine for the whole panel.
 *
 * The panel is a single React tree, so the state lives in one place and the
 * components read snapshots from it. Three behaviours are worth stating up front
 * because they are the ones that go wrong in a list UI:
 *
 *  - **Superseded requests are aborted, not ignored.** A reader who types three
 *    characters must not see the answer to the first one land last. Each request
 *    family (list, detail, file) owns one `AbortController`, and starting a new
 *    request cancels the previous one.
 *  - **`loadMore` is guarded by a cursor, not by a scroll event.** A scroll
 *    handler that fires during a fetch would otherwise stack duplicate pages into
 *    the list; the cursor is cleared before the request and only set again from
 *    the response.
 *  - **The installed inventory is read from disk on every entry into the
 *    Installed tab**, because that is the entire point of the tab.
 */
import { type InstalledSkillDetail, type InstalledSkillRecord, type MarketFileContent, type MarketSource, type NormalizedSkill, type NormalizedSkillDetail, type SecurityStatus, type SourceStatusInfo } from './api.ts';
/** How long the search box waits after the last keystroke. */
export declare const SEARCH_DEBOUNCE_MS = 350;
export type SectionFilter = 'market' | 'installed';
export type DetailTab = 'overview' | 'files' | 'security' | 'changelog';
/** What the market body is showing. */
export type MarketView = {
    kind: 'list';
} | {
    kind: 'detail';
    id: string;
};
export interface MarketFilters {
    q: string;
    source: 'all' | MarketSource;
    security: 'all' | SecurityStatus;
    installed: 'all' | 'installed' | 'installable';
}
export interface MarketState {
    section: SectionFilter;
    filters: MarketFilters;
    /** Value bound to the search box; committed to `filters.q` after the debounce. */
    searchDraft: string;
    items: NormalizedSkill[];
    sources: Record<MarketSource, SourceStatusInfo> | null;
    /** Cursor for the next page; `null` while a fetch is in flight or at the end. */
    nextCursor: string | null;
    loading: boolean;
    loadingMore: boolean;
    error: string | null;
    /** Per-card provenance, kept so an old card keeps the status of its own page. */
    itemStatuses: Partial<Record<MarketSource, SourceStatusInfo>>;
    view: MarketView;
    detail: NormalizedSkillDetail | null;
    /**
     * The author the detail was opened with, when the card pinned one.
     *
     * Kept separately from `detail.author.handle` because the two can disagree —
     * that is the whole reason an owner parameter exists on a registry whose slugs
     * are shared. Installing must pin the author the reader picked, not whichever
     * author the registry resolved.
     */
    detailOwner: string | null;
    detailLoading: boolean;
    detailError: string | null;
    detailTab: DetailTab;
    file: MarketFileContent | null;
    fileLoading: boolean;
    fileError: string | null;
    installingIds: string[];
    confirmInstallId: string | null;
    inventory: InstalledSkillRecord[];
    inventoryLoading: boolean;
    inventoryError: string | null;
    installedDetail: InstalledSkillDetail | null;
    installedDetailLoading: boolean;
    installedDetailError: string | null;
    confirmRemoveKey: string | null;
    notice: {
        tone: 'success' | 'error';
        text: string;
    } | null;
}
export declare class MarketController {
    private state;
    private readonly listeners;
    private listAbort;
    private detailAbort;
    private fileAbort;
    private installedAbort;
    private searchTimer;
    private noticeTimer;
    /**
     * The author pinned by the confirmation the reader is looking at.
     *
     * Held outside the published state because it is not something the UI renders;
     * it is the answer to "which author did the reader mean", consumed once by
     * {@link confirmInstall}.
     */
    private pendingOwner;
    getSnapshot: () => MarketState;
    subscribe: (listener: () => void) => (() => void);
    private commit;
    /** Release every pending request and timer. Called when the panel unmounts. */
    dispose(): void;
    private notify;
    setSection(section: SectionFilter): void;
    /** Load (or reload) the first page under the current filters. */
    load(options?: {
        refresh?: boolean;
    }): Promise<void>;
    /**
     * Append the next page.
     *
     * Guarded by the cursor rather than by the caller: a scroll handler that fires
     * several times during one fetch must not stack the same page into the list
     * three times.
     */
    loadMore(): Promise<void>;
    /** Type into the search box; the query is committed after the debounce. */
    setSearchDraft(value: string): void;
    /** Submit the search box immediately, skipping the debounce. */
    submitSearch(): void;
    clearSearch(): void;
    setFilter(patch: Partial<Omit<MarketFilters, 'q'>>): void;
    clearFilters(): void;
    /** Reload from upstream, bypassing the host's cache. */
    refresh(): void;
    openDetail(id: string, options?: {
        owner?: string;
    }): Promise<void>;
    /** Return to the list, cancelling any in-flight detail work. */
    closeDetail(): void;
    setDetailTab(tab: DetailTab): void;
    /** Load one file of the skill currently open in the detail view. */
    selectMarketFile(path: string): Promise<void>;
    /** Ask for confirmation before writing anything to disk. */
    requestInstall(id: string, owner?: string): void;
    cancelInstall(): void;
    /** Perform the install the reader confirmed. */
    confirmInstall(): Promise<void>;
    /** Read the local inventory from disk. */
    loadInventory(): Promise<void>;
    /** Open one installed entry's document and file list. */
    openInstalledDetail(key: string): Promise<void>;
    closeInstalledDetail(): void;
    /** Load one file of the installed entry currently open. */
    selectInstalledFile(path: string): Promise<void>;
    requestRemove(key: string): void;
    cancelRemove(): void;
    /** Remove the entry the reader confirmed, then re-read the inventory. */
    confirmRemove(): Promise<void>;
    dismissNotice(): void;
}
/** One controller per mounted panel. */
export declare function createMarketController(): MarketController;
//# sourceMappingURL=state.d.ts.map