/**
 * The shell's active language, as a React value.
 *
 * The panel needs it for exactly one thing: choosing which of a registry's two
 * labels for a classification to show. Everything else it renders goes through
 * the namespace-bound `t` the slot hands it.
 *
 * Why this is a store rather than a prop: the shell owns the locale, and the panel
 * is registered into an outlet — there is no prop chain from the shell to here.
 * The shell does republish a snapshot on every change (`getSnapshot`/`subscribe`,
 * documented uSES-safe), so the panel can subscribe to it directly and re-render
 * the chips when the reader switches language.
 *
 * The face is optional at both ends on purpose: a composition that installs no
 * locale service still renders a correct panel, just with one fixed choice of
 * label. A missing language must never cost the reader a card.
 */

import { useSyncExternalStore } from 'react'

/** Languages this plugin ships a dictionary for — see `locales.ts`. */
export type MarketLocale = 'zh' | 'en'

/** The slice of the shell's locale service this module reads. */
export interface LocaleSnapshotFace {
  getLocale(): { readonly active: string }
  getSnapshot(): unknown
  subscribe(fn: () => void): () => void
}

let face: LocaleSnapshotFace | null = null
let active = 'zh'
const listeners = new Set<() => void>()

/**
 * Attach the shell's locale service.
 *
 * A service without `subscribe` is still used for its current value: reading the
 * active language once beats not knowing it at all, and the panel only re-renders
 * the chips on a language switch that it was told about.
 */
export function installMarketLocale(next: LocaleSnapshotFace | undefined): void {
  face = next !== undefined && typeof next.subscribe === 'function' ? next : null
  active = read(face)
  if (face !== null) {
    const attached = face
    attached.subscribe(() => {
      const value = read(attached)
      if (value === active) return
      active = value
      for (const listener of [...listeners]) listener()
    })
  }
}

/** Detach the subscription (unload). */
export function resetMarketLocale(): void {
  face = null
  listeners.clear()
}

function read(source: LocaleSnapshotFace | null): string {
  try {
    return source?.getLocale().active ?? 'zh'
  } catch {
    // A service that throws on read is not a language: fall back rather than
    // failing the render that asked.
    return 'zh'
  }
}

/** The active locale id, as the shell reports it. */
export function activeLocaleId(): string {
  return active
}

/**
 * The active locale, reduced to a language this plugin has labels for.
 *
 * Only English is distinguished: the shipped shell is Chinese-first, and a
 * language pack this plugin has never heard of has no better claim on the English
 * label than it does on the Chinese one.
 */
export function marketLocale(): MarketLocale {
  return /^en\b|^en-/i.test(active) ? 'en' : 'zh'
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** The active locale, re-rendering the caller when the reader switches language. */
export function useMarketLocale(): MarketLocale {
  return useSyncExternalStore(subscribe, marketLocale, marketLocale)
}
