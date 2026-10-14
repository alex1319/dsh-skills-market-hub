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
/** Languages this plugin ships a dictionary for — see `locales.ts`. */
export type MarketLocale = 'zh' | 'en';
/** The slice of the shell's locale service this module reads. */
export interface LocaleSnapshotFace {
    getLocale(): {
        readonly active: string;
    };
    getSnapshot(): unknown;
    subscribe(fn: () => void): () => void;
}
/**
 * Attach the shell's locale service.
 *
 * A service without `subscribe` is still used for its current value: reading the
 * active language once beats not knowing it at all, and the panel only re-renders
 * the chips on a language switch that it was told about.
 */
export declare function installMarketLocale(next: LocaleSnapshotFace | undefined): void;
/** Detach the subscription (unload). */
export declare function resetMarketLocale(): void;
/** The active locale id, as the shell reports it. */
export declare function activeLocaleId(): string;
/**
 * The active locale, reduced to a language this plugin has labels for.
 *
 * Only English is distinguished: the shipped shell is Chinese-first, and a
 * language pack this plugin has never heard of has no better claim on the English
 * label than it does on the Chinese one.
 */
export declare function marketLocale(): MarketLocale;
/** The active locale, re-rendering the caller when the reader switches language. */
export declare function useMarketLocale(): MarketLocale;
//# sourceMappingURL=locale-store.d.ts.map