/**
 * Panel chrome: the surfaces, fields, and controls every Skills Market view is
 * built from.
 *
 * Every colour, radius, and font here comes from a `--dsw-*` theme token, so the
 * panel follows the host's light and dark themes without shipping a stylesheet.
 * That is the reason the plugin has no CSS build step at all: a stylesheet would
 * need a compiler, a hashed class map kept byte-stable in version control, and a
 * runtime that injects it — three moving parts bought for zero visual gain over
 * inline styles built from the same tokens.
 *
 * `scripts/verify.mjs` fails the build on a hard-coded colour in this directory,
 * because a literal hex value cannot follow the theme.
 */

import { useEffect, type CSSProperties, type ReactNode } from 'react'

// ── Tokens ──────────────────────────────────────────────────────────────────
// Named once so a view never spells a token twice, and so a token rename is one
// edit rather than a search.

export const token = {
  bgBase: 'var(--dsw-alias-bg-base)',
  bgLayer1: 'var(--dsw-alias-bg-layer-1)',
  bgLayer2: 'var(--dsw-alias-bg-layer-2)',
  bgOverlay: 'var(--dsw-alias-bg-overlay)',
  borderL1: 'var(--dsw-alias-border-l1)',
  borderL2: 'var(--dsw-alias-border-l2)',
  labelPrimary: 'var(--dsw-alias-label-primary)',
  labelSecondary: 'var(--dsw-alias-label-secondary)',
  brand: 'var(--dsw-alias-brand-primary)',
  success: 'var(--dsw-alias-state-success-primary)',
  warn: 'var(--dsw-alias-state-warn-primary)',
  error: 'var(--dsw-alias-state-error-primary)',
  idle: 'var(--dsw-alias-state-idle-primary)',
  mono: 'var(--dsw-font-mono)',
} as const

export const radius = { xs: 4, sm: 6, md: 8, lg: 14 } as const

export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const

// ── Layout ──────────────────────────────────────────────────────────────────

export const shellStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  minHeight: 0,
  background: token.bgBase,
  color: token.labelPrimary,
  fontSize: 13,
  lineHeight: 1.5,
}

export const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: SPACE.md,
  padding: `${SPACE.lg}px ${SPACE.xl}px ${SPACE.sm}px`,
}

export const titleStyle: CSSProperties = { margin: 0, fontSize: 17, fontWeight: 600, lineHeight: 1.3 }

export const subtitleStyle: CSSProperties = { margin: 0, fontSize: 12, color: token.labelSecondary }

export const bodyStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  padding: `0 ${SPACE.xl}px ${SPACE.xl}px`,
}

/** A raised surface: the card, the notice, the dialog body. */
export function surfaceStyle(overrides: CSSProperties = {}): CSSProperties {
  return {
    border: `1px solid ${token.borderL1}`,
    borderRadius: radius.lg,
    background: token.bgLayer1,
    ...overrides,
  }
}

// ── Controls ────────────────────────────────────────────────────────────────

export interface ButtonProps {
  children: ReactNode
  onClick?: () => void
  /** `primary` is the one confirming action on a surface; everything else is `ghost`. */
  variant?: 'primary' | 'ghost'
  disabled?: boolean
  title?: string
  type?: 'button' | 'submit'
  style?: CSSProperties
}

/**
 * A panel button.
 *
 * A plain `<button>` with token-derived inline styles, rather than the shared
 * primitive kit: that kit's entry module statically imports a syntax highlighter,
 * a TeX renderer, and three dozen stylesheets, so pulling one button out of it
 * would put all of that in this plugin's bundle.
 */
export function Button({ children, onClick, variant = 'ghost', disabled = false, title, type = 'button', style }: ButtonProps) {
  const base: CSSProperties = {
    font: 'inherit',
    fontSize: 12,
    padding: '5px 12px',
    borderRadius: radius.md,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    border: `1px solid ${token.borderL2}`,
    background: 'transparent',
    color: token.labelPrimary,
  }
  const primary: CSSProperties = {
    ...base,
    background: token.brand,
    borderColor: 'transparent',
    color: token.bgBase,
    fontWeight: 600,
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{ ...(variant === 'primary' ? primary : base), ...style }}
    >
      {children}
    </button>
  )
}

export interface TextFieldProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  onEnter?: () => void
  ariaLabel: string
  style?: CSSProperties
}

/** One single-line text input. */
export function TextField({ value, onChange, placeholder, onEnter, ariaLabel, style }: TextFieldProps) {
  return (
    <input
      type="search"
      value={value}
      aria-label={ariaLabel}
      placeholder={placeholder}
      onChange={(event) => { onChange(event.currentTarget.value) }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && onEnter !== undefined) {
          event.preventDefault()
          onEnter()
        }
      }}
      style={{
        font: 'inherit',
        fontSize: 13,
        width: '100%',
        padding: '7px 10px',
        borderRadius: radius.md,
        border: `1px solid ${token.borderL2}`,
        background: token.bgLayer1,
        color: token.labelPrimary,
        boxSizing: 'border-box',
        ...style,
      }}
    />
  )
}

export interface SelectFieldProps<T extends string> {
  value: T
  options: ReadonlyArray<{ value: T; label: string }>
  onChange: (value: T) => void
  ariaLabel: string
  /**
   * What this dropdown filters by, in a sentence.
   *
   * A closed-set control has no room for a visible label of its own — the two
   * dropdowns beside the search box rendered as a pair of identical "All" chips,
   * which told the reader nothing about which axis either one filtered. So the
   * question is answered twice: the option labels now name their axis ("Any
   * verdict" / "Any state"), and this text is the tooltip and the accessible
   * description for anyone who still has to ask.
   */
  ariaDescription?: string
}

