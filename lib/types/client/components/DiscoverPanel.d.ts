/**
 * The Discover section: a shelf of ranked skills, and the shelves beside it.
 *
 * This view is deliberately the *opposite* of the market list. The market list is
 * a grid of cards with filters, a search box, and paging, because its question —
 * "find me this one thing" — needs all three. Discover answers "what is worth
 * looking at", which is a browsing question: one column of names, one number per
 * row, and five shelves to switch between. A search box here would be a second
 * copy of the market tab's, and the categories would be a second copy of its
 * filter bar.
 *
 * Three decisions are worth stating, because each one is visible:
 *
 *  - **The number on the right is the number the shelf ranked by.** The host sends
 *    the metric with the collection, so "新发布" prints a date and "装机最多"
 *    prints an install count. Printing downloads everywhere would be tidier and
 *    would also be false.
 *  - **A row opens the detail; the button installs.** The row itself is the link,
 *    so the whole line is a target rather than just the name — but install stays a
 *    separate control, because it writes to the reader's disk and must not be
 *    something a mis-aimed click on a list row can do.
 *  - **An empty shelf explains itself.** "官方" is sourced from the registries' own
 *    verification flag, which both publish rarely. A short shelf is a fact about
 *    the registries, and saying so is better than padding it with near-matches or
 *    hiding the shelf.
 */
import type { DiscoverCollection, DiscoverCollectionId, NormalizedSkill, SourceStatusInfo, MarketSource } from '../api.ts';
export interface DiscoverPanelProps {
    collections: DiscoverCollection[];
    active: DiscoverCollectionId;
    loading: boolean;
    error: string | null;
    installingIds: string[];
    sources: Record<MarketSource, SourceStatusInfo> | null;
    onSelect: (id: DiscoverCollectionId) => void;
    onOpen: (skill: NormalizedSkill) => void;
    onInstall: (skill: NormalizedSkill) => void;
    onRefresh: () => void;
    onFindMore: () => void;
}
export declare function DiscoverPanel(props: DiscoverPanelProps): import("react").JSX.Element;
//# sourceMappingURL=DiscoverPanel.d.ts.map