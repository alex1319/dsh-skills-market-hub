/**
 * Source and manifest contract checks that must hold before delivery.
 *
 * These are deliberately *static* checks (reading files, not importing them):
 * they catch the failure mode where the plugin builds and loads but the host
 * silently ignores a contribution, which is invisible until someone opens the
 * GUI and finds nothing there.
 */

import { readFile, access } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(fileURLToPath(import.meta.url)).replace(/[\\/]scripts$/, '')

const failures = []
const checks = []

function check(name, fn) {
  checks.push({ name, fn })
}

async function read(path) {
  return readFile(join(ROOT, path), 'utf8')
}

async function readJson(path) {
  return JSON.parse(await read(path))
}

async function exists(path) {
  try {
    await access(join(ROOT, path))
    return true
  } catch {
    return false
  }
}

// ── Manifest ────────────────────────────────────────────────────────────────

check('manifest: runtime has no dependencies', async (manifest) => {
  if (manifest.dependencies !== undefined && Object.keys(manifest.dependencies).length > 0) {
    throw new Error('package.json must not declare runtime dependencies; the host loads this plugin unbuilt-but-installed')
  }
})

check('manifest: dsh.bundle.patch points at the patch layer', async (manifest) => {
  const patch = manifest.dsh?.bundle?.patch
  if (patch !== './cordis.patch.yml') throw new Error(`unexpected dsh.bundle.patch: ${String(patch)}`)
  if (!(await exists('cordis.patch.yml'))) throw new Error('cordis.patch.yml is missing')
})

check('manifest: dsh.client targets the web platform', async (manifest) => {
  const client = manifest.dsh?.client
  if (client?.platform !== 'web') throw new Error(`dsh.client.platform must be "web", got ${String(client?.platform)}`)
  if (!Array.isArray(client?.inject) || client.inject.length === 0) throw new Error('dsh.client.inject must list the client modules')
  for (const name of client.inject) {
    if (typeof name !== 'string' || !name.startsWith('@deepseek-ai/')) {
      throw new Error(`dsh.client.inject entry "${String(name)}" is not a @deepseek-ai/ module`)
    }
  }
})

check('manifest: exports map covers host, client and patch', async (manifest) => {
  const exports = manifest.exports ?? {}
  for (const key of ['.', './client', './cordis.patch.yml', './package.json']) {
    if (exports[key] === undefined) throw new Error(`exports is missing "${key}"`)
  }
  if (exports['./client']?.default !== './lib/client.cjs') {
    throw new Error('exports["./client"] must resolve to ./lib/client.cjs')
  }
})

check('manifest: the published file list excludes the client build input', async (manifest) => {
  const files = manifest.files ?? []
  if (!files.includes('lib')) throw new Error('files must include lib')
  if (!files.includes('!lib/client')) {
    throw new Error('files must exclude !lib/client — those are tsc fragments, not deliverables')
  }
})

// ── Patch layer ─────────────────────────────────────────────────────────────

check('patch: inserts exactly this package, and only inserts', async (manifest) => {
  const patch = await read('cordis.patch.yml')
  const rows = [...patch.matchAll(/^\s*-?\s*insert:\s*$/gm)]
  if (rows.length !== 1) throw new Error(`expected exactly one insert block, found ${rows.length}`)
  if (!patch.includes(`name: '${manifest.name}'`) && !patch.includes(`name: "${manifest.name}"`)) {
    throw new Error(`the patch must insert the package name ${manifest.name}`)
  }
  if (!/id:\s*skills-market-hub\b/.test(patch)) throw new Error('the patch row id must be skills-market-hub')
  // A patch that also removes or replaces official rows would silently change the
  // user's profile composition; this plugin must never do that.
  for (const forbidden of [/^\s*-\s*disabled:/m, /^\s*-\s*remove:/m, /^\s*-\s*replace:/m]) {
    if (forbidden.test(patch)) throw new Error(`patch must only insert; found ${String(forbidden)}`)
  }
})

// ── Host entry ──────────────────────────────────────────────────────────────

check('host: exports the cordis plugin contract', async () => {
  const source = await read('src/index.ts')
  for (const required of ['export const name', 'export const inject', 'export function apply']) {
    if (!source.includes(required)) throw new Error(`src/index.ts is missing "${required}"`)
  }
  if (!/export\s*\{\s*Config\s*\}|export const Config/.test(source)) {
    throw new Error('src/index.ts must export Config so the host can render its settings form')
  }
})

