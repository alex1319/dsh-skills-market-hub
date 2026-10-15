/**
 * Skills Market panel root.
 *
 * This is the one component that receives the framework's locale seat (`t`),
 * because it is the entry point the slot registered with `locale: NS`. It owns
 * the controller, publishes that seat to the subtree through the translate
 * context, and switches between the three sections.
 *
 * The controller lives in a ref rather than in state: React must not re-create it
 * on a re-render, or every render would cancel the request the previous render
 * started.
 */

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { TranslateProvider, useT, type Translate } from '../translate.tsx'
import { useMarketLocale } from '../locale-store.ts'
import { Button, SPACE, bodyStyle, headerStyle, shellStyle, subtitleStyle, titleStyle, token } from '../ui.tsx'
import { MarketList } from '../components/MarketList.tsx'
import { MarketDetail } from '../components/MarketDetail.tsx'
import { DiscoverPanel } from '../components/DiscoverPanel.tsx'
import { InstalledPanel } from '../components/InstalledPanel.tsx'
import { ConfirmInstallDialog, ConfirmRemoveDialog, NoticeToast } from '../components/Dialogs.tsx'
import { createMarketController, type MarketController, type MarketState, type SectionFilter } from '../state.ts'
import type { DiscoverCollectionId, MarketSource, NormalizedSkill, SecurityStatus } from '../api.ts'

/** Props the framework composes onto the `main` entry: the locale seat only. */
export interface MarketPageProps {
  t: Translate
}

/**
 * The section tabs, in reading order.
 *
 * The label key is held rather than the translated string so the strip is rebuilt
 * from a constant instead of from an array literal per render, and so the order
 * lives in one place: `state.section` names a section, this names where it sits.
 */
const SECTION_TABS: ReadonlyArray<{ id: SectionFilter; labelKey: string }> = [
  { id: 'discover', labelKey: 'tabDiscover' },
  { id: 'market', labelKey: 'tabMarket' },
  { id: 'installed', labelKey: 'tabInstalled' },
]

/**
 * Which skill a pending install confirmation is about.
 *
 * The reader can press Install from three places — a market card, a Discover row,
 * or the detail page — and the confirmation has to render wherever they are, so the
 * target is resolved from the state rather than captured at click time.
 *
 * Exported and pure because it is the only decision on this wiring path, and a
 * static render cannot press a button: every panel-level test would pass while the
 * button did nothing. **That is exactly what happened.** The lookup searched the
 * market list and the detail page and never the shelves, so pressing Install on
 * Discover recorded the request correctly and then silently rendered no dialog —
 * the worst shape of bug, because nothing errors and the click looks ignored. It
 * was reachable for most readers because the panel opens on Discover while the
 * market list is now read lazily, leaving `items` empty at the first press.
 *
 * The shelves are searched first for that reason: on this panel they are the
 * likeliest place the click came from.
 */
export function installTargetOf(state: MarketState): NormalizedSkill | undefined {
  const id = state.confirmInstallId
  if (id === null) return undefined
  return state.discover.flatMap((collection) => collection.items).find((item) => item.id === id)
    ?? state.items.find((item) => item.id === id)
    ?? (state.detail?.id === id ? state.detail : undefined)
}

/**
 * Outer shell: supplies the panel's seats, then renders it.
 *
 * The language comes from the shell's own locale service rather than from the
 * `t` seat, because `t` can only answer questions about *copy this plugin
 * authored* — and a registry's classification labels are not ours to author. The
 * panel re-renders the chips when the reader switches language, which is what the
 * subscription in `locale-store.ts` exists for.
 */
export function MarketPage({ t }: MarketPageProps) {
  const locale = useMarketLocale()
  return (
    <TranslateProvider t={t} locale={locale}>
      <MarketPanel />
    </TranslateProvider>
  )
}

