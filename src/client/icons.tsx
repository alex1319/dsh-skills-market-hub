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
  size: number
  /** Whether this panel is selected in the main column. */
  active: boolean
}

export function SkillsMarketIcon({ size, active }: SidebarPanelIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 2 : 1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {/* Awning: the market stall's canopy. */}
      <path d="M3.6 9.2 5.1 4.6h13.8l1.5 4.6" />
      {/* Canopy folds. */}
      <path d="M3.6 9.2c0 1.5 1.2 2.6 2.7 2.6s2.7-1.1 2.7-2.6c0 1.5 1.2 2.6 2.7 2.6s2.7-1.1 2.7-2.6c0 1.5 1.2 2.6 2.7 2.6s2.7-1.1 2.7-2.6" />
      {/* Counter and its legs. */}
      <path d="M5.4 13.4v6.1h13.2v-6.1" />
      <path d="M9.4 19.5v-4.4h5.2v4.4" />
    </svg>
  )
}
