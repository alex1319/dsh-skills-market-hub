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
import { type DiscoverCollection, type DiscoverCollectionId, type InstalledSkillDetail, type InstalledSkillRecord, type MarketFileContent, type MarketSource, type NormalizedSkill, type NormalizedSkillDetail, type SecurityStatus, type SourceStatusInfo } from './api.ts';
/** How long the search box waits after the last keystroke. */
export declare const SEARCH_DEBOUNCE_MS = 350;
/**
 * The sections of the panel, in the order the tab strip reads them.
 *
 * `discover` is first and is what the panel opens on: the market list answers
 * "what exists", which is only useful once a reader knows what they are looking
 * for, whereas Discover answers "what is worth looking at" without one.
 */
export type SectionFilter = 'discover' | 'market' | 'installed';
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
    /**
     * Discover's shelves, in the host's order.
     *
     * Empty until the first read; `discoverError` is what distinguishes "the read
     * failed" from "the host sent nothing".
     */
    discover: DiscoverCollection[];
    /** Which shelf the reader is looking at. Defaults to the host's first shelf. */
    discoverActive: DiscoverCollectionId;
    discoverLoading: boolean;
    discoverError: string | null;
    /**
     * Per-registry health as the *Discover* read saw it.
     *
     * Separate from `sources` (which the market list writes) because the two reads
     * hit the same registries at different moments, and a shelf that came back short
     * should be explained by the read that produced it — not by a later market list
     * that happened to succeed.
     */
    discoverSources: Record<MarketSource, SourceStatusInfo> | null;
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
    private discoverAbort;
    private searchTimer;
    private noticeTimer;
    /**
     * Which sections have already answered a read.
     *
     * The panel opens on Discover, so the market list is no longer fetched on mount
     * — a reader who never opens that tab never pays for it. That makes "has this
     * section been read yet" a real question, and it is tracked separately from the
     * data because an empty *successful* answer is a completed read, while a failed
     * one must be retried the next time the tab is entered rather than cached as a
     * blank page for the session.
     */
    private readonly loaded;
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
    /**
     * Read whatever the panel's current section needs, once.
     *
     * Called on mount rather than from an effect that names a section: the panel
     * decides what to open on, and duplicating that choice here would be a second
     * place to keep in step.
     */
    start(): void;
    setSection(section: SectionFilter): void;
    /** Fetch the data a section needs, if it has not already been read. */
    private enter;
    /**
     * Read the shelves. Errors are reported, never thrown at the render path.
     *
     * @param options.refresh - ask the host to bypass its cache. The host caches the
     *   three upstream pages behind this endpoint, so without this a refresh would
     *   re-render the same shelves while claiming to have gone and looked.
     */
    loadDiscover(options?: {
        refresh?: boolean;
    }): Promise<void>;
    setDiscoverActive(id: DiscoverCollectionId): void;
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
    /** Reload from upstream, bypassing the host's cache where the caller can. */
    refresh(): void;
    openDetail(id: string, options?: {
        owner?: string;
    }): Promise<void>;
    /** Return to the list, cancelling any in-flight detail work. */
    closeDetail(): void;
    setDetailTab(tab: DetailTab): void;
    /** Load one file of the skill currently open in the detail view. */
    selectMarketFile(path: string): Promise<void>;
    /**
     * Apply one skill's new install state everywhere the panel is showing it.
     *
     * **Three views hold their own copy of the same skill** — the market list, the
     * discover shelves, and the open detail — and each renders its install
     * affordance from that copy. So an install or a removal has to reach all three,
     * and the two operations have to agree about that, because the failure is
     * invisible from where the reader is standing:
     *
     *   - patching only the list leaves a shelf offering "Install" for something
     *     already on disk, which the host then refuses with a 409;
     *   - patching only on install leaves a shelf showing "Installed" for something
     *     that is gone — the reported defect, which stayed wrong until the panel was
     *     closed and reopened, because closing it was the only thing that rebuilt
     *     these copies.
     *
     * `installedInfo` is dropped when the skill stops being installed, so no card
     * can keep naming a directory that no longer exists.
     *
     * @param id - `source:slug`, or `local:<dirName>` for an entry no registry owns.
     *   An id no view holds is a no-op, which is the correct outcome for a removal
     *   of a hand-written skill.
     */
    private applyInstallState;
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