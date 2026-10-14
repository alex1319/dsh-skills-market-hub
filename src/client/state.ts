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

import {
  fetchInstalled,
  fetchInstalledDetail,
  fetchInstalledFile,
  fetchMarketList,
  fetchSkillDetail,
  fetchSkillFile,
  installSkill,
  isAbortError,
  removeInstalled,
  SkillsMarketHubApiError,
  type InstalledSkillDetail,
  type InstalledSkillRecord,
  type MarketFileContent,
  type MarketQuery,
  type MarketSource,
  type NormalizedSkill,
  type NormalizedSkillDetail,
  type SecurityStatus,
  type SourceStatusInfo,
} from './api.ts'

/** Page size requested per list call. */
const PAGE_SIZE = 24
/** How long the search box waits after the last keystroke. */
export const SEARCH_DEBOUNCE_MS = 350

export type SectionFilter = 'market' | 'installed'
export type DetailTab = 'overview' | 'files' | 'security' | 'changelog'

/** What the market body is showing. */
export type MarketView =
  | { kind: 'list' }
  | { kind: 'detail'; id: string }

export interface MarketFilters {
  q: string
  source: 'all' | MarketSource
  security: 'all' | SecurityStatus
  installed: 'all' | 'installed' | 'installable'
}

export interface MarketState {
  section: SectionFilter
  filters: MarketFilters
  /** Value bound to the search box; committed to `filters.q` after the debounce. */
  searchDraft: string

  items: NormalizedSkill[]
  sources: Record<MarketSource, SourceStatusInfo> | null
  /** Cursor for the next page; `null` while a fetch is in flight or at the end. */
  nextCursor: string | null
  loading: boolean
  loadingMore: boolean
  error: string | null
  /** Per-card provenance, kept so an old card keeps the status of its own page. */
  itemStatuses: Partial<Record<MarketSource, SourceStatusInfo>>

  view: MarketView
  detail: NormalizedSkillDetail | null
  /**
   * The author the detail was opened with, when the card pinned one.
   *
   * Kept separately from `detail.author.handle` because the two can disagree —
   * that is the whole reason an owner parameter exists on a registry whose slugs
   * are shared. Installing must pin the author the reader picked, not whichever
   * author the registry resolved.
   */
  detailOwner: string | null
  detailLoading: boolean
  detailError: string | null
  detailTab: DetailTab
  file: MarketFileContent | null
  fileLoading: boolean
  fileError: string | null

  installingIds: string[]
  confirmInstallId: string | null

  inventory: InstalledSkillRecord[]
  inventoryLoading: boolean
  inventoryError: string | null

  installedDetail: InstalledSkillDetail | null
  installedDetailLoading: boolean
  installedDetailError: string | null
  confirmRemoveKey: string | null

  notice: { tone: 'success' | 'error'; text: string } | null
}

const initialState: MarketState = {
  section: 'market',
  filters: { q: '', source: 'all', security: 'all', installed: 'all' },
  searchDraft: '',
  items: [],
  sources: null,
  nextCursor: null,
  loading: false,
  loadingMore: false,
  error: null,
  /** Empty until the first response: the panel shows "unknown" rather than a guess. */
  itemStatuses: {},
  view: { kind: 'list' },
  detail: null,
  detailOwner: null,
  detailLoading: false,
  detailError: null,
  detailTab: 'overview',
  file: null,
  fileLoading: false,
  fileError: null,
  installingIds: [],
  confirmInstallId: null,
  inventory: [],
  inventoryLoading: false,
  inventoryError: null,
  installedDetail: null,
  installedDetailLoading: false,
  installedDetailError: null,
  confirmRemoveKey: null,
  notice: null,
}

/** Message text for a failure, preferring the host's own sentence. */
function messageOf(error: unknown): string {
  if (error instanceof SkillsMarketHubApiError) return error.message
  if (error instanceof Error) return error.message
  return String(error)
}

export class MarketController {
  private state: MarketState = initialState
  private readonly listeners = new Set<() => void>()
  private listAbort: AbortController | null = null
  private detailAbort: AbortController | null = null
  private fileAbort: AbortController | null = null
  private installedAbort: AbortController | null = null
  private searchTimer: ReturnType<typeof setTimeout> | null = null
  private noticeTimer: ReturnType<typeof setTimeout> | null = null
  /**
   * The author pinned by the confirmation the reader is looking at.
   *
   * Held outside the published state because it is not something the UI renders;
   * it is the answer to "which author did the reader mean", consumed once by
   * {@link confirmInstall}.
   */
  private pendingOwner: string | null = null