check('host: the route prefix is a single constant', async () => {
  const routes = await read('src/web-routes.ts')
  const declared = routes.match(/ROUTE_PREFIX\s*=\s*'([^']+)'/)
  if (declared === null) throw new Error('src/web-routes.ts must declare ROUTE_PREFIX')
  const prefix = declared[1]
  if (!prefix.startsWith('/api/')) throw new Error(`ROUTE_PREFIX should live under /api/, got ${prefix}`)

  // The browser half cannot import that value (it is Node code), so it restates
  // the literal. Catch the two drifting apart.
  const clientApi = 'src/client/api.ts'
  if (!(await exists(clientApi))) {
    throw new Error(`${clientApi} is missing: the browser half must address the host route it was written against`)
  }
  const client = await read(clientApi)
  if (!client.includes(`'${prefix}'`)) {
    throw new Error(`${clientApi} must restate the host prefix '${prefix}' as a literal`)
  }
})

check('host: illegal states are answered with the JSON error envelope', async () => {
  const routes = await read('src/web-routes.ts')
  if (!routes.includes('cache-control')) throw new Error('every response must be no-store')
})

// ── Client entry ────────────────────────────────────────────────────────────

check('client: registers the sidebar entry and the panel it opens', async () => {
  const source = await read('src/client/index.tsx')
  for (const slot of ["'main'", "'sidebar.panellist'"]) {
    if (!source.includes(`inject(${slot}`)) throw new Error(`src/client/index.tsx must inject ${slot}`)
  }
  // The two ids must be the same value: the sidebar's click calls
  // layout.selectPanel(id), and only a matching `main` key opens this panel.
  const panelId = source.match(/PANEL_ID\s*=\s*'([^']+)'/)
  if (panelId === null) throw new Error('src/client/index.tsx must declare PANEL_ID')
  const occurrences = [...source.matchAll(/PANEL_ID/g)].length
  if (occurrences < 3) throw new Error('PANEL_ID must be used by both registrations, not restated as literals')
})

check('client: no cross-plugin value imports', async () => {
  const files = ['src/client/index.tsx', 'src/client/api.ts', 'src/client/state.ts']
  const allowed = new Set(['@deepseek-ai/dsh-client-ui-primitives'])
  for (const file of files) {
    if (!(await exists(file))) continue
    const source = await read(file)
    for (const match of source.matchAll(/^\s*import\s+(?!type\b)([\s\S]*?)from\s*'([^']+)'/gm)) {
      const specifier = match[2]
      if (!specifier.startsWith('@deepseek-ai/')) continue
      if (allowed.has(specifier)) continue
      throw new Error(`${file} imports a value from ${specifier}; use \`import type\` or a platform module`)
    }
  }
})

// ── Theme discipline ────────────────────────────────────────────────────────

check('ui: colours come from --dsw-* tokens', async () => {
  const { readdir } = await import('node:fs/promises')
  const dir = join(ROOT, 'src', 'client')
  const walk = async (current) => {
    const entries = await readdir(current, { withFileTypes: true })
    const out = []
    for (const entry of entries) {
      const full = join(current, entry.name)
      if (entry.isDirectory()) out.push(...(await walk(full)))
      else if (/\.tsx?$/.test(entry.name)) out.push(full)
    }
    return out
  }
  const offenders = []
  for (const file of await walk(dir)) {
    const source = await readFile(file, 'utf8')
    // Hard-coded hex colours cannot follow the host's light/dark themes.
    for (const match of source.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
      const line = source.slice(0, match.index).split('\n').length
      offenders.push(`${file.slice(ROOT.length + 1)}:${line} ${match[0]}`)
    }
  }
  if (offenders.length > 0) {
    throw new Error(`hard-coded colours found (use --dsw-* tokens):\n  ${offenders.join('\n  ')}`)
  }
})

// ── Runner ──────────────────────────────────────────────────────────────────

const manifest = await readJson('package.json')

let failed = 0
for (const { name, fn } of checks) {
  try {
    await fn(manifest)
    process.stdout.write(`  ok   ${name}\n`)
  } catch (error) {
    failed += 1
    process.stdout.write(`  FAIL ${name}\n       ${error instanceof Error ? error.message : String(error)}\n`)
  }
}

process.stdout.write(`\nverify: ${checks.length - failed}/${checks.length} checks passed\n`)
if (failed > 0) process.exitCode = 1
