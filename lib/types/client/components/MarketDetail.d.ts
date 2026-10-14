/**
 * Market skill detail: header, the four tabs, and the files pane.
 *
 * The description is rendered as **preformatted text, not markdown**. The shared
 * markdown renderer lives in the UI primitive kit, whose entry module statically
 * imports a syntax highlighter, a TeX renderer, and three dozen stylesheets —
 * pulling it in would put all of that in this plugin's bundle for one pane. Rather
 * than hand-roll a markdown subset and present it as faithful, the body is shown
 * as the author wrote it, and the Files tab offers the same document with its
 * frontmatter intact for anyone who wants the raw source.
 */
import type { DetailTab } from '../state.ts';
import type { MarketFileContent, NormalizedSkillDetail } from '../api.ts';
export interface MarketDetailProps {
    detail: NormalizedSkillDetail | null;
    loading: boolean;
    error: string | null;
    tab: DetailTab;
    file: MarketFileContent | null;
    fileLoading: boolean;
    fileError: string | null;
    busy: boolean;
    onBack: () => void;
    onSetTab: (tab: DetailTab) => void;
    onSelectFile: (path: string) => void;
    onInstall: () => void;
    onRetry: () => void;
}
export declare function MarketDetail(props: MarketDetailProps): import("react").JSX.Element | null;
//# sourceMappingURL=MarketDetail.d.ts.map