/** One closed-set dropdown, used for the filter bar. */
export function SelectField<T extends string>({ value, options, onChange, ariaLabel, ariaDescription }: SelectFieldProps<T>) {
  return (
    <select
      value={value}
      aria-label={ariaLabel}
      aria-description={ariaDescription}
      title={ariaDescription}
      onChange={(event) => { onChange(event.currentTarget.value as T) }}
      style={{
        font: 'inherit',
        fontSize: 12,
        padding: '6px 8px',
        borderRadius: radius.md,
        border: `1px solid ${token.borderL2}`,
        background: token.bgLayer1,
        color: token.labelPrimary,
      }}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  )
}

/** A small status pill: install state, security verdict, source. */
export function Pill({ children, tone = 'neutral', title }: { children: ReactNode; tone?: 'neutral' | 'ok' | 'warn' | 'error' | 'brand' | 'muted'; title?: string }) {
  const colours: Record<string, string> = {
    neutral: token.labelSecondary,
    muted: token.idle,
    ok: token.success,
    warn: token.warn,
    error: token.error,
    brand: token.brand,
  }
  return (
    <span
      title={title}
      style={{
        display: 'inline-block',
        fontSize: 11,
        lineHeight: 1.6,
        padding: '0 7px',
        borderRadius: radius.sm,
        border: `1px solid ${colours[tone]}`,
        color: colours[tone],
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  )
}

// ── States ──────────────────────────────────────────────────────────────────

/** A centred notice: empty list, failed load, or a hint. */
export function Notice({ title, detail, action }: { title: string; detail?: string; action?: ReactNode }) {
  return (
    <div style={surfaceStyle({ padding: `${SPACE.lg}px ${SPACE.lg + 2}px`, display: 'flex', flexDirection: 'column', gap: SPACE.sm, alignItems: 'flex-start' })}>
      <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>{title}</p>
      {detail === undefined ? null : <p style={{ margin: 0, fontSize: 12, color: token.labelSecondary }}>{detail}</p>}
      {action}
    </div>
  )
}

/**
 * A pulsing placeholder block.
 *
 * The pulse is driven by a CSS animation injected once per document, because an
 * inline style cannot express a keyframe. It is the only stylesheet this plugin
 * writes, and it carries no colour of its own.
 */
export function Skeleton({ height = 74, count = 6 }: { height?: number; count?: number }) {
  useEffect(ensureSkeletonStyle, [])
  return (
    <div style={{ display: 'grid', gap: SPACE.md, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }} aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} style={surfaceStyle({ height, opacity: 0.6, background: token.bgLayer2 })} />
      ))}
    </div>
  )
}

const SKELETON_STYLE_ID = 'skills-market-hub-skeleton'

function ensureSkeletonStyle(): void {
  if (typeof document === 'undefined') return
  if (document.getElementById(SKELETON_STYLE_ID) !== null) return
  const style = document.createElement('style')
  style.id = SKELETON_STYLE_ID
  style.textContent = '@keyframes smh-pulse{0%,100%{opacity:.45}50%{opacity:.8}}'
  document.head.appendChild(style)
}

/** Monospace block for source text. */
export function SourceBlock({ text, wrap = false }: { text: string; wrap?: boolean }) {
  return (
    <pre
      style={{
        margin: 0,
        padding: SPACE.md,
        borderRadius: radius.md,
        border: `1px solid ${token.borderL1}`,
        background: token.bgLayer2,
        fontFamily: token.mono,
        fontSize: 11.5,
        lineHeight: 1.6,
        overflowX: wrap ? 'hidden' : 'auto',
        whiteSpace: wrap ? 'pre-wrap' : 'pre',
        wordBreak: wrap ? 'break-word' : 'normal',
        maxHeight: 460,
        overflowY: 'auto',
      }}
    >
      {text}
    </pre>
  )
}

/** Format a byte count the way a reader expects to read it. */
export function fileSizeText(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Format an epoch-millisecond timestamp as a short local date. */
export function shortDate(at: number | undefined): string | undefined {
  if (at === undefined || !Number.isFinite(at) || at <= 0) return undefined
  return new Date(at).toLocaleDateString()
}

/** Format a large count compactly (1.2k, 3.4M). */
export function countText(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '—'
  if (value < 1_000) return String(value)
  if (value < 1_000_000) return `${(value / 1_000).toFixed(value < 10_000 ? 1 : 0)}k`
  return `${(value / 1_000_000).toFixed(1)}M`
}

// ── Classification labels ───────────────────────────────────────────────────

/**
 * The label to print for one classification.
 *
 * Preference order, and the reason for it:
 *  1. the registry's label in the reader's language;
 *  2. the registry's label in the other language — a Chinese label under an
 *     English UI is still more informative than `design-poster`;
 *  3. the key itself, de-hyphenated, because a raw `business-ops` next to a
 *     proper chip reads as a rendering bug.
 *
 * The *key* is never hidden behind a label: it is what a future category filter
 * and any support question will use, so `CategoryRef` carries both.
 */
export function categoryLabelText(ref: { key: string; labelZh?: string; labelEn?: string }, locale: 'zh' | 'en'): string {
  const preferred = locale === 'en' ? ref.labelEn : ref.labelZh
  const other = locale === 'en' ? ref.labelZh : ref.labelEn
  const chosen = preferred ?? other
  if (chosen !== undefined && chosen.trim() !== '') return chosen
  return humanizeKey(ref.key)
}

/** `design-media` → `Design Media`; the last resort before showing nothing. */
export function humanizeKey(key: string): string {
  const spaced = key.replace(/[-_]+/g, ' ').trim()
  if (spaced === '') return key
  return spaced.replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
}
