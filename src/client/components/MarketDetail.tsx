/**
 * Market skill detail: header, the four tabs, and the files pane.
 *
 * The description is rendered as **preformatted text, not markdown**. The shared
 * markdown renderer lives in the UI primitive kit, whose entry module statically
 * imports a syntax highlighter, a TeX renderer, and three dozen stylesheets —
 * pulling it in would put all of that in this plugin's bundle for one pane. Rather
 * than hand-roll a markdown subset and present it as faithful, the body is shown
 * as the author wrote it, and the Files tab offers the same document with its
 * frontmatter intact for anyone who wants the raw source.
 */

import { useEffect, useMemo, useRef } from 'react'
import { useT } from '../translate.tsx'
import { CategoryPill } from './SkillCard.tsx'
import {
  Button,
  Notice,
  Pill,
  Skeleton,
  SourceBlock,
  SPACE,
  countText,
  fileSizeText,
  radius,
  shortDate,
  surfaceStyle,
  token,
} from '../ui.tsx'
import type { DetailTab } from '../state.ts'
import type { MarketFileContent, NormalizedSkillDetail, SecurityReport, SecurityStatus } from '../api.ts'

function securityTone(status: SecurityStatus): 'ok' | 'warn' | 'error' | 'muted' {
  if (status === 'verified' || status === 'benign') return 'ok'
  if (status === 'flagged') return 'error'
  return 'muted'
}

function securityLabelKey(status: SecurityStatus): string {
  if (status === 'verified') return 'securityVerified'
  if (status === 'benign') return 'securityBenign'
  if (status === 'flagged') return 'securityFlagged'
  return 'securityUnknown'
}

export interface MarketDetailProps {
  detail: NormalizedSkillDetail | null
  loading: boolean
  error: string | null
  tab: DetailTab
  file: MarketFileContent | null
  fileLoading: boolean
  fileError: string | null
  busy: boolean
  onBack: () => void
  onSetTab: (tab: DetailTab) => void
  onSelectFile: (path: string) => void
  onInstall: () => void
  onRetry: () => void
}

export function MarketDetail(props: MarketDetailProps) {
  const t = useT()
  const headingRef = useRef<HTMLHeadingElement | null>(null)

  // Move focus to the heading when the page opens, so a keyboard user lands on the
  // new content instead of on a button in the list they just left.
  useEffect(() => {
    if (props.detail !== null) headingRef.current?.focus()
  }, [props.detail === null])

  if (props.loading && props.detail === null) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.md }}>
        <Skeleton height={120} count={1} />
        <Skeleton height={280} count={1} />
      </div>
    )
  }

  if (props.error !== null && props.detail === null) {
    return (
      <Notice
        title={t('errorTitle')}
        detail={props.error}
        action={<Button onClick={props.onRetry}>{t('retry')}</Button>}
      />
    )
  }

  const detail = props.detail
  if (detail === null) return null

  const blocked = detail.installState === 'not-installable'
  const installed = detail.installState === 'installed'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.lg }}>
      <button
        type="button"
        onClick={props.onBack}
        style={{
          alignSelf: 'flex-start', border: 'none', background: 'transparent', color: token.labelSecondary,
          font: 'inherit', fontSize: 12, cursor: 'pointer', padding: 0,
        }}
      >
        ← {t('back')}
      </button>

      <div style={surfaceStyle({ padding: SPACE.lg })}>
        <div style={{ display: 'flex', gap: SPACE.md, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 320px', minWidth: 0 }}>
            <h2 ref={headingRef} tabIndex={-1} style={{ margin: 0, fontSize: 18, fontWeight: 600, outline: 'none' }}>
              {detail.name}
            </h2>
            <p style={{ margin: `${SPACE.xs}px 0 0`, fontSize: 12, color: token.labelSecondary }}>
              {detail.author.displayName ?? detail.author.handle}
              {detail.version === undefined ? '' : ` · v${detail.version}`}
              {detail.license === undefined ? '' : ` · ${detail.license}`}
            </p>
            <div style={{ display: 'flex', gap: SPACE.xs, flexWrap: 'wrap', marginTop: SPACE.sm }}>
              <Pill tone="brand">{detail.source}</Pill>
              <Pill tone={securityTone(detail.securityStatus)}>{t(securityLabelKey(detail.securityStatus))}</Pill>
              {detail.requiresApiKey === true ? <Pill tone="warn">{t('detailRequiresKey')}</Pill> : null}
              {installed ? <Pill tone="ok">{t('installed')}</Pill> : null}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.sm, alignItems: 'flex-end' }}>
            <Button
              variant="primary"
              onClick={props.onInstall}
              disabled={props.busy || installed || blocked}
            >
              {installed ? t('installed') : props.busy ? t('installing') : t('install')}
            </Button>
            {detail.pageUrl === undefined
              ? null
              : (
                  <a
                    href={detail.pageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: 12, color: token.brand }}
                  >
                    {t('detailPage')}
                  </a>
                )}
          </div>
        </div>

        <dl style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: SPACE.md,
          margin: `${SPACE.lg}px 0 0`,
          paddingTop: SPACE.md,
          borderTop: `1px solid ${token.borderL1}`,
        }}>
          <Fact label={t('detailDownloads')} value={countText(detail.stats.downloads)} />
          {detail.stats.installs === undefined ? null : <Fact label={t('detailInstalls')} value={countText(detail.stats.installs)} />}
          <Fact label={t('detailStars')} value={countText(detail.stats.stars ?? 0)} />
          <Fact label={t('detailUpdated')} value={shortDate(detail.updatedAt) ?? '—'} />
          <Fact label={t('detailFiles')} value={`${detail.files.length} · ${fileSizeText(detail.totalSize)}`} />
        </dl>
      </div>

      <TabBar tab={props.tab} onSetTab={props.onSetTab} hasSecurity={(detail.securityReports?.length ?? 0) > 0} hasChangelog={detail.changelog !== undefined} />

      <div>
        {props.tab === 'overview' ? <Overview detail={detail} /> : null}
        {props.tab === 'files'
          ? (
              <FilesPane
                detail={detail}
                file={props.file}
                loading={props.fileLoading}
                error={props.fileError}
                onSelectFile={props.onSelectFile}
              />
            )
          : null}
        {props.tab === 'security' ? <SecurityPane detail={detail} /> : null}
        {props.tab === 'changelog' ? <ChangelogPane detail={detail} /> : null}
      </div>
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <dt style={{ fontSize: 11, color: token.labelSecondary, margin: 0 }}>{label}</dt>
      <dd style={{ margin: 0, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{value}</dd>
    </div>
  )
}

