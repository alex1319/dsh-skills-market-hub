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

import type { Context } from '@deepseek-ai/cordis'
import { Config, resolveConfig, type SkillsMarketHubConfig } from './config.ts'
import { createRoutes } from './routes.ts'
import { MarketCache, marketCacheDirectory } from './market/cache.ts'
import { clawhubProvider } from './market/clawhub-provider.ts'
import { skillhubProvider } from './market/skillhub-provider.ts'
import { installedLookupFrom, scanInstalledSkills } from './skills/installed.ts'
import { resolveDshHome, resolveSkillsRoot, resolveSkillsScanRoots } from './skills/root.ts'
import {
  getMarketStats,
  setInstalledLookup,
  setMarketCache,
  setProviders,
} from './market/market-service.ts'
import {
  configureProviderFetch,
  getSourceStatus,
  resetProviderFetchConfiguration,
  resetSourceStatus,
  withProviderConfiguration,
} from './market/provider-fetch.ts'
import { resetInstallLocks, sweepStagingDirectories } from './skills/install-service.ts'
import { detectStaleBuild, staleBuildWarning } from './stale-build.ts'
import {
  readJsonBody,
  registerSkillsMarketHubRoutes,
  type GateSource,
  type RequestGate,
  type RouteContext,
  type WebServerLike,
} from './web-routes.ts'
import type { InstalledSkillRecord } from './market/types.ts'

/** Stable plugin name; also the loader row id declared by `cordis.patch.yml`. */
export const name = 'skills-market-hub'

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
export const inject: string[] = []

export { Config }

/**
 * Plugin version, reported by `/version`.
 *
 * Restated rather than imported from package.json: a JSON import would sit
 * outside `rootDir`, which makes the declaration output path depend on the
 * compiler's root inference. `scripts/verify.mjs` asserts this literal matches
 * the manifest instead.
 */
export const PLUGIN_VERSION = '0.1.6'

/** Web-server service keys, newest first (older compositions spell it `httpServer`). */
const WEB_SERVER_KEYS = ['webServer', 'httpServer'] as const

/** Structural view of the optional skill registry, which this plugin only reads. */
interface SkillCatalogLike {
  snapshot?: (options?: { cwd?: string }) => Promise<unknown>
}

/**
 * Re-read the skill catalog after a successful filesystem change.
 *
 * There is no registry-wide rescan entry point: `SkillRegistry` exposes
 * list/snapshot/get/register/registerProvider, and the invalidation hooks are
 * either provider-scoped or the actor-gated `fs/observed` event — which this
 * plugin must not forge, because that event carries an authoritative tool
 * observation for the whole host. What actually republishes the change is DSH's
 * own watcher, which invalidates the catalog on the directory events an atomic
 * publish produces.
 *
 * So this call is a *read*: it settles the catalog for a consumer asking right
 * after the HTTP response instead of leaving them to race the watcher's stability
 * threshold. A composition without the service simply skips it.
 */
async function refreshSkillCatalog(ctx: Context): Promise<void> {
  const skills = ctx.get('skills') as SkillCatalogLike | undefined
  if (skills?.snapshot === undefined) return
  try {
    await skills.snapshot({})
  } catch (error) {
    ctx.logger.warn(`skills-market-hub: skill catalog refresh failed: ${String(error)}`)
  }
}

/**
 * Activate the plugin.
 *
 * @param ctx - host plugin context.
 * @param config - resolved {@link SkillsMarketHubConfig} (schema defaults already applied).
 */
