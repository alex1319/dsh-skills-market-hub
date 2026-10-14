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

/** A namespace-bound translate function. */
export type Translate = (key: string, params?: Record<string, unknown>) => string

const TranslateContext = createContext<Translate | null>(null)

export function TranslateProvider({ t, children }: { t: Translate; children: ReactNode }) {
  return <TranslateContext.Provider value={t}>{children}</TranslateContext.Provider>
}

/** The panel's translate function. */
export function useT(): Translate {
  const t = useContext(TranslateContext)
  if (t === null) {
    throw new Error('useT() was called outside a TranslateProvider; the panel root must supply the locale seat it was registered with')
  }
  return t
}
