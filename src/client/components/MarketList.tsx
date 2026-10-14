/**
 * The market list: search, filters, the card grid, and paging.
 *
 * Paging is an infinite scroll rather than page buttons. The host's cursor is
 * opaque by design, so exposing it as a page number would invent a contract the
 * registries do not offer — and "browsing a marketplace" is a scroll gesture, not
 * a query for row 25.
 */

import { useMemo } from 'react'
import { useT } from '../translate.tsx'
import { Button, Notice, SelectField, Skeleton, SPACE, TextField, token } from '../ui.tsx'
import { LoadMoreSentinel, SkillGrid } from './SkillCard.tsx'
import type { MarketState } from '../state.ts'
import type { MarketSource, NormalizedSkill, SecurityStatus } from '../api.ts'

/** The element that scrolls, so a paging sentinel is rooted inside the panel. */
export interface ScrollRoot {
  current: HTMLElement | null
}

export interface MarketListProps {
  state: MarketState
  scrollRoot: ScrollRoot
  onOpen: (skill: NormalizedSkill) => void
  onInstall: (skill: NormalizedSkill) => void
  onLoadMore: () => void
  onSearchDraft: (value: string) => void
  onSubmitSearch: () => void
  onClearFilters: () => void
  onSetSource: (source: 'all' | MarketSource) => void
  onSetSecurity: (security: 'all' | SecurityStatus) => void
  onSetInstalled: (installed: 'all' | 'installed' | 'installable') => void
  onRetry: () => void
}

export function MarketList(props: MarketListProps) {
  const { state, scrollRoot } = props
  const t = useT()

  const filtersActive = state.filters.q !== ''
    || state.filters.source !== 'all'
    || state.filters.security !== 'all'
    || state.filters.installed !== 'all'

  const sourceOptions = useMemo(() => [
    { value: 'all' as const, label: t('sourceAll') },
    { value: 'clawhub' as const, label: 'ClawHub' },
    { value: 'skillhub' as const, label: 'SkillHub' },
  ], [t])

  const securityOptions = useMemo(() => [
    { value: 'all' as const, label: t('securityAll') },
    { value: 'verified' as const, label: t('securityVerified') },
    { value: 'benign' as const, label: t('securityBenign') },
    { value: 'unknown' as const, label: t('securityUnknown') },
    { value: 'flagged' as const, label: t('securityFlagged') },
  ], [t])

  const installedOptions = useMemo(() => [
    { value: 'all' as const, label: t('installedAll') },
    { value: 'installed' as const, label: t('installedOnly') },
    { value: 'installable' as const, label: t('installedInstallable') },
  ], [t])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.md }}>
      <div style={{ display: 'flex', gap: SPACE.sm, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: '1 1 240px', minWidth: 200 }}>
          <TextField
            value={state.searchDraft}
            onChange={props.onSearchDraft}
            onEnter={props.onSubmitSearch}
            placeholder={t('search')}
            ariaLabel={t('search')}
          />
        </div>
        <SelectField
          value={state.filters.source}
          options={sourceOptions}
          onChange={props.onSetSource}
          ariaLabel={t('filterSource')}
          ariaDescription={t('filterSourceHint')}
        />
        <SelectField
          value={state.filters.security}
          options={securityOptions}
          onChange={props.onSetSecurity}
          ariaLabel={t('filterSecurity')}
          ariaDescription={t('filterSecurityHint')}
        />
        <SelectField
          value={state.filters.installed}
          options={installedOptions}
          onChange={props.onSetInstalled}
          ariaLabel={t('filterInstalled')}
          ariaDescription={t('filterInstalledHint')}
        />
        {filtersActive ? <Button onClick={props.onClearFilters}>{t('clearFilters')}</Button> : null}
      </div>

      {state.error !== null && state.items.length === 0
        ? (
            <Notice
              title={t('errorTitle')}
              detail={state.error}
              action={<Button onClick={props.onRetry}>{t('retry')}</Button>}
            />
          )
        : null}

      {state.loading && state.items.length === 0 ? <Skeleton /> : null}

      {!state.loading && state.items.length === 0 && state.error === null
        ? <Notice title={t('empty')} detail={t('emptyHint')} />
        : null}

      {state.items.length > 0
        ? (
            <SkillGrid
              skills={state.items}
              installingIds={state.installingIds}
              onOpen={props.onOpen}
              onInstall={props.onInstall}
            />
          )
        : null}

      {state.loadingMore ? <div style={{ fontSize: 12, color: token.labelSecondary, textAlign: 'center' }}>{t('loading')}</div> : null}

      {/* An append that failed keeps the current page and offers a retry, rather
          than throwing away what the reader already scrolled through. */}
      {state.error !== null && state.items.length > 0
        ? (
            <div style={{ display: 'flex', gap: SPACE.sm, alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 12, color: token.error }}>{state.error}</span>
              <Button onClick={props.onLoadMore}>{t('retry')}</Button>
            </div>
          )
        : null}

      {state.nextCursor !== null && !state.loadingMore ? (
        <LoadMoreSentinel onReach={props.onLoadMore} rootRef={scrollRoot} />
      ) : null}
    </div>
  )
}
