/**
 * Client bundle contract.
 *
 * The browser half fails in a way nothing on the host side can catch: the host
 * serves the artifact successfully, the page loads, and the panel simply never
 * appears. These assertions therefore check the two things the module loader
 * depends on — that the artifact registers under the package name the host looks
 * it up by, and that the plugin it exports registers the sidebar row and the
 * panel it opens — against a stand-in loader of our own.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const require = createRequire(import.meta.url)
const manifest = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'))

/**
 * The frozen platform module table, as the production loader answers it.
 *
 * `react` is the real library: the plugin's components only need `createElement`
 * and the hooks, so a real React is the most faithful stub available. Nothing else
 * is listed, and the fourth test below asserts the artifact asks for nothing else
 * — which is the point of keeping the panel's controls in-house rather than
 * importing the shared primitive kit.
 */
function platformRequire(specifier) {
  if (specifier === 'react' || specifier === 'react/jsx-runtime') return require('react')
  throw new Error(`the module table cannot answer "${specifier}"`)
}

/** Load the browser artifact the way the page's module loader does. */
function loadClientBundle() {
  const registered = []
  let exportsValue

  // The artifact is CommonJS, so Node caches it: a second load in the same
  // process would return the first evaluation and register nothing. The browser
  // has no such cache — each page load executes the factory anew.
  const artifact = join(ROOT, 'lib', 'client.cjs')
  delete require.cache[artifact]

  globalThis.window = {
    __ModuleLoader__: {
      load(entry) {
        registered.push(entry)
        exportsValue = entry.factory(platformRequire)
      },
    },
  }

  try {
    require(artifact)
  } finally {
    delete globalThis.window
  }

  assert.equal(registered.length, 1, 'the artifact must call __ModuleLoader__.load exactly once')
  return { entry: registered[0], exports: exportsValue }
}

describe('skills-market-hub client bundle', () => {
  it('registers under the package name, which is how the host finds it', () => {
    const { entry } = loadClientBundle()
    assert.equal(entry.id, manifest.name)
  })

  it('exports a cordis client plugin with the services it needs', () => {
    const { exports } = loadClientBundle()
    assert.equal(exports.name, 'skills-market-hub-client')
    assert.equal(typeof exports.apply, 'function')
    assert.deepEqual(exports.inject, ['slots', 'locale'])
  })

  it('registers the sidebar row and the panel it opens, under one shared id', () => {
    const { exports } = loadClientBundle()
    const registered = []
    const injected = []

    const slots = {
      inject(key, callback) {
        injected.push(key)
        const disposer = callback()
        // The real contract accepts either a disposer or an iterable of them;
        // the generator form (what this plugin uses for `main`) only performs
        // its registration once it is iterated, so the stand-in must iterate.
        if (typeof disposer === 'function') return disposer
        if (disposer !== undefined && disposer !== null && typeof disposer[Symbol.iterator] === 'function') {
          const disposers = [...disposer]
          return () => { for (const off of disposers) off() }
        }
        return () => undefined
      },
      register(options) {
        registered.push(options)
        return () => undefined
      },
    }
    const locale = {
      register(namespace, id, dict) {
        assert.equal(typeof dict, 'object')
        return () => undefined
      },
      bind() {
        return (key) => key
      },
    }
    const effects = []
    const ctx = {
      slots,
      locale,
      effect(factory) {
        const disposer = factory()
        effects.push(disposer)
        return disposer
      },
    }

    exports.apply(ctx)

    assert.deepEqual(injected.sort(), ['main', 'sidebar.panellist'])

    const panel = registered.find((entry) => entry.name === 'main')
    const row = registered.find((entry) => entry.name === 'sidebar.panellist')
    assert.ok(panel, 'the panel must be registered into the main slot')
    assert.ok(row, 'the sidebar row must be registered')

    // The shell's sidebar calls layout.selectPanel(id); only a `main` key equal
    // to that id opens this panel.
    assert.equal(panel.key, row.id)
    assert.equal(panel.key, exports.PANEL_ID)
    assert.equal(typeof row.label, 'function', 'the label must be a thunk so a locale switch relabels the row')
    assert.equal(typeof row.label(), 'string')
    assert.equal(effects.length, 1, 'both dictionaries ride one effect')
  })

  it('never asks the module table for anything but react', async () => {
    const bundle = await readFile(join(ROOT, 'lib', 'client.cjs'), 'utf8')
    const allowed = new Set(['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'])
    const asked = new Set()
    for (const match of bundle.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g)) {
      asked.add(match[1])
      assert.ok(allowed.has(match[1]), `unexpected external "${match[1]}"`)
    }
    assert.ok(asked.size > 0, 'the artifact must require react')
    // The primitive kit is the one module that would look reasonable to add here
    // and would drag a syntax highlighter and three dozen stylesheets along.
    assert.ok(!asked.has('@deepseek-ai/dsh-client-ui-primitives'), 'the panel must not depend on the primitive kit')
  })

  it('is small enough to prove nothing heavy was inlined', async () => {
    const stats = await stat(join(ROOT, 'lib', 'client.cjs'))
    // The panel is a few hundred lines of JSX; anything near a megabyte means a
    // dependency slipped past the externals list (a markdown renderer, an icon
    // set, a highlighter).
    assert.ok(stats.size < 250_000, `lib/client.cjs is ${stats.size} bytes, which suggests an unintended dependency`)
  })
})
