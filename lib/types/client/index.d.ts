/**
 * Skills Market, browser half.
 *
 * Two registrations, exactly the shape the shell expects of a global panel:
 *
 *   ctx.slots.inject('main', …)              → the panel body, keyed by PANEL_ID
 *   ctx.slots.inject('sidebar.panellist', …) → the sidebar row that opens it
 *
 * `slots.inject` waits for the declaring entry (the frame declares `main`, the
 * sidebar declares `sidebar.panellist`) and keeps each registration on this
 * plugin's fiber, so unloading the plugin removes both contributions.
 *
 * Selecting the panel is **not** done here: the sidebar renders each
 * `sidebar.panellist` entry inside its own `<button>` whose click calls
 * `selectPanel(id)` → `ctx.layout.selectPanel(id)`. Because our entry `id` equals
 * the `main` registration key, that call opens this panel; adding our own button
 * or a second `selectPanel` call would nest interactive elements and fight the
 * shell.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
/** Stable plugin name of the browser half. */
export declare const name = "skills-market-hub-client";
/**
 * Services required before the registrations can be made. `slots` is the registry
 * itself; `locale` owns the dictionary this panel translates through. `layout` is
 * deliberately absent — the sidebar selects the panel for us.
 */
export declare const inject: string[];
/** Sidebar entry id and `main` slot key — the same value is what links the two. */
export declare const PANEL_ID = "skills-market-hub";
/** Register the sidebar entry and the panel it opens. */
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map