  // ── Store plumbing ────────────────────────────────────────────────────────

  getSnapshot = (): MarketState => this.state

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private commit(patch: Partial<MarketState>): void {
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) listener()
  }

  /** Release every pending request and timer. Called when the panel unmounts. */
  dispose(): void {
    this.listAbort?.abort()
    this.detailAbort?.abort()
    this.fileAbort?.abort()
    this.installedAbort?.abort()
    if (this.searchTimer !== null) clearTimeout(this.searchTimer)
    if (this.noticeTimer !== null) clearTimeout(this.noticeTimer)
    this.listeners.clear()
  }

  private notify(tone: 'success' | 'error', text: string): void {
    if (this.noticeTimer !== null) clearTimeout(this.noticeTimer)
    this.commit({ notice: { tone, text } })
    // Errors are worth reading, so they stay twice as long as a success toast.
    this.noticeTimer = setTimeout(() => { this.commit({ notice: null }) }, tone === 'error' ? 8_000 : 4_000)
  }

  // ── Section ───────────────────────────────────────────────────────────────

  setSection(section: SectionFilter): void {
    if (this.state.section === section) return
    this.commit({ section })
    if (section === 'installed') void this.loadInventory()
  }

  // ── List ──────────────────────────────────────────────────────────────────

  /** Load (or reload) the first page under the current filters. */
  async load(options: { refresh?: boolean } = {}): Promise<void> {
    this.listAbort?.abort()
    const controller = new AbortController()
    this.listAbort = controller

    this.commit({ loading: true, error: null, nextCursor: null })

    const query: MarketQuery = {
      ...(this.state.filters.q === '' ? {} : { q: this.state.filters.q }),
      source: this.state.filters.source,
      security: this.state.filters.security,
      installed: this.state.filters.installed,
      limit: PAGE_SIZE,
    }

    try {
      const result = await fetchMarketList(query, controller.signal, options.refresh === true ? { refresh: true } : {})
      if (controller.signal.aborted) return
      this.commit({
        items: result.items,
        nextCursor: result.nextCursor,
        sources: result.sources,
        itemStatuses: result.sources,
        loading: false,
        error: null,
      })
    } catch (error) {
      if (isAbortError(error) || controller.signal.aborted) return
      this.commit({ loading: false, error: messageOf(error), items: [], nextCursor: null })
    }
  }

  /**
   * Append the next page.
   *
   * Guarded by the cursor rather than by the caller: a scroll handler that fires
   * several times during one fetch must not stack the same page into the list
   * three times.
   */
  async loadMore(): Promise<void> {
    const cursor = this.state.nextCursor
    if (cursor === null || this.state.loading || this.state.loadingMore) return

    const controller = new AbortController()
    this.listAbort = controller
    this.commit({ loadingMore: true, nextCursor: null })

    const query: MarketQuery = {
      ...(this.state.filters.q === '' ? {} : { q: this.state.filters.q }),
      source: this.state.filters.source,
      security: this.state.filters.security,
      installed: this.state.filters.installed,
      limit: PAGE_SIZE,
      cursor,
    }

    try {
      const result = await fetchMarketList(query, controller.signal)
      if (controller.signal.aborted) return
      // Deduplicate by id: a registry whose paging is not stable can repeat an
      // entry across pages, and a React key collision is the least of what
      // showing the same card twice would cost.
      const known = new Set(this.state.items.map((item) => item.id))
      const appended = result.items.filter((item) => !known.has(item.id))
      this.commit({
        items: [...this.state.items, ...appended],
        nextCursor: result.nextCursor,
        sources: result.sources,
        itemStatuses: { ...this.state.itemStatuses, ...result.sources },
        loadingMore: false,
      })
    } catch (error) {
      if (isAbortError(error) || controller.signal.aborted) return
      // A failed *append* must not clear the list the reader is looking at, so
      // the page they already have stays and the cursor is restored for a retry.
      this.commit({ loadingMore: false, nextCursor: cursor, error: messageOf(error) })
    }
  }

  /** Type into the search box; the query is committed after the debounce. */
  setSearchDraft(value: string): void {
    this.commit({ searchDraft: value })
    if (this.searchTimer !== null) clearTimeout(this.searchTimer)
    this.searchTimer = setTimeout(() => {
      this.searchTimer = null
      if (this.state.filters.q === value.trim()) return
      this.commit({ filters: { ...this.state.filters, q: value.trim() } })
      void this.load()
    }, SEARCH_DEBOUNCE_MS)
  }

  /** Submit the search box immediately, skipping the debounce. */
  submitSearch(): void {
    if (this.searchTimer !== null) { clearTimeout(this.searchTimer); this.searchTimer = null }
    const value = this.state.searchDraft.trim()
    if (this.state.filters.q === value) return
    this.commit({ filters: { ...this.state.filters, q: value } })
    void this.load()
  }

  clearSearch(): void {
    this.setSearchDraft('')
  }

  setFilter(patch: Partial<Omit<MarketFilters, 'q'>>): void {
    this.commit({ filters: { ...this.state.filters, ...patch } })
    void this.load()
  }

  clearFilters(): void {
    if (this.searchTimer !== null) { clearTimeout(this.searchTimer); this.searchTimer = null }
    this.commit({
      searchDraft: '',
      filters: { q: '', source: 'all', security: 'all', installed: 'all' },
    })
    void this.load()
  }

  /** Reload from upstream, bypassing the host's cache. */
  refresh(): void {
    if (this.state.section === 'installed') {
      void this.loadInventory()
      return
    }
    void this.load({ refresh: true })
  }

  // ── Detail ────────────────────────────────────────────────────────────────

  async openDetail(id: string, options: { owner?: string } = {}): Promise<void> {
    this.detailAbort?.abort()
    const controller = new AbortController()
    this.detailAbort = controller

    this.commit({
      view: { kind: 'detail', id },
      detail: null,
      // The pin is remembered even before the response arrives, so an install
      // triggered from a fast click still names the right author.
      detailOwner: options.owner ?? null,
      detailLoading: true,
      detailError: null,
      detailTab: 'overview',
      file: null,
      fileError: null,
    })

    try {
      const result = await fetchSkillDetail(id, controller.signal, options)
      if (controller.signal.aborted) return
      this.commit({ detail: result.skill, detailLoading: false })
    } catch (error) {
      if (isAbortError(error) || controller.signal.aborted) return
      this.commit({ detailLoading: false, detailError: messageOf(error) })
    }
  }

  /** Return to the list, cancelling any in-flight detail work. */
  closeDetail(): void {
    this.detailAbort?.abort()
    this.fileAbort?.abort()
    this.commit({
      view: { kind: 'list' },
      detail: null,
      detailOwner: null,
      detailError: null,
      detailLoading: false,
      file: null,
      fileError: null,
      fileLoading: false,
    })
  }

  setDetailTab(tab: DetailTab): void {
    if (this.state.detailTab === tab) return
    this.commit({ detailTab: tab, file: null, fileError: null })
    // Open the first file when the reader arrives at the Files tab with nothing
    // selected, so the tab is never a blank pane.
    if (tab === 'files') {
      const first = this.state.detail?.files.find((file) => !file.tooBig)
      if (first !== undefined) void this.selectMarketFile(first.path)
    }
  }

  /** Load one file of the skill currently open in the detail view. */
  async selectMarketFile(path: string): Promise<void> {
    const view = this.state.view
    const detail = this.state.detail
    if (view.kind !== 'detail' || detail === null) return
    if (this.state.file?.path === path && this.state.fileError === null) return

    this.fileAbort?.abort()
    const controller = new AbortController()
    this.fileAbort = controller
    this.commit({ fileLoading: true, fileError: null, file: null })

    try {
      const file = await fetchSkillFile(view.id, path, controller.signal, detail.author.handle)
      if (controller.signal.aborted) return
      this.commit({ file, fileLoading: false })
    } catch (error) {
      if (isAbortError(error) || controller.signal.aborted) return
      this.commit({ fileLoading: false, fileError: messageOf(error) })
    }
  }

  // ── Install ───────────────────────────────────────────────────────────────

  /** Ask for confirmation before writing anything to disk. */
  requestInstall(id: string, owner?: string): void {
    this.pendingOwner = owner ?? null
    this.commit({ confirmInstallId: id })
  }

  cancelInstall(): void {
    this.pendingOwner = null
    this.commit({ confirmInstallId: null })
  }

  /** Perform the install the reader confirmed. */
  async confirmInstall(): Promise<void> {
    const id = this.state.confirmInstallId
    if (id === null) return
    // The author pinned by the card or the detail page travels with the id, so a
    // slug shared across authors installs the one the reader chose rather than
    // whichever the registry ranked first.
    const pinned = this.pendingOwner ?? this.state.detailOwner
    const owner = pinned === null || pinned === undefined || pinned === '' ? undefined : pinned
    this.pendingOwner = null

    this.commit({
      confirmInstallId: null,
      installingIds: [...this.state.installingIds, id],
    })

    try {
      await installSkill(id, owner)
      this.notify('success', `已安装 ${id}`)
      // Mark the card immediately rather than re-listing: the reader is looking at
      // this card, and a full reload would move it.
      this.commit({
        items: this.state.items.map((item) => (
          item.id === id
            ? { ...item, installState: 'installed' as const, installedInfo: { dirName: item.slug } }
            : item
        )),
        detail: this.state.detail?.id === id
          ? { ...this.state.detail, installState: 'installed' as const, installedInfo: { dirName: this.state.detail.slug } }
          : this.state.detail,
        installingIds: this.state.installingIds.filter((candidate) => candidate !== id),
      })
    } catch (error) {
      this.commit({ installingIds: this.state.installingIds.filter((candidate) => candidate !== id) })
      this.notify('error', messageOf(error))
    }
  }

  // ── Installed inventory ───────────────────────────────────────────────────

  /** Read the local inventory from disk. */
  async loadInventory(): Promise<void> {
    this.installedAbort?.abort()
    const controller = new AbortController()
    this.installedAbort = controller

    this.commit({ inventoryLoading: true, inventoryError: null })
    try {
      const items = await fetchInstalled(controller.signal)
      if (controller.signal.aborted) return
      this.commit({ inventory: items, inventoryLoading: false })
    } catch (error) {
      if (isAbortError(error) || controller.signal.aborted) return
      this.commit({ inventoryLoading: false, inventoryError: messageOf(error) })
    }
  }

  /** Open one installed entry's document and file list. */
  async openInstalledDetail(key: string): Promise<void> {
    this.fileAbort?.abort()
    const controller = new AbortController()
    this.fileAbort = controller

    this.commit({ installedDetailLoading: true, installedDetailError: null, installedDetail: null })
    try {
      const detail = await fetchInstalledDetail(key, controller.signal)
      if (controller.signal.aborted) return
      this.commit({ installedDetail: detail, installedDetailLoading: false })
    } catch (error) {
      if (isAbortError(error) || controller.signal.aborted) return
      this.commit({ installedDetailLoading: false, installedDetailError: messageOf(error) })
    }
  }

  closeInstalledDetail(): void {
    this.fileAbort?.abort()
    this.commit({ installedDetail: null, installedDetailError: null, installedDetailLoading: false })
  }

  /** Load one file of the installed entry currently open. */
  async selectInstalledFile(path: string): Promise<void> {
    const detail = this.state.installedDetail
    if (detail === null) return
    if (this.state.file?.path === path && this.state.fileError === null) return

    this.fileAbort?.abort()
    const controller = new AbortController()
    this.fileAbort = controller
    this.commit({ fileLoading: true, fileError: null, file: null })

    try {
      const file = await fetchInstalledFile(detail.item.key, path, controller.signal)
      if (controller.signal.aborted) return
      this.commit({ file, fileLoading: false })
    } catch (error) {
      if (isAbortError(error) || controller.signal.aborted) return
      this.commit({ fileLoading: false, fileError: messageOf(error) })
    }
  }

  requestRemove(key: string): void {
    this.commit({ confirmRemoveKey: key })
  }

  cancelRemove(): void {
    this.commit({ confirmRemoveKey: null })
  }

  /** Remove the entry the reader confirmed, then re-read the inventory. */
  async confirmRemove(): Promise<void> {
    const key = this.state.confirmRemoveKey
    if (key === null) return
    this.commit({ confirmRemoveKey: null })

    try {
      await removeInstalled(key)
      this.notify('success', '已卸载')
      this.commit({ installedDetail: null })
      await this.loadInventory()
    } catch (error) {
      this.notify('error', messageOf(error))
    }
  }

  dismissNotice(): void {
    if (this.noticeTimer !== null) clearTimeout(this.noticeTimer)
    this.commit({ notice: null })
  }
}

/** One controller per mounted panel. */
export function createMarketController(): MarketController {
  return new MarketController()
}