function MarketPanel() {
  const t = useT()
  const controller = useMemo<MarketController>(() => createMarketController(), [])
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  // Read whatever the opening section needs, and release every pending request on
  // unmount. Only the opening section is read: the other tabs fetch on first entry,
  // so a reader who never opens the market list never pays for it.
  useEffect(() => {
    controller.start()
    return () => { controller.dispose() }
  }, [controller])

  // The Installed tab's whole purpose is to show what is on disk right now, so it
  // re-reads on every entry — but only when it is entered empty, because the
  // controller already re-reads on the transition itself.
  useEffect(() => {
    if (state.section === 'installed' && state.inventory.length === 0 && !state.inventoryLoading) {
      void controller.loadInventory()
    }
  }, [controller, state.section, state.inventory.length, state.inventoryLoading])

  const onLoadMore = useCallback(() => { void controller.loadMore() }, [controller])
  const onOpen = useCallback((skill: NormalizedSkill) => {
    void controller.openDetail(skill.id, { owner: skill.author.handle })
  }, [controller])

  const confirmTarget = installTargetOf(state)
  const removeTarget = state.inventory.find((item) => item.key === state.confirmRemoveKey)
    ?? (state.installedDetail?.item.key === state.confirmRemoveKey ? state.installedDetail.item : undefined)

  // Discover and Market share one detail view: both open the same skill and both
  // return to the shelf or list they came from, which is why closing a detail only
  // resets `view` and never touches `section`.
  const showingDetail = state.view.kind === 'detail' && state.section !== 'installed'

  // Whatever the section in front of the reader is currently waiting on. Disabling
  // refresh while a read is in flight is not cosmetic: Discover's read is three
  // upstream pages, and a second click while the first is running aborts it and
  // starts over — the reader would be slowing their own page down.
  const busy = state.section === 'discover'
    ? state.discoverLoading
    : state.section === 'installed' ? state.inventoryLoading : state.loading

  return (
    <div style={{ ...shellStyle, position: 'relative' }}>
      <header style={headerStyle}>
        <div style={{ minWidth: 0 }}>
          <h1 style={titleStyle}>{t('title')}</h1>
          <p style={subtitleStyle}>{t('subtitle')}</p>
        </div>
        <Button
          onClick={() => { controller.refresh() }}
          disabled={busy}
          title={busy ? t('loading') : undefined}
        >
          {busy ? t('loading') : t('refresh')}
        </Button>
      </header>

      <div style={{ padding: `0 ${SPACE.xl}px ${SPACE.md}px` }}>
        <div role="tablist" style={{ display: 'flex', gap: SPACE.xs, borderBottom: `1px solid ${token.borderL1}` }}>
          {SECTION_TABS.map((entry) => (
            <button
              key={entry.id}
              role="tab"
              type="button"
              aria-selected={state.section === entry.id}
              onClick={() => { controller.setSection(entry.id) }}
              style={{
                font: 'inherit',
                fontSize: 13,
                padding: '6px 14px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: state.section === entry.id ? token.labelPrimary : token.labelSecondary,
                borderBottom: `2px solid ${state.section === entry.id ? token.brand : 'transparent'}`,
                fontWeight: state.section === entry.id ? 600 : 400,
              }}
            >
              {t(entry.labelKey)}
            </button>
          ))}
        </div>
      </div>

      <div ref={scrollRef} style={bodyStyle}>
        {showingDetail
          ? (
              <MarketDetail
                detail={state.detail}
                loading={state.detailLoading}
                error={state.detailError}
                tab={state.detailTab}
                file={state.file}
                fileLoading={state.fileLoading}
                fileError={state.fileError}
                busy={state.detail !== null && state.installingIds.includes(state.detail.id)}
                onBack={() => { controller.closeDetail() }}
                onSetTab={(tab) => { controller.setDetailTab(tab) }}
                onSelectFile={(path) => { void controller.selectMarketFile(path) }}
                onInstall={() => {
                  if (state.detail !== null) controller.requestInstall(state.detail.id, state.detailOwner ?? undefined)
                }}
                onRetry={() => {
                  if (state.view.kind === 'detail') void controller.openDetail(state.view.id)
                }}
              />
            )
          : state.section === 'installed'
            ? (
                <InstalledPanel
                  items={state.inventory}
                  loading={state.inventoryLoading}
                  error={state.inventoryError}
                  detail={state.installedDetail}
                  detailLoading={state.installedDetailLoading}
                  detailError={state.installedDetailError}
                  file={state.file}
                  fileLoading={state.fileLoading}
                  fileError={state.fileError}
                  onRefresh={() => { void controller.loadInventory() }}
                  onOpen={(key) => { void controller.openInstalledDetail(key) }}
                  onCloseDetail={() => { controller.closeInstalledDetail() }}
                  onSelectFile={(path) => { void controller.selectInstalledFile(path) }}
                  onRequestRemove={(key) => { controller.requestRemove(key) }}
                />
              )
            : state.section === 'discover'
              ? (
                  <DiscoverPanel
                    collections={state.discover}
                    active={state.discoverActive}
                    loading={state.discoverLoading}
                    error={state.discoverError}
                    installingIds={state.installingIds}
                    sources={state.discoverSources}
                    onSelect={(id: DiscoverCollectionId) => { controller.setDiscoverActive(id) }}
                    onOpen={onOpen}
                    onInstall={(skill) => { controller.requestInstall(skill.id, skill.author.handle) }}
                    onRefresh={() => { controller.refresh() }}
                    // "Find more" hands the reader to the market *and* puts the
                    // query back in its starting state: arriving from a shelf with
                    // a stale search box would show them a filtered market they
                    // never asked for.
                    onFindMore={() => {
                      controller.clearFilters()
                      controller.setSection('market')
                    }}
                  />
                )
              : (
                  <MarketList
                    state={state}
                    scrollRoot={scrollRef}
                    onOpen={onOpen}
                    onInstall={(skill) => { controller.requestInstall(skill.id, skill.author.handle) }}
                    onLoadMore={onLoadMore}
                    onSearchDraft={(value) => { controller.setSearchDraft(value) }}
                    onSubmitSearch={() => { controller.submitSearch() }}
                    onClearFilters={() => { controller.clearFilters() }}
                    onSetSource={(source: 'all' | MarketSource) => { controller.setFilter({ source }) }}
                    onSetSecurity={(security: 'all' | SecurityStatus) => { controller.setFilter({ security }) }}
                    onSetInstalled={(installed: 'all' | 'installed' | 'installable') => { controller.setFilter({ installed }) }}
                    onRetry={() => { controller.refresh() }}
                  />
                )}
      </div>

      {confirmTarget === undefined
        ? null
        : (
            <ConfirmInstallDialog
              name={confirmTarget.name}
              source={confirmTarget.source}
              owner={confirmTarget.author.handle}
              version={confirmTarget.version}
              securityLabel={t(securityLabelKeyOf(confirmTarget.securityStatus))}
              requiresKey={confirmTarget.requiresApiKey === true}
              busy={state.installingIds.includes(confirmTarget.id)}
              onCancel={() => { controller.cancelInstall() }}
              onConfirm={() => { void controller.confirmInstall() }}
            />
          )}

      {removeTarget === undefined
        ? null
        : (
            <ConfirmRemoveDialog
              name={removeTarget.name}
              dirPath={removeTarget.dirPath}
              busy={state.inventoryLoading}
              onCancel={() => { controller.cancelRemove() }}
              onConfirm={() => { void controller.confirmRemove() }}
            />
          )}

      {state.notice === null
        ? null
        : (
            <NoticeToast
              tone={state.notice.tone}
              text={state.notice.text}
              onDismiss={() => { controller.dismissNotice() }}
            />
          )}
    </div>
  )
}

function securityLabelKeyOf(status: SecurityStatus): string {
  if (status === 'verified') return 'securityVerified'
  if (status === 'benign') return 'securityBenign'
  if (status === 'flagged') return 'securityFlagged'
  return 'securityUnknown'
}
