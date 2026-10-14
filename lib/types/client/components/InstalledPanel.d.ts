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
export declare function InstalledPanel(props: InstalledPanelProps): import("react").JSX.Element;
//# sourceMappingURL=InstalledPanel.d.ts.map