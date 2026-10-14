/**
 * The installed tab: what is on this disk, and what can be done with it.
 *
 * Two rules shape this view, and both come from the same fact — the host refuses
 * to delete a directory it cannot prove it wrote:
 *
 *  - **Ownership is shown, not implied.** A managed skill and a hand-written one
 *    look the same on disk, so the row says which is which, and the removal button
 *    is only offered for entries the host will actually remove. Offering it and
 *    then failing would be worse than not offering it.
 *  - **The path is shown before removal.** The confirmation names the exact
 *    directory, because "uninstall demo" is ambiguous when two roots can hold a
 *    directory by that name.
 */

import { useEffect, useRef, useState } from 'react'
import { useT } from '../translate.tsx'
import {
  Button,
  Notice,
  Pill,
  Skeleton,
  SourceBlock,
  SPACE,
  fileSizeText,
  radius,
  surfaceStyle,
  token,
} from '../ui.tsx'
import type { InstalledSkillDetail, InstalledSkillRecord, MarketFileContent } from '../api.ts'

export interface InstalledPanelProps {
  items: InstalledSkillRecord[]
  loading: boolean
  error: string | null
  detail: InstalledSkillDetail | null
  detailLoading: boolean
  detailError: string | null
  file: MarketFileContent | null
  fileLoading: boolean
  fileError: string | null
  onRefresh: () => void
  onOpen: (key: string) => void
  onCloseDetail: () => void
  onSelectFile: (path: string) => void
  onRequestRemove: (key: string) => void
}

export function InstalledPanel(props: InstalledPanelProps) {
  const t = useT()
  const [query, setQuery] = useState('')

  if (props.detail !== null || props.detailLoading) {
    return <InstalledDetailView {...props} />
  }

  const needle = query.trim().toLowerCase()
  const visible = needle === ''
    ? props.items
    : props.items.filter((item) => [
        item.name, item.dirName, item.slug, item.owner ?? '', item.summary ?? '',
      ].join(' ').toLowerCase().includes(needle))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.md }}>
      <div style={{ display: 'flex', gap: SPACE.sm, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="search"
          value={query}
          aria-label={t('installedSearch')}
          placeholder={t('installedSearch')}
          onChange={(event) => { setQuery(event.currentTarget.value) }}
          style={{
            font: 'inherit', fontSize: 13, flex: '1 1 240px', minWidth: 180,
            padding: '7px 10px', borderRadius: radius.md,
            border: `1px solid ${token.borderL2}`, background: token.bgLayer1, color: token.labelPrimary,
          }}
        />
        <span style={{ fontSize: 12, color: token.labelSecondary }}>{props.items.length}</span>
        <Button onClick={props.onRefresh}>{t('refresh')}</Button>
      </div>

      {props.error === null
        ? null
        : <Notice title={t('errorTitle')} detail={props.error} action={<Button onClick={props.onRefresh}>{t('retry')}</Button>} />}

      {props.loading && props.items.length === 0 ? <Skeleton height={54} count={4} /> : null}

      {!props.loading && props.items.length === 0 && props.error === null
        ? <Notice title={t('installedEmpty')} detail={t('installedEmptyHint')} />
        : null}

      {props.items.length > 0 && visible.length === 0
        ? <Notice title={t('empty')} detail={t('emptyHint')} />
        : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.sm }}>
        {visible.map((item) => (
          <InstalledRow
            key={item.key}
            item={item}
            onOpen={() => { props.onOpen(item.key) }}
            onRemove={() => { props.onRequestRemove(item.key) }}
          />
        ))}
      </div>
    </div>
  )
}