function TabBar({ tab, onSetTab, hasSecurity, hasChangelog }: {
  tab: DetailTab
  onSetTab: (tab: DetailTab) => void
  hasSecurity: boolean
  hasChangelog: boolean
}) {
  const t = useT()
  const tabs: Array<{ id: DetailTab; label: string }> = [
    { id: 'overview', label: t('detailOverview') },
    { id: 'files', label: t('detailFiles') },
    // Tabs with nothing behind them are not offered: an empty Security tab reads
    // as "the scan failed" rather than "this registry does not publish scans".
    ...(hasSecurity ? [{ id: 'security' as const, label: t('detailSecurity') }] : []),
    ...(hasChangelog ? [{ id: 'changelog' as const, label: t('detailChangelog') }] : []),
  ]

  return (
    <div role="tablist" style={{ display: 'flex', gap: SPACE.xs, borderBottom: `1px solid ${token.borderL1}`, paddingBottom: SPACE.xs }}>
      {tabs.map((entry) => (
        <button
          key={entry.id}
          role="tab"
          type="button"
          aria-selected={tab === entry.id}
          onClick={() => { onSetTab(entry.id) }}
          style={{
            font: 'inherit',
            fontSize: 12,
            padding: '5px 12px',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            color: tab === entry.id ? token.labelPrimary : token.labelSecondary,
            borderBottom: `2px solid ${tab === entry.id ? token.brand : 'transparent'}`,
            fontWeight: tab === entry.id ? 600 : 400,
          }}
        >
          {entry.label}
        </button>
      ))}
    </div>
  )
}

