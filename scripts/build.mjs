/**
 * Build the plugin: host half (tsc), client half (tsc), then the browser bundle.
 *
 * Pipeline
 * --------
 *  1. wipe `lib/` (and only `lib/` — asserted, because a typo here would delete
 *     the source tree);
 *  2. `tsc -p tsconfig.json`        → `lib/index.js`, `lib/market/*.js`, … + `lib/types/**`
 *  3. `tsc -p tsconfig.client.json` → `lib/client/index.js` (bundle INPUT only)
 *  4. esbuild                        → `lib/client.js` (the artifact the host serves)
 *
 * Why esbuild instead of a bundler plugin stack: this plugin ships **no CSS**.
 * Every visual rule is an inline style built from `--dsw-*` theme tokens, so the
 * toolchain needs no CSS Modules compiler and no style-injection runtime. That
 * removes an entire class of build complexity (and the byte-unstable hashed
 * class maps it brings) at no cost to the UI.
 *
 * The emitted bundle MUST be a CommonJS factory closure, because that is the
 * protocol the Harness browser module loader answers:
 *
 *     window.__ModuleLoader__.load({ id: "<package name>", factory: (require) => { … } })
 *
 * The `id` is read from package.json rather than restated: the host looks the
 * bundle up by package name, so a rename that left a hard-coded id behind would
 * fail only in the browser, after the host half had already loaded fine.
 */

import { rm, mkdir, readFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const ROOT = dirname(fileURLToPath(import.meta.url)).replace(/[\\/]scripts$/, '')
const LIB = join(ROOT, 'lib')
const TSCONFIG = join(ROOT, 'tsconfig.json')
const TSCONFIG_CLIENT = join(ROOT, 'tsconfig.client.json')
const ENTRY_CLIENT = join(LIB, 'client', 'index.js')
/**
 * Bundle artifact.
 *
 * `.cjs`, not `.js`: the host half is ESM (`"type": "module"` in package.json,
 * matching every other DSH plugin), while this artifact is a CommonJS closure
 * factory for the browser's module loader. The extension states that difference
 * instead of hiding it behind a nested `lib/package.json` override — which would
 * have re-declared the *host* half as CommonJS and broken `import`.
 */
const OUT_CLIENT = join(LIB, 'client.cjs')

/**
 * Platform modules the browser module table answers; everything else is inlined.
 *
 * `@deepseek-ai/dsh-client-ui-primitives` is deliberately absent. Its entry module
 * statically imports a syntax highlighter, a TeX renderer, `simple-icons`, and
 * three dozen stylesheets, so importing one button from it would put all of that
 * in this artifact — and its stylesheet imports are not resolvable by the loader's
 * module table at all. The panel draws its own controls from `--dsw-*` tokens
 * instead, which costs nothing and keeps this list honest: every entry here is a
 * module the artifact actually requires.
 */
const CLIENT_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
]

/**
 * Value imports a client bundle is forbidden to make, beyond the externals.
 *
 * The one exception is `@deepseek-ai/dsh-client-ui-primitives`, which is a
 * platform module above. Cross-plugin value imports are rejected because they
 * would either inline a duplicate runtime instance or ask the frozen module
 * table for a specifier it cannot answer.
 */
const PURITY_ALLOW = [
  /^@deepseek-ai\/dsh-(session|llm|tools|brand)(\/|$)/,
  /^@deepseek-ai\/(cosmokit|schemastery)(\/|$)/,
  /^@deepseek-ai\/dsh-[a-z0-9]+(?:-[a-z0-9]+)*\/remote$/,
]

/** Resolve the Node executable running this script (the harness runtime, usually). */
function nodeBinary() {
  return process.execPath
}

/** Run a command, inheriting stdio, and reject on a non-zero exit. */
function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', cwd: ROOT, ...options })
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (code === 0) resolvePromise()
      else reject(new Error(`${command} ${args.join(' ')} failed (code=${code} signal=${signal})`))
    })
  })
}

/**
 * Absolute path to a dependency's CLI entry point.
 *
 * Resolved from the dependency's own `package.json#bin` instead of going through
 * `node_modules/.bin`: on Windows those entries are `.cmd` shims, and Node's
 * `spawn` cannot execute a batch file without a shell. Running the JS entry
 * point under the current Node keeps the build shell-free and identical on every
 * platform.
 */
async function dependencyBin(packageName, binName) {
  const manifestPath = join(ROOT, 'node_modules', ...packageName.split('/'), 'package.json')
  if (!existsSync(manifestPath)) {
    throw new Error(`missing dependency "${packageName}" — run the package manager install first`)
  }
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  const declared = manifest.bin
  const relative = typeof declared === 'string' ? declared : declared?.[binName]
  if (typeof relative !== 'string') {
    throw new Error(`dependency "${packageName}" does not declare a "${binName}" entry point`)
  }
  const entry = join(dirname(manifestPath), relative)
  if (!existsSync(entry)) throw new Error(`dependency "${packageName}" declares ${relative}, which does not exist`)
  return entry
}

/** Read and parse the package manifest. */
async function readManifest() {
  return JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'))
}

/**
 * Delete `lib/`, refusing to touch anything that is not this repository's own
 * output directory.
 */
async function clean() {
  const resolved = resolve(LIB)
  const expected = resolve(join(ROOT, 'lib'))
  if (resolved !== expected || !resolved.startsWith(resolve(ROOT) + sep)) {
    throw new Error(`refusing to clean ${resolved}: not this package's lib/`)
  }
  await rm(resolved, { recursive: true, force: true })
}