function InstalledRow({ item, onOpen, onRemove }: { item: InstalledSkillRecord; onOpen: () => void; onRemove: () => void }) {
  const t = useT()
  return (
    <div style={surfaceStyle({ padding: SPACE.md, display: 'flex', gap: SPACE.md, alignItems: 'center', flexWrap: 'wrap' })}>
      <div style={{ flex: '1 1 260px', minWidth: 0 }}>
        <div style={{ display: 'flex', gap: SPACE.sm, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={onOpen}
            style={{
              border: 'none', background: 'transparent', padding: 0, font: 'inherit',
              fontSize: 13, fontWeight: 600, color: token.labelPrimary, cursor: 'pointer',
            }}
          >
            {item.name}
          </button>
          <Pill tone={item.managed ? 'ok' : 'muted'}>{item.managed ? t('installedManaged') : t('installedLocal')}</Pill>
          {item.linked ? <Pill tone="muted">{t('installedLinked')}</Pill> : null}
          {item.version === undefined ? null : <Pill tone="neutral">v{item.version}</Pill>}
        </div>
        <div style={{ fontSize: 11, color: token.labelSecondary, marginTop: 2, wordBreak: 'break-all' }}>
          {item.dirPath}
        </div>
      </div>

      <div style={{ fontSize: 11, color: token.labelSecondary, textAlign: 'right', whiteSpace: 'nowrap' }}>
        {item.fileCount} {t('detailFiles')} · {fileSizeText(item.bytes)}
      </div>

      <Button onClick={onOpen}>{t('detailOverview')}</Button>
      {/* Only a managed entry can be removed, and the host enforces that too; the
          button is hidden rather than shown-and-refused. */}
      {item.managed
        ? <Button onClick={onRemove} disabled={!item.removable} title={item.removable ? undefined : t('uninstallDisabled')}>{t('uninstall')}</Button>
        : null}
    </div>
  )
}

function InstalledDetailView(props: InstalledPanelProps) {
  const t = useT()
  const [tab, setTab] = useState<'document' | 'files'>('document')
  const headingRef = useRef<HTMLHeadingElement | null>(null)

  useEffect(() => {
    if (props.detail !== null) headingRef.current?.focus()
  }, [props.detail === null])

  if (props.detailLoading && props.detail === null) {
    return <Skeleton height={140} count={2} />
  }
  if (props.detailError !== null && props.detail === null) {
    return (
      <Notice
        title={t('errorTitle')}
        detail={props.detailError}
        action={<Button onClick={props.onCloseDetail}>{t('back')}</Button>}
      />
    )
  }

  const detail = props.detail
  if (detail === null) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.lg }}>
      <button
        type="button"
        onClick={props.onCloseDetail}
        style={{
          alignSelf: 'flex-start', border: 'none', background: 'transparent',
          color: token.labelSecondary, font: 'inherit', fontSize: 12, cursor: 'pointer', padding: 0,
        }}
      >
        ← {t('back')}
      </button>

      <div style={surfaceStyle({ padding: SPACE.lg })}>
        <div style={{ display: 'flex', gap: SPACE.md, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 300px', minWidth: 0 }}>
            <h2 ref={headingRef} tabIndex={-1} style={{ margin: 0, fontSize: 17, fontWeight: 600, outline: 'none' }}>
              {detail.item.name}
            </h2>
            <div style={{ display: 'flex', gap: SPACE.xs, flexWrap: 'wrap', marginTop: SPACE.sm }}>
              <Pill tone={detail.item.managed ? 'ok' : 'muted'}>
                {detail.item.managed ? t('installedManaged') : t('installedLocal')}
              </Pill>
              {detail.item.version === undefined ? null : <Pill tone="neutral">v{detail.item.version}</Pill>}
              {detail.item.linked ? <Pill tone="muted">{t('installedLinked')}</Pill> : null}
              {detail.item.source === 'local' ? null : <Pill tone="brand">{detail.item.source}</Pill>}
            </div>
            <dl style={{ margin: `${SPACE.md}px 0 0`, fontSize: 11, color: token.labelSecondary }}>
              <dt style={{ margin: 0 }}>{t('installPath')}</dt>
              <dd style={{ margin: 0, wordBreak: 'break-all', color: token.labelPrimary }}>{detail.item.dirPath}</dd>
            </dl>
          </div>

          {detail.item.managed
            ? (
                <Button
                  onClick={() => { props.onRequestRemove(detail.item.key) }}
                  disabled={!detail.item.removable}
                  title={detail.item.removable ? undefined : t('uninstallDisabled')}
                >
                  {t('uninstall')}
                </Button>
              )
            : null}
        </div>
      </div>

      <div role="tablist" style={{ display: 'flex', gap: SPACE.xs, borderBottom: `1px solid ${token.borderL1}`, paddingBottom: SPACE.xs }}>
        {([
          { id: 'document' as const, label: t('installedDocument') },
          { id: 'files' as const, label: t('detailFiles') },
        ]).map((entry) => (
          <button
            key={entry.id}
            role="tab"
            type="button"
            aria-selected={tab === entry.id}
            onClick={() => { setTab(entry.id) }}
            style={{
              font: 'inherit', fontSize: 12, padding: '5px 12px', border: 'none', background: 'transparent',
              cursor: 'pointer', color: tab === entry.id ? token.labelPrimary : token.labelSecondary,
              borderBottom: `2px solid ${tab === entry.id ? token.brand : 'transparent'}`,
              fontWeight: tab === entry.id ? 600 : 400,
            }}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === 'document'
        ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.md }}>
              {detail.frontmatter === null
                ? null
                : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.xs }}>
                      <h3 style={{ margin: 0, fontSize: 12, color: token.labelSecondary }}>{t('installedHeader')}</h3>
                      <SourceBlock text={detail.frontmatter} />
                    </div>
                  )}
              {/* The whole document, frontmatter included, exactly as it is on disk:
                  this view exists to show the reader their own file. */}
              <SourceBlock text={detail.markdown} wrap />
            </div>
          )
        : (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 240px) 1fr', gap: SPACE.md, alignItems: 'start' }}>
              <div role="listbox" aria-label={t('detailFiles')} style={surfaceStyle({ padding: SPACE.sm, maxHeight: 420, overflowY: 'auto' })}>
                {detail.files.map((entry) => (
                  <button
                    key={entry.path}
                    type="button"
                    role="option"
                    aria-selected={props.file?.path === entry.path}
                    onClick={() => { props.onSelectFile(entry.path) }}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left', font: 'inherit', fontSize: 12,
                      fontFamily: token.mono, padding: '4px 8px', borderRadius: radius.sm, border: 'none',
                      cursor: 'pointer', background: props.file?.path === entry.path ? token.bgLayer2 : 'transparent',
                      color: token.labelPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}
                  >
                    {entry.path}
                    <span style={{ color: token.labelSecondary, marginLeft: SPACE.sm }}>{fileSizeText(entry.size)}</span>
                  </button>
                ))}
              </div>
              <div style={{ minWidth: 0 }}>
                {props.fileLoading ? <Skeleton height={240} count={1} /> : null}
                {props.fileError !== null ? <Notice title={t('errorTitle')} detail={props.fileError} /> : null}
                {props.file !== null && !props.fileLoading ? <SourceBlock text={props.file.content} /> : null}
              </div>
            </div>
          )}
    </div>
  )
}