function Overview({ detail }: { detail: NormalizedSkillDetail }) {
  const t = useT()
  // The list summary and the document body are often the same sentence; showing
  // both would read as a stutter.
  const body = detail.description.trim()
  const showSummary = detail.summary !== '' && body !== '' && !body.startsWith(detail.summary.slice(0, 40))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.md }}>
      <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>{t('detailAbout')}</h3>
      {showSummary ? <p style={{ margin: 0, fontSize: 13, color: token.labelSecondary }}>{detail.summary}</p> : null}
      {body === ''
        ? <Notice title={t('detailNoDescription')} detail={t('detailNoDescriptionHint')} />
        : <SourceBlock text={body} wrap />}

      {detail.tags.length === 0 && (detail.categories ?? []).length === 0 ? null : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xs }}>
          {/* Labelled, unlike on a card: with room to spare, "which of these is a
              category and which is a publisher's keyword" is a fair question. */}
          {(detail.categories ?? []).length === 0 ? null : (
            <div style={{ display: 'flex', gap: SPACE.xs, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: token.labelSecondary }}>{t('detailCategories')}</span>
              {(detail.categories ?? []).map((ref) => <CategoryPill key={ref.key} category={ref} />)}
            </div>
          )}
          {detail.tags.length === 0 ? null : (
            <div style={{ display: 'flex', gap: SPACE.xs, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: token.labelSecondary }}>{t('detailTags')}</span>
              {detail.tags.map((tag) => <Pill key={tag} tone="neutral">{tag}</Pill>)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function FilesPane({ detail, file, loading, error, onSelectFile }: {
  detail: NormalizedSkillDetail
  file: MarketFileContent | null
  loading: boolean
  error: string | null
  onSelectFile: (path: string) => void
}) {
  const t = useT()
  const listRef = useRef<HTMLDivElement | null>(null)

  // Focus the file list when the tab opens, so keyboard navigation continues from
  // where the reader's attention is.
  useEffect(() => { listRef.current?.focus() }, [])

  if (detail.files.length === 0) {
    return <Notice title={t('detailFileEmpty')} />
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 240px) 1fr', gap: SPACE.md, alignItems: 'start' }}>
      <div
        ref={listRef}
        tabIndex={-1}
        role="listbox"
        aria-label={t('detailFiles')}
        style={surfaceStyle({ padding: SPACE.sm, maxHeight: 460, overflowY: 'auto', outline: 'none' })}
      >
        {detail.files.map((entry) => (
          <button
            key={entry.path}
            type="button"
            role="option"
            aria-selected={file?.path === entry.path}
            disabled={entry.tooBig}
            title={entry.tooBig ? t('detailFileTooBig') : entry.path}
            onClick={() => { onSelectFile(entry.path) }}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              font: 'inherit',
              fontSize: 12,
              fontFamily: token.mono,
              padding: '4px 8px',
              borderRadius: radius.sm,
              border: 'none',
              cursor: entry.tooBig ? 'default' : 'pointer',
              opacity: entry.tooBig ? 0.5 : 1,
              background: file?.path === entry.path ? token.bgLayer2 : 'transparent',
              color: token.labelPrimary,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {entry.path}
            <span style={{ color: token.labelSecondary, marginLeft: SPACE.sm }}>{fileSizeText(entry.size)}</span>
          </button>
        ))}
      </div>

      <div style={{ minWidth: 0 }}>
        {loading ? <Skeleton height={280} count={1} /> : null}
        {error !== null ? <Notice title={t('errorTitle')} detail={error} /> : null}
        {file !== null && !loading
          ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.sm }}>
                {file.truncated ? <Pill tone="warn">{t('detailFileTruncated')}</Pill> : null}
                <SourceBlock text={file.content} />
              </div>
            )
          : null}
      </div>
    </div>
  )
}

function SecurityPane({ detail }: { detail: NormalizedSkillDetail }) {
  const t = useT()
  const reports = useMemo<SecurityReport[]>(() => detail.securityReports ?? [], [detail.securityReports])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.md }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}>
        <Pill tone={securityTone(detail.securityStatus)}>{t(securityLabelKey(detail.securityStatus))}</Pill>
        <span style={{ fontSize: 12, color: token.labelSecondary }}>{t('securityCaveat')}</span>
      </div>

      {reports.length === 0
        ? <Notice title={t('securityUnknown')} />
        : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.sm }}>
              {reports.map((report) => (
                <div key={`${report.vendor}:${report.status}`} style={surfaceStyle({ padding: SPACE.md })}>
                  <div style={{ display: 'flex', gap: SPACE.sm, alignItems: 'center', flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: 12 }}>{report.vendor}</strong>
                    <Pill tone={report.status.toLowerCase() === 'benign' || report.status.toLowerCase() === 'clean' ? 'ok' : 'warn'}>
                      {report.statusText}
                    </Pill>
                    {report.reportUrl === undefined
                      ? null
                      : (
                          // Vendor report links can be signed and short-lived; the
                          // reader is sent there now rather than the URL being kept.
                          <a href={report.reportUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: token.brand, marginLeft: 'auto' }}>
                            {t('securityReport')}
                          </a>
                        )}
                  </div>
                  {report.summary === undefined ? null : (
                    <p style={{ margin: `${SPACE.sm}px 0 0`, fontSize: 12, color: token.labelSecondary }}>{report.summary}</p>
                  )}
                </div>
              ))}
            </div>
          )}
    </div>
  )
}

function ChangelogPane({ detail }: { detail: NormalizedSkillDetail }) {
  if (detail.changelog === undefined) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.sm }}>
      {detail.changelog.version === undefined ? null : <Pill tone="neutral">v{detail.changelog.version}</Pill>}
      <SourceBlock text={detail.changelog.text} wrap />
    </div>
  )
}
