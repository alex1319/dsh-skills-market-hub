/**
 * Skills Market panel root.
 *
 * This is the one component that receives the framework's locale seat (`t`),
 * because it is the entry point the slot registered with `locale: NS`. It owns
 * the controller, publishes that seat to the subtree through the translate
 * context, and switches between the two sections.
 *
 * The controller lives in a ref rather than in state: React must not re-create it
 * on a re-render, or every render would cancel the request the previous render
 * started.
 */
import { type Translate } from '../translate.tsx';
/** Props the framework composes onto the `main` entry: the locale seat only. */
export interface MarketPageProps {
    t: Translate;
}
/** Outer shell: supplies the controller's locale seat, then renders the panel. */
export declare function MarketPage({ t }: MarketPageProps): import("react").JSX.Element;
//# sourceMappingURL=MarketPage.d.ts.map