/**
 * Fail the build on a forbidden value import.
 *
 * Checked against esbuild's metafile rather than the emitted text: the metafile
 * names the resolved module for every input, so an import that survived a
 * conditional branch is still caught.
 */
function assertClientPurity(metafile) {
  const offenders = []
  for (const [file, meta] of Object.entries(metafile.inputs)) {
    for (const importPath of meta.imports ?? []) {
      const specifier = importPath.path
      if (!specifier.startsWith('@deepseek-ai/')) continue
      if (CLIENT_EXTERNALS.includes(specifier)) continue
      if (specifier.startsWith('@deepseek-ai/dsh-client-')) {
        offenders.push(`${file} → ${specifier}`)
        continue
      }
      if (PURITY_ALLOW.some((pattern) => pattern.test(specifier))) continue
      offenders.push(`${file} → ${specifier}`)
    }
  }
  if (offenders.length > 0) {
    throw new Error(
      'client bundle purity: cross-plugin value imports are forbidden; collaborate through cordis services '
      + `(type-only imports are erased and never reach this gate). Offenders:\n  ${offenders.join('\n  ')}`,
    )
  }
}

/** Bundle the compiled client half into the module-loader artifact. */
async function bundleClient(manifest) {
  const esbuild = await import('esbuild')
  const result = await esbuild.build({
    entryPoints: [ENTRY_CLIENT],
    outfile: OUT_CLIENT,
    bundle: true,
    format: 'cjs',
    platform: 'browser',
    target: ['es2022'],
    // `mainFields`/`conditions` mirror a browser resolution pass: a dependency
    // with a browser build must not fall back to its Node entry.
    mainFields: ['browser', 'module', 'main'],
    conditions: ['browser', 'import', 'default'],
    external: CLIENT_EXTERNALS,
    sourcemap: true,
    metafile: true,
    logLevel: 'warning',
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    },
    banner: {
      js: [
        `window.__ModuleLoader__.load({ id: ${JSON.stringify(manifest.name)}, factory: (require) => {`,
        'var module = { exports: {} }; var exports = module.exports;',
      ].join('\n'),
    },
    footer: { js: 'return module.exports; } });' },
  })

  assertClientPurity(result.metafile)
  return result
}

/** Post-build assertions: the host looks for exact shapes, so check them here. */
async function verifyArtifacts(manifest) {
  const problems = []

  const hostEntry = join(LIB, 'index.js')
  if (!existsSync(hostEntry)) problems.push('lib/index.js was not produced')

  const declarationEntry = join(LIB, 'types', 'index.d.ts')
  if (!existsSync(declarationEntry)) problems.push('lib/types/index.d.ts was not produced')

  if (!existsSync(OUT_CLIENT)) {
    problems.push('lib/client.cjs was not produced')
  } else {
    const bundle = await readFile(OUT_CLIENT, 'utf8')
    const head = bundle.slice(0, 400)
    if (!head.includes('__ModuleLoader__')) problems.push('lib/client.cjs does not open the module-loader protocol')
    if (!head.includes(manifest.name)) problems.push(`lib/client.cjs does not register under the package name ${manifest.name}`)
    // Every `require("…")` in the artifact must be a platform module; anything
    // else means a dependency escaped the externals list.
    for (const match of bundle.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g)) {
      const specifier = match[1]
      if (!CLIENT_EXTERNALS.includes(specifier)) {
        problems.push(`lib/client.cjs requires "${specifier}", which is not a platform module`)
      }
    }
    const size = (await stat(OUT_CLIENT)).size
    if (size > 4 * 1024 * 1024) problems.push(`lib/client.cjs is unexpectedly large (${size} bytes)`)
  }

  // The host half must stay loadable as ESM: the profile's loader imports it by
  // package specifier, and a nested module-type override in lib/ would silently
  // turn `import` into a syntax error at activation time.
  const hostSource = existsSync(join(LIB, 'index.js')) ? await readFile(join(LIB, 'index.js'), 'utf8') : ''
  if (hostSource !== '' && !/^\s*import\s|^\s*export\s/m.test(hostSource)) {
    problems.push('lib/index.js does not look like an ES module')
  }
  if (existsSync(join(LIB, 'package.json'))) {
    problems.push('lib/package.json must not exist: it would override the package module type for the host half')
  }

  if (problems.length > 0) {
    throw new Error(`artifact verification failed:\n  ${problems.join('\n  ')}`)
  }
}

async function main() {
  const manifest = await readManifest()
  const tsc = await dependencyBin('typescript', 'tsc')

  process.stdout.write('[build] clean lib/\n')
  await clean()

  process.stdout.write('[build] tsc (host)\n')
  await run(nodeBinary(), [tsc, '-p', TSCONFIG])

  process.stdout.write('[build] tsc (client)\n')
  await run(nodeBinary(), [tsc, '-p', TSCONFIG_CLIENT])

  if (!existsSync(ENTRY_CLIENT)) {
    throw new Error(`client compiler produced no entry point at ${ENTRY_CLIENT}`)
  }

  process.stdout.write('[build] esbuild (client bundle)\n')
  const result = await bundleClient(manifest)
  for (const warning of result.warnings) process.stdout.write(`[build] warning: ${warning.text}\n`)

  await verifyArtifacts(manifest)
  await mkdir(dirname(OUT_CLIENT), { recursive: true })

  process.stdout.write(`[build] ok — ${manifest.name}@${manifest.version}\n`)
}

await main()
