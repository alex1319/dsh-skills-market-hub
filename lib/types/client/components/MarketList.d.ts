/**
 * The market list: search, filters, the card grid, and paging.
 *
 * Paging is an infinite scroll rather than page buttons. The host's cursor is
 * opaque by design, so exposing it as a page number would invent a contract the
 * registries do not offer — and "browsing a marketplace" is a scroll gesture, not
 * a query for row 25.
 */
import type { MarketState } from '../state.ts';
import type { MarketSource, NormalizedSkill, SecurityStatus } from '../api.ts';
/** The element that scrolls, so a paging sentinel is rooted inside the panel. */
export interface ScrollRoot {
    current: HTMLElement | null;
}
export interface MarketListProps {
    state: MarketState;
    scrollRoot: ScrollRoot;
    onOpen: (skill: NormalizedSkill) => void;
    onInstall: (skill: NormalizedSkill) => void;
    onLoadMore: () => void;
    onSearchDraft: (value: string) => void;
    onSubmitSearch: () => void;
    onClearFilters: () => void;
    onSetSource: (source: 'all' | MarketSource) => void;
    onSetSecurity: (security: 'all' | SecurityStatus) => void;
    onSetInstalled: (installed: 'all' | 'installed' | 'installable') => void;
    onRetry: () => void;
}
export declare function MarketList(props: MarketListProps): import("react").JSX.Element;
//# sourceMappingURL=MarketList.d.ts.map