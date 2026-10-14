/**
 * The confirmation dialogs.
 *
 * Both dialogs exist because the action behind them touches the disk in a way the
 * user cannot undo from the panel: an install writes a directory, a removal
 * deletes one. Each names the exact thing it will act on — the registry and
 * author for an install, the absolute path for a removal — because "uninstall
 * demo" is ambiguous when two roots can both hold a `demo` directory.
 *
 * Focus is moved into the dialog on open, Tab is trapped inside it, and Escape
 * cancels. The trap is what keeps a keyboard user from reaching the install
 * button behind the mask.
 */

import { useEffect, useId, useRef, useState } from 'react'
import { useT } from '../translate.tsx'
import { Button, SPACE, radius, surfaceStyle, token } from '../ui.tsx'

/** Everything focusable inside a dialog. */
const FOCUSABLE = 'button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

interface DialogShellProps {
  title: string
  children: React.ReactNode
  footer: React.ReactNode
  onClose: () => void
}

function DialogShell({ title, children, footer, onClose }: DialogShellProps) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const titleId = useId()

  useEffect(() => {
    const panel = panelRef.current
    if (panel === null) return

    // Focus the first control (the safe one — Cancel is rendered first).
    const first = panel.querySelector<HTMLElement>(FOCUSABLE)
    first?.focus()

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)]
      if (focusable.length === 0) return
      const head = focusable[0]!
      const tail = focusable[focusable.length - 1]!
      if (event.shiftKey && document.activeElement === head) {
        event.preventDefault()
        tail.focus()
      } else if (!event.shiftKey && document.activeElement === tail) {
        event.preventDefault()
        head.focus()
      }
    }

    panel.addEventListener('keydown', onKeyDown)
    return () => { panel.removeEventListener('keydown', onKeyDown) }
  }, [onClose])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: SPACE.xl,
        background: 'color-mix(in srgb, currentColor 24%, transparent)',
        backdropFilter: 'blur(2px)',
      }}
      // A click on the mask cancels; a click inside the panel must not.
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={surfaceStyle({
          width: 'min(520px, 100%)',
          maxHeight: '80vh',
          overflowY: 'auto',
          padding: SPACE.lg,
          display: 'flex',
          flexDirection: 'column',
          gap: SPACE.md,
          background: token.bgOverlay,
          boxShadow: '0 12px 40px rgba(0,0,0,0.28)',
        })}
      >
        <h2 id={titleId} style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{title}</h2>
        <div style={{ fontSize: 12.5, color: token.labelPrimary, display: 'flex', flexDirection: 'column', gap: SPACE.sm }}>
          {children}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: SPACE.sm }}>{footer}</div>
      </div>
    </div>
  )
}

/** One labelled fact row inside a dialog. */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: SPACE.md }}>
      <span style={{ color: token.labelSecondary, flex: '0 0 84px' }}>{label}</span>
      <span style={{ wordBreak: 'break-all' }}>{value}</span>
    </div>
  )
}

export interface ConfirmInstallDialogProps {
  name: string
  source: string
  owner: string
  version?: string
  securityLabel: string
  requiresKey: boolean
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}

export function ConfirmInstallDialog(props: ConfirmInstallDialogProps) {
  const t = useT()
  // Reset on every mount: a dialog that remembered a previous acknowledgement
  // would turn the next install into a single click.
  const [acknowledged, setAcknowledged] = useState(false)

  return (
    <DialogShell
      title={t('installTitle')}
      onClose={props.onCancel}
      footer={(
        <>
          <Button onClick={props.onCancel}>{t('cancel')}</Button>
          {/* The acknowledgement is what turns "install" from a click into a
              decision: the skill's content becomes part of what the model reads. */}
          <Button
            variant="primary"
            disabled={!acknowledged || props.busy}
            onClick={props.onConfirm}
          >
            {props.busy ? t('installing') : t('installConfirm')}
          </Button>
        </>
      )}
    >
      <Row label={t('installSource')} value={`${props.source} · ${props.owner}`} />
      <Row label={t('detailVersion')} value={props.version === undefined ? '—' : `v${props.version}`} />
      <Row label={t('installSecurity')} value={props.securityLabel} />
      {props.requiresKey ? <Row label={t('detailRequiresKey')} value={t('installRequiresKeyHint')} /> : null}

      <label style={{ display: 'flex', gap: SPACE.sm, alignItems: 'flex-start', marginTop: SPACE.sm, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(event) => { setAcknowledged(event.currentTarget.checked) }}
          style={{ marginTop: 2 }}
        />
        <span>{t('installAcknowledge')}</span>
      </label>

      <p style={{ margin: 0, fontSize: 11.5, color: token.labelSecondary }}>{t('installHint')}</p>
    </DialogShell>
  )
}

export interface ConfirmRemoveDialogProps {
  name: string
  dirPath: string
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}

export function ConfirmRemoveDialog(props: ConfirmRemoveDialogProps) {
  const t = useT()
  return (
    <DialogShell
      title={t('uninstallTitle')}
      onClose={props.onCancel}
      footer={(
        <>
          <Button onClick={props.onCancel}>{t('cancel')}</Button>
          <Button variant="primary" disabled={props.busy} onClick={props.onConfirm}>
            {props.busy ? t('uninstalling') : t('uninstallConfirm')}
          </Button>
        </>
      )}
    >
      <Row label={t('installedTitle')} value={props.name} />
      {/* The absolute path is the point: it is what the user verifies before an
          irreversible delete. */}
      <Row label={t('installPath')} value={props.dirPath} />
      <p style={{ margin: 0, color: token.error }}>{t('uninstallHint')}</p>
    </DialogShell>
  )
}

/** A transient toast pinned to the bottom of the panel. */
export function NoticeToast({ tone, text, onDismiss }: { tone: 'success' | 'error'; text: string; onDismiss: () => void }) {
  const t = useT()
  return (
    <div
      role="status"
      style={{
        position: 'absolute',
        left: SPACE.xl,
        right: SPACE.xl,
        bottom: SPACE.lg,
        display: 'flex',
        gap: SPACE.md,
        alignItems: 'center',
        padding: `${SPACE.sm}px ${SPACE.md}px`,
        borderRadius: radius.md,
        border: `1px solid ${tone === 'error' ? token.error : token.borderL1}`,
        background: token.bgOverlay,
        boxShadow: '0 6px 20px rgba(0,0,0,0.22)',
        fontSize: 12.5,
      }}
    >
      <span style={{ color: tone === 'error' ? token.error : token.labelPrimary, flex: 1, wordBreak: 'break-word' }}>{text}</span>
      <Button onClick={onDismiss}>{t('close')}</Button>
    </div>
  )
}
