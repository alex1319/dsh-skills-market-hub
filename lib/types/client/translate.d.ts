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
import { type ReactNode } from 'react';
import { type MarketLocale } from './locale-store.ts';
/** A namespace-bound translate function. */
export type Translate = (key: string, params?: Record<string, unknown>) => string;
export declare function TranslateProvider({ t, locale, children }: {
    t: Translate;
    locale: MarketLocale;
    children: ReactNode;
}): import("react").JSX.Element;
/** The panel's translate function. */
export declare function useT(): Translate;
/**
 * The active language, taken from the seat the slot handed the panel.
 *
 * Read from the provider rather than from the store directly so a component
 * rendered in isolation (a test, a story) sees the same language as its `t`.
 */
export declare function useLocale(): MarketLocale;
//# sourceMappingURL=translate.d.ts.map