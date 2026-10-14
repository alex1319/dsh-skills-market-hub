/**
 * Probe: import the plugin exactly as the profile's loader will.
 *
 * Run from the profile directory so the plugin's own module resolution walks the
 * profile's `node_modules` — which is where its host-provided peers live. A pass
 * here means the loader will get past `import`; it says nothing about whether the
 * GUI renders, which is a browser-side question.
 *
 * Usage (from ~/.dsh/profiles/desktop):
 *   node D:/projects/dsh/dsh-skills-market-hub/scripts/probe-profile.mjs
 */

import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { existsSync } from 'node:fs'

const entry = resolve('node_modules', 'dsh-skills-market-hub', 'lib', 'index.js')
if (!existsSync(entry)) {
  console.error(`not installed here: ${entry}`)
  console.error('run this from the profile directory (e.g. ~/.dsh/profiles/desktop)')
  process.exit(1)
}

const plugin = await import(pathToFileURL(entry).href)
const require = createRequire(entry)

const peers = ['@deepseek-ai/schemastery', '@deepseek-ai/cordis']
const resolved = {}
for (const peer of peers) {
  try {
    resolved[peer] = require.resolve(peer)
  } catch (error) {
    resolved[peer] = `UNRESOLVED: ${error.code ?? error.message}`
  }
}

// The client bundle is served to the browser, never imported by Node; it is read
// here only to confirm the host can hand over a well-formed artifact.
const bundlePath = resolve('node_modules', 'dsh-skills-market-hub', 'lib', 'client.cjs')
const { readFileSync } = await import('node:fs')
const bundleHead = existsSync(bundlePath) ? readFileSync(bundlePath, 'utf8').slice(0, 200) : ''

console.log(JSON.stringify({
  entry,
  name: plugin.name,
  inject: plugin.inject,
  apply: typeof plugin.apply,
  configExported: plugin.Config !== undefined,
  version: plugin.PLUGIN_VERSION,
  peers: resolved,
  clientBundle: {
    present: existsSync(bundlePath),
    opensModuleLoader: bundleHead.includes('__ModuleLoader__'),
    registersAs: bundleHead.includes('"dsh-skills-market-hub"') ? 'dsh-skills-market-hub' : '(unexpected id)',
  },
}, null, 2))
