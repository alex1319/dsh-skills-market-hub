/**
 * Panel-scoped translation.
 *
 * The framework hands the panel root a namespace-bound `t` (the slot was
 * registered with `locale: NS`). Reaching it from every nested component through
 * props would thread a function through a dozen layers, so the root puts it on a
 * context instead.
 *
 * `useT` **throws** outside the provider rather than falling back to printing raw
 * keys. A missing provider is a wiring mistake, and a panel that renders
 * `skillsMarketHub.install` on a button is harder to diagnose than a crash in the
 * error boundary that names the component.
 */

import { createContext, useContext, type ReactNode } from 'react'
import { marketLocale, type MarketLocale } from './locale-store.ts'

/** A namespace-bound translate function. */
export type Translate = (key: string, params?: Record<string, unknown>) => string

interface PanelLocale {
  t: Translate
  locale: MarketLocale
}

const TranslateContext = createContext<PanelLocale | null>(null)

export function TranslateProvider({ t, locale, children }: { t: Translate; locale: MarketLocale; children: ReactNode }) {
  return <TranslateContext.Provider value={{ t, locale }}>{children}</TranslateContext.Provider>
}

/** The panel's translate function. */
export function useT(): Translate {
  const seat = useContext(TranslateContext)
  if (seat === null) {
    throw new Error('useT() was called outside a TranslateProvider; the panel root must supply the locale seat it was registered with')
  }
  return seat.t
}

/**
 * The active language, taken from the seat the slot handed the panel.
 *
 * Read from the provider rather than from the store directly so a component
 * rendered in isolation (a test, a story) sees the same language as its `t`.
 */
export function useLocale(): MarketLocale {
  return useContext(TranslateContext)?.locale ?? marketLocale()
}
