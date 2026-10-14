/**
 * The installed tab: what is on this disk, and what can be done with it.
 *
 * Two rules shape this view, and both come from the same fact — the host refuses
 * to delete a directory it cannot prove it wrote:
 *
 *  - **Ownership is shown, not implied.** A managed skill and a hand-written one
 *    look the same on disk, so the row says which is which, and the removal button
 *    is only offered for entries the host will actually remove. Offering it and
 *    then failing would be worse than not offering it.
 *  - **The path is shown before removal.** The confirmation names the exact
 *    directory, because "uninstall demo" is ambiguous when two roots can hold a
 *    directory by that name.
 */
import type { InstalledSkillDetail, InstalledSkillRecord, MarketFileContent } from '../api.ts';
/**
 * The source to filter the inventory by.
 *
 * `'all'` is a UI sentinel, not a registry: `source` on a record is a market
 * source or the literal `local` for a directory this plugin did not write.
 */
type InstalledSourceFilter = 'all' | 'local' | 'clawhub' | 'skillhub';
export interface InstalledPanelProps {
    items: InstalledSkillRecord[];
    loading: boolean;
    error: string | null;
    detail: InstalledSkillDetail | null;
    detailLoading: boolean;
    detailError: string | null;
    file: MarketFileContent | null;
    fileLoading: boolean;
    fileError: string | null;
    onRefresh: () => void;
    onOpen: (key: string) => void;
    onCloseDetail: () => void;
    onSelectFile: (path: string) => void;
    onRequestRemove: (key: string) => void;
}
/**
 * The entries a filter and a search term leave visible.
 *
 * Extracted from the component because it is the only part of this view with a
 * decision in it, and a rendered snapshot can only ever prove the unfiltered case:
 * `renderToStaticMarkup` runs no effects and no event handlers, so nothing in a
 * static render can select a different source. A pure function is testable, and
 * the component keeps only the wiring.
 *
 * The two conditions are an AND, and the search covers the same fields it always
 * did — the source filter narrows what the search looks through, rather than
 * replacing it.
 */
export declare function filterInstalled(items: readonly InstalledSkillRecord[], source: InstalledSourceFilter, query: string): InstalledSkillRecord[];
export declare function InstalledPanel(props: InstalledPanelProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=InstalledPanel.d.ts.map