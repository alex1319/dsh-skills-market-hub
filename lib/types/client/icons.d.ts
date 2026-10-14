/**
 * Sidebar artwork for the Skills Market row.
 *
 * Drawn locally rather than assembled from the icon kit: the panel row wants one
 * glyph that reads as "marketplace", and no shipped icon says that (the closest,
 * `IconSkillOutlineRegular`, is already spent on the skill picker). The shape
 * follows the kit's own geometry rules — a 24-unit viewBox rendered at the
 * requested edge, 1.7px stroke on the same optical weight, and `currentColor` so
 * the row's active/inactive colouring comes from the sidebar rather than from
 * this file.
 *
 * The row receives the sidebar's own owner share: `size` is the requested square
 * edge in pixels and `active` reports selection, which only thickens the stroke.
 */
export interface SidebarPanelIconProps {
    /** Requested square edge in pixels. */
    size: number;
    /** Whether this panel is selected in the main column. */
    active: boolean;
}
export declare function SkillsMarketIcon({ size, active }: SidebarPanelIconProps): import("react").JSX.Element;
//# sourceMappingURL=icons.d.ts.map