export function apply(ctx: Context, config?: Partial<SkillsMarketHubConfig>): void {
  const resolved = resolveConfig(config)
  let disposed = false

  // Provider endpoints, timeout, and retry budget are process-wide in the fetch
  // layer; the per-operation snapshot `withProviderConfiguration` pins them.
  configureProviderFetch({
    clawhubBaseUrl: resolved.clawhubBaseUrl,
    skillhubBaseUrl: resolved.skillhubBaseUrl,
    timeoutMs: resolved.timeoutMs,
    retries: resolved.requestRetries,
  })

  const dshHome = resolveDshHome()
  const cache = new MarketCache({
    directory: marketCacheDirectory(dshHome),
    ttlMs: resolved.cacheTtlMinutes * 60_000,
    onError: (error) => ctx.logger.warn(`skills-market-hub: persistent cache unavailable: ${String(error)}`),
  })

  setProviders({ clawhub: clawhubProvider, skillhub: skillhubProvider })
  setMarketCache(cache)

  /** The most recent inventory scan, kept so the list endpoint can answer from it. */
  let inventory: InstalledSkillRecord[] = []

  /** Rebuild the inventory index and hand it to the market layer. */
  const refreshInstalledIndex = async (): Promise<void> => {
    const roots = await resolveSkillsScanRoots(resolved.skillsRoot)
    const records = await scanInstalledSkills(roots)
    // A refresh that lost the race with unload must not publish over a newer
    // plugin instance that may already own the seam.
    if (disposed) return
    inventory = records
    setInstalledLookup(installedLookupFrom(records))
  }

  /**
   * The single refresh entry point: routes call it after a successful
   * install/uninstall, and it also runs once at activation. It never throws — the
   * caller has already succeeded at the operation it is refreshing for.
   */
  const rescan = async (): Promise<void> => {
    try {
      await refreshInstalledIndex()
    } catch (error) {
      ctx.logger.warn(`skills-market-hub: installed-skill index refresh failed: ${String(error)}`)
      return
    }
    await refreshSkillCatalog(ctx)
  }

  ctx.effect(() => () => {
    disposed = true
    // Module-scoped seams outlive this plugin instance: drop ours so a reloaded
    // instance cannot serve the previous one's inventory or provider table, and
    // `disposed` above stops an in-flight scan from republishing it.
    setInstalledLookup({ has: () => false, info: () => undefined })
    setMarketCache(null)
    resetSourceStatus()
    resetProviderFetchConfiguration()
    resetInstallLocks()
  }, 'skills-market-hub: activation state')

  // Apply is synchronous, but the first HTTP read must wait for install
  // annotations even when a persisted snapshot arrives before the scan does.
  const initialScan = refreshInstalledIndex().catch((error) => {
    ctx.logger.warn(`skills-market-hub: installed-skill index refresh failed: ${String(error)}`)
  })
  void initialScan.then(() => refreshSkillCatalog(ctx))

  /**
   * Report a staging directory that survived its own cleanup.
   *
   * This is the one place the user can learn that something on their machine is
   * holding a handle inside the skills directory. It is a warning and not an
   * error: the install it belonged to may well have succeeded, and the leftover
   * is invisible to the inventory either way.
   */
  const reportStuckStaging = (stagingPath: string): void => {
    ctx.logger.warn(
      `skills-market-hub: could not remove the staging directory ${stagingPath}; `
      + 'something on this machine is holding it (a scanner, indexer, or sync tool). '
      + 'It is ignored by the skill inventory, and the next install will try again.',
    )
  }

  // Clear what an earlier session could not: a staging directory only ever
  // outlives its install when a handle was held on it, and that handle is
  // released when the process holding it exits — which is exactly what restarting
  // the harness does. Reported once at startup rather than on every install.
  void resolveSkillsRoot(resolved.skillsRoot)
    .then((root) => sweepStagingDirectories(root))
    .then((stuck) => { for (const leftover of stuck) reportStuckStaging(leftover) })
    .catch(() => undefined)

  const routeContext: RouteContext = {
    pageSize: resolved.pageSize,
    version: PLUGIN_VERSION,
    readBody: (req) => readJsonBody(req),
    skillsRoot: async () => await resolveSkillsRoot(resolved.skillsRoot),
    scanRoots: async () => await resolveSkillsScanRoots(resolved.skillsRoot),
    inventory: async () => inventory,
    allowUninstall: () => resolved.allowUninstall,
    rescan: async () => {
      // Every upstream read for one refresh rides a single configuration snapshot,
      // so a profile reload mid-operation cannot mix two provider configurations.
      await withProviderConfiguration(async () => {
        await rescan()
      })
    },
    onStuckStaging: reportStuckStaging,
    stats: () => getMarketStats(cache),
  }

  // The web server may bind before or after this plugin (the Loader activates
  // rows concurrently), and older compositions name the service `httpServer`.
  // Bind lazily on the first service event that makes a server reachable.
  let webRegistered = false
  const registerWebSurface = (): void => {
    if (webRegistered || disposed) return
    const webServer = (ctx.get(WEB_SERVER_KEYS[0]) ?? ctx.get(WEB_SERVER_KEYS[1])) as WebServerLike | undefined
    if (webServer === undefined) return
    // `requestRejection` belongs to the browser-trust fence of the Connection
    // service. Resolved per request, never captured here: the Connection row can
    // activate after this route is registered, and a snapshot would leave the
    // marketplace readable — and installable — from any web page.
    const gate: GateSource = () => ctx.get('connection') as unknown as RequestGate | undefined
    // `ctx.effect` runs the factory immediately; `dsh-host-webserver` throws on a
    // duplicate route path, so the flag may only be set once registration has
    // actually succeeded. Setting it first turned a failed registration into a
    // permanent activation failure with no retry on the next service event.
    ctx.effect(
      () => registerSkillsMarketHubRoutes(webServer, gate, routeContext, createRoutes(), () => initialScan),
      'skills-market-hub: HTTP API',
    )
    webRegistered = true
  }
  registerWebSurface()
  ctx.on('internal/service', (serviceName: string) => {
    if (serviceName === WEB_SERVER_KEYS[0] || serviceName === WEB_SERVER_KEYS[1]) registerWebSurface()
  })

  ctx.logger.info(
    `skills-market-hub: ready (v${PLUGIN_VERSION}, root=${resolved.skillsRoot ?? '$DSH_HOME/skills'}, install=${dshHome}, uninstall=${resolved.allowUninstall ? 'on' : 'off'}, cache=${resolved.cacheTtlMinutes}m)`,
  )

  // A `file:` install is a copy, so the code that just loaded can be older than
  // the package beside it. Saying so once at activation is the difference between
  // "the fix did not work" and "the fix is not what is running".
  const stale = detectStaleBuild(PLUGIN_VERSION, import.meta.url, 'dsh-skills-market-hub')
  if (stale.stale) ctx.logger.warn(`skills-market-hub: ${staleBuildWarning(stale)}`)

  // The panel's status bar reads this on first paint; touching it here means the
  // first response already carries a real shape rather than an empty object.
  void getSourceStatus()
}
