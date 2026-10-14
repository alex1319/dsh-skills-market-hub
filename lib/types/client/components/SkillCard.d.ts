/**
 * One skill card, and the grid that holds them.
 *
 * The card answers four questions in reading order — what is it, who published
 * it, how popular is it, and is it safe/installed — because those are the four
 * things a reader weighs before opening a skill. Everything else waits for the
 * detail view.
 */
import type { NormalizedSkill } from '../api.ts';
export interface SkillCardProps {
    skill: NormalizedSkill;
    busy: boolean;
    onOpen: () => void;
    onInstall: () => void;
}
export declare function SkillCard({ skill, busy, onOpen, onInstall }: SkillCardProps): import("react").JSX.Element;
export interface SkillGridProps {
    skills: NormalizedSkill[];
    installingIds: string[];
    onOpen: (skill: NormalizedSkill) => void;
    onInstall: (skill: NormalizedSkill) => void;
}
export declare function SkillGrid({ skills, installingIds, onOpen, onInstall }: SkillGridProps): import("react").JSX.Element;
/**
 * Sentinel that asks for the next page when it scrolls into view.
 *
 * The observer is rooted at the scrolling container rather than the viewport: the
 * panel lives inside the shell's own scroll area, so a viewport-rooted observer
 * would report "not intersecting" for a sentinel that is already visible.
 */
export declare function LoadMoreSentinel({ onReach, rootRef }: {
    onReach: () => void;
    rootRef: {
        current: HTMLElement | null;
    };
}): import("react").JSX.Element;
//# sourceMappingURL=SkillCard.d.ts.map