/**
 * Skills Market panel root.
 *
 * This is the one component that receives the framework's locale seat (`t`),
 * because it is the entry point the slot registered with `locale: NS`. It owns
 * the controller, publishes that seat to the subtree through the translate
 * context, and switches between the two sections.
 *
 * The controller lives in a ref rather than in state: React must not re-create it
 * on a re-render, or every render would cancel the request the previous render
 * started.
 */

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { TranslateProvider, useT, type Translate } from '../translate.tsx'
import { Button, SPACE, bodyStyle, headerStyle, shellStyle, subtitleStyle, titleStyle, token } from '../ui.tsx'
import { MarketList } from '../components/MarketList.tsx'
import { MarketDetail } from '../components/MarketDetail.tsx'
import { InstalledPanel } from '../components/InstalledPanel.tsx'
import { ConfirmInstallDialog, ConfirmRemoveDialog, NoticeToast } from '../components/Dialogs.tsx'
import { createMarketController, type MarketController } from '../state.ts'
import type { MarketSource, NormalizedSkill, SecurityStatus } from '../api.ts'

/** Props the framework composes onto the `main` entry: the locale seat only. */
export interface MarketPageProps {
  t: Translate
}

/** Outer shell: supplies the controller's locale seat, then renders the panel. */
export function MarketPage({ t }: MarketPageProps) {
  return (
    <TranslateProvider t={t}>
      <MarketPanel />
    </TranslateProvider>
  )
}

function MarketPanel() {
  const t = useT()
  const controller = useMemo<MarketController>(() => createMarketController(), [])
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  // Load the first page once, and release every pending request on unmount.
  useEffect(() => {
    void controller.load()
    return () => { controller.dispose() }
  }, [controller])

  // Read the local inventory when the Installed tab is first opened. Doing it on
  // entry rather than in the background is deliberate: that tab's whole purpose is
  // to show what is on disk right now.
  useEffect(() => {
    if (state.section === 'installed' && state.inventory.length === 0 && !state.inventoryLoading) {
      void controller.loadInventory()
    }
  }, [controller, state.section, state.inventory.length, state.inventoryLoading])

  const onLoadMore = useCallback(() => { void controller.loadMore() }, [controller])
  const onOpen = useCallback((skill: NormalizedSkill) => {
    void controller.openDetail(skill.id, { owner: skill.author.handle })
  }, [controller])

  const confirmTarget = state.items.find((item) => item.id === state.confirmInstallId)
    ?? (state.detail?.id === state.confirmInstallId ? state.detail : undefined)
  const removeTarget = state.inventory.find((item) => item.key === state.confirmRemoveKey)
    ?? (state.installedDetail?.item.key === state.confirmRemoveKey ? state.installedDetail.item : undefined)

  return (
    <div style={{ ...shellStyle, position: 'relative' }}>
      <header style={headerStyle}>
        <div style={{ minWidth: 0 }}>
          <h1 style={titleStyle}>{t('title')}</h1>
          <p style={subtitleStyle}>{t('subtitle')}</p>
        </div>
        <Button onClick={() => { controller.refresh() }}>{t('refresh')}</Button>
      </header>

      <div style={{ padding: `0 ${SPACE.xl}px ${SPACE.md}px` }}>
        <div role="tablist" style={{ display: 'flex', gap: SPACE.xs, borderBottom: `1px solid ${token.borderL1}` }}>
          {([
            { id: 'market' as const, label: t('tabMarket') },
            { id: 'installed' as const, label: t('tabInstalled') },
          ]).map((entry) => (
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
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      <div ref={scrollRef} style={bodyStyle}>
        {state.section === 'market'
          ? (
              state.view.kind === 'detail'
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
                  )
            )
          : (
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
