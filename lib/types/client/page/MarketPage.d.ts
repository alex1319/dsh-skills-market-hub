/**
 * Skills Market panel root.
 *
 * This is the one component that receives the framework's locale seat (`t`),
 * because it is the entry point the slot registered with `locale: NS`. It owns
 * the controller, publishes that seat to the subtree through the translate
 * context, and switches between the three sections.
 *
 * The controller lives in a ref rather than in state: React must not re-create it
 * on a re-render, or every render would cancel the request the previous render
 * started.
 */
import { type Translate } from '../translate.tsx';
import { type MarketState } from '../state.ts';
import type { NormalizedSkill } from '../api.ts';
/** Props the framework composes onto the `main` entry: the locale seat only. */
export interface MarketPageProps {
    t: Translate;
}
/**
 * Which skill a pending install confirmation is about.
 *
 * The reader can press Install from three places — a market card, a Discover row,
 * or the detail page — and the confirmation has to render wherever they are, so the
 * target is resolved from the state rather than captured at click time.
 *
 * Exported and pure because it is the only decision on this wiring path, and a
 * static render cannot press a button: every panel-level test would pass while the
 * button did nothing. **That is exactly what happened.** The lookup searched the
 * market list and the detail page and never the shelves, so pressing Install on
 * Discover recorded the request correctly and then silently rendered no dialog —
 * the worst shape of bug, because nothing errors and the click looks ignored. It
 * was reachable for most readers because the panel opens on Discover while the
 * market list is now read lazily, leaving `items` empty at the first press.
 *
 * The shelves are searched first for that reason: on this panel they are the
 * likeliest place the click came from.
 */
export declare function installTargetOf(state: MarketState): NormalizedSkill | undefined;
/**
 * Outer shell: supplies the panel's seats, then renders it.
 *
 * The language comes from the shell's own locale service rather than from the
 * `t` seat, because `t` can only answer questions about *copy this plugin
 * authored* — and a registry's classification labels are not ours to author. The
 * panel re-renders the chips when the reader switches language, which is what the
 * subscription in `locale-store.ts` exists for.
 */
export declare function MarketPage({ t }: MarketPageProps): import("react").JSX.Element;
//# sourceMappingURL=MarketPage.d.ts.map