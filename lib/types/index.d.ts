/**
 * Skills Market — DeepSeek Harness host plugin.
 *
 * Adds the market half of the Skills Market panel to a DSH profile:
 *
 *  - `/api/skills-market-hub/*` (browse, search, detail, file preview, local
 *    inventory, install, uninstall) served from the composition's web server;
 *  - installation into the DSH user skills directory, so an installed skill is
 *    immediately discoverable by the `skill` tool;
 *  - the installed-skill index the market layer annotates its listings with.
 *
 * Installation is deliberately not an agent feature: it is plain filesystem work
 * plus HTTP, no agent session is involved, and the tools registry is untouched.
 *
 * @module dsh-skills-market-hub
 */
import type { Context } from '@deepseek-ai/cordis';
import { Config, type SkillsMarketHubConfig } from './config.ts';
/** Stable plugin name; also the loader row id declared by `cordis.patch.yml`. */
export declare const name = "skills-market-hub";
/**
 * Required services — empty on purpose.
 *
 * Nothing must exist for this plugin to *load*. The web server is looked up
 * lazily (`ctx.get`, both known keys) and bound whenever it appears, so a
 * headless profile keeps the plugin inert instead of pending forever on a
 * service key that composition never provides. Injecting `'webServer'` here
 * would make the plugin unusable in the very profiles where the harness would
 * still boot it, and would break on a composition that spells the service
 * `httpServer`.
 */
export declare const inject: string[];
export { Config };
/**
 * Plugin version, reported by `/version`.
 *
 * Restated rather than imported from package.json: a JSON import would sit
 * outside `rootDir`, which makes the declaration output path depend on the
 * compiler's root inference. `scripts/verify.mjs` asserts this literal matches
 * the manifest instead.
 */
export declare const PLUGIN_VERSION = "0.1.4";
/**
 * Activate the plugin.
 *
 * @param ctx - host plugin context.
 * @param config - resolved {@link SkillsMarketHubConfig} (schema defaults already applied).
 */
export declare function apply(ctx: Context, config?: Partial<SkillsMarketHubConfig>): void;
//# sourceMappingURL=index.d.ts.map