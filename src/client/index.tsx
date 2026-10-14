/**
 * Skills Market, browser half.
 *
 * Two registrations, exactly the shape the shell expects of a global panel:
 *
 *   ctx.slots.inject('main', …)              → the panel body, keyed by PANEL_ID
 *   ctx.slots.inject('sidebar.panellist', …) → the sidebar row that opens it
 *
 * `slots.inject` waits for the declaring entry (the frame declares `main`, the
 * sidebar declares `sidebar.panellist`) and keeps each registration on this
 * plugin's fiber, so unloading the plugin removes both contributions.
 *
 * Selecting the panel is **not** done here: the sidebar renders each
 * `sidebar.panellist` entry inside its own `<button>` whose click calls
 * `selectPanel(id)` → `ctx.layout.selectPanel(id)`. Because our entry `id` equals
 * the `main` registration key, that call opens this panel; adding our own button
 * or a second `selectPanel` call would nest interactive elements and fight the
 * shell.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: merges `SlotMap['main']`, `SlotMap['sidebar.panellist']` and the
// `ctx.layout` service face into the contracts. Erased at build time, so these
// packages stay development-only type sources and never enter the bundle.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { SlotCore, SlotMap } from '@deepseek-ai/dsh-client-ui-slots'
import { MarketPage } from './page/MarketPage.tsx'
import { SkillsMarketIcon } from './icons.tsx'
import { NS, en, zh } from './locales.ts'

/** Stable plugin name of the browser half. */
export const name = 'skills-market-hub-client'

/**
 * Services required before the registrations can be made. `slots` is the registry
 * itself; `locale` owns the dictionary this panel translates through. `layout` is
 * deliberately absent — the sidebar selects the panel for us.
 */
export const inject: string[] = ['slots', 'locale']

/** Sidebar entry id and `main` slot key — the same value is what links the two. */
export const PANEL_ID = 'skills-market-hub'

/**
 * The slice of the renderer-owned `SlotRegistry` this plugin touches.
 *
 * Declared structurally from the real service contract rather than imported:
 * `@deepseek-ai/dsh-client-ui-renderer` (which provides the service) is not a
 * dependency of this package.
 */
interface SlotsFace {
  inject(key: keyof SlotMap & string, callback: () => (() => void) | Iterable<() => void>): () => void
  register: SlotCore['register']
}

/** Locale face used at activation time (the injected `t` seat covers the panel). */
interface LocaleFace {
  register(ns: string, locale: string, dict: Record<string, string>): () => void
}

/** Register the sidebar entry and the panel it opens. */
export function apply(ctx: ClientContext): void {
  const slots = (ctx as ClientContext & { readonly slots: SlotsFace }).slots
  const locale = (ctx as ClientContext & { readonly locale: LocaleFace }).locale

  // Both dictionaries ride one effect so an unload removes them together.
  ctx.effect(() => {
    const offZh = locale.register(NS, 'zh', zh)
    const offEn = locale.register(NS, 'en', en)
    return () => {
      offEn()
      offZh()
    }
  }, 'skills-market-hub: dictionaries')

  // The generator form mirrors the plugin manager: the injected effect owns the
  // registration for as long as `main` is declared.
  slots.inject('main', function* () {
    yield slots.register(
      { name: 'main', key: PANEL_ID, locale: NS },
      MarketPage,
    )
  })

  // A fresh id adds a row beside the shipped panel icons rather than replacing
  // one; the icon receives the column's own props (requested size, active state).
  slots.inject('sidebar.panellist', () =>
    slots.register(
      { name: 'sidebar.panellist', id: PANEL_ID, order: 20, locale: NS, label: () => PANEL_LABEL },
      SkillsMarketIcon,
    ))
}

/**
 * Sidebar row label.
 *
 * Restated here rather than read through `locale.bind`: the label thunk is called
 * by the sidebar outside a React render, and re-registering the row on every
 * locale switch would churn the slot ledger for a cosmetic change. The host ships
 * a Chinese-first UI, so the row reads Chinese; the panel itself is localized.
 */
const PANEL_LABEL = '技能市场'
