/**
 * Package-closure check: what an install from the tarball actually gets.
 *
 * `pnpm build` passing proves the source tree works. It does not prove the
 * *package* works, and the difference is where DSH plugins fail: a file that the
 * build reads but `files` excludes, or a runtime `import` of a package that is
 * only a devDependency. Both produce a plugin that installs cleanly and then fails
 * to load in a profile — which is exactly the failure a user cannot diagnose.
 *
 * So this packs the package, installs the tarball into an empty directory with
 * production dependencies only, and imports the host half from *there*.
 *
 * Usage: node scripts/pack-check.mjs
 */

import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const ROOT = dirname(fileURLToPath(import.meta.url)).replace(/[\\/]scripts$/, '')

/**
 * Locate npm's JavaScript entry point.
 *
 * On Windows `npm` is a `.cmd` shim, and Node refuses to `spawn` a batch file
 * directly (`EINVAL`) — the shim needs a shell, and adding one would reintroduce
 * quoting problems for the package name and the tarball path. Running npm's own
 * JS entry under the current Node avoids both.
 */
function npmEntry() {
  const candidates = [
    join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    join(dirname(process.execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  throw new Error('could not locate npm-cli.js next to the Node executable')
}

/** Run a command, capturing output, and reject on a non-zero exit. */
function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: ROOT, ...options })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk) => { stdout += chunk })
    child.stderr?.on('data', (chunk) => { stderr += chunk })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve({ stdout, stderr })
      else reject(new Error(`${command} ${args.join(' ')} failed (${code})\n${stdout}\n${stderr}`))
    })
  })
}

/** Run npm through the current Node. */
function runNpm(args, options = {}) {
  return run(process.execPath, [npmEntry(), ...args], options)
}

const failures = []
function check(name, condition, detail) {
  if (condition) process.stdout.write(`  ok   ${name}\n`)
  else {
    failures.push(name)
    process.stdout.write(`  FAIL ${name}${detail === undefined ? '' : `\n       ${detail}`}\n`)
  }
}

const manifest = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'))

if (!existsSync(join(ROOT, 'lib', 'index.js'))) {
  process.stdout.write('lib/ is missing — run `pnpm build` first\n')
  process.exit(1)
}

const sandbox = await mkdtemp(join(tmpdir(), 'skills-market-hub-pack-'))
const staging = join(sandbox, 'staging')
const consumer = join(sandbox, 'consumer')

try {
  // ── Stage a publishable copy ──────────────────────────────────────────────
  // `private: true` guards against an accidental `npm publish` from the working
  // tree; the package check packs a copy with that flag removed rather than
  // dropping the guard from the real manifest.
  await mkdir(staging, { recursive: true })
  await cp(join(ROOT, 'lib'), join(staging, 'lib'), { recursive: true })
  await cp(join(ROOT, 'cordis.patch.yml'), join(staging, 'cordis.patch.yml'))
  await cp(join(ROOT, 'README.md'), join(staging, 'README.md')).catch(() => undefined)
  await cp(join(ROOT, 'LICENSE'), join(staging, 'LICENSE')).catch(() => undefined)
  await writeFile(
    join(staging, 'package.json'),
    `${JSON.stringify({ ...manifest, private: false, devDependencies: undefined, scripts: undefined }, null, 2)}\n`,
    'utf8',
  )

  // ── Pack ──────────────────────────────────────────────────────────────────
  const packed = await runNpm(['pack', '--json', '--pack-destination', sandbox], { cwd: staging })
  const packInfo = JSON.parse(packed.stdout)
  const tarball = join(sandbox, packInfo[0].filename)

  const names = packInfo[0].files.map((entry) => entry.path)
  process.stdout.write(`[pack] ${packInfo[0].filename} — ${names.length} files, ${packInfo[0].size} bytes\n`)

  // ── Closure assertions ────────────────────────────────────────────────────
  check('the tarball carries the host entry', names.includes('lib/index.js'))
  check('the tarball carries the client bundle', names.includes('lib/client.cjs'))
  check('the tarball carries the type declarations', names.some((name) => name === 'lib/types/index.d.ts'))
  check('the tarball carries the patch layer', names.includes('cordis.patch.yml'))
  check('the tarball excludes the client build input', !names.some((name) => name.startsWith('lib/client/')),
    `found: ${names.filter((name) => name.startsWith('lib/client/')).join(', ')}`)
  check('the tarball excludes the source tree', !names.some((name) => name.startsWith('src/')))
  check('the tarball excludes the tests', !names.some((name) => name.startsWith('tests/')))
  check('the tarball declares no runtime dependencies',
    manifest.dependencies === undefined || Object.keys(manifest.dependencies).length === 0)

  // ── Install the tarball into an empty consumer ────────────────────────────
  await mkdir(consumer, { recursive: true })
  await writeFile(
    join(consumer, 'package.json'),
    `${JSON.stringify({ name: 'pack-check-consumer', private: true, type: 'module' }, null, 2)}\n`,
    'utf8',
  )
  await runNpm(['install', '--no-audit', '--no-fund', '--ignore-scripts', tarball], { cwd: consumer })

  // The host half imports two packages the *profile* provides (`schemastery` for
  // the config schema, `cordis` for types). A bare consumer has neither, so the
  // check supplies them at the versions the manifest declares — which is exactly
  // what an installed DSH profile does.
  const peerNames = Object.keys(manifest.peerDependencies ?? {}).filter((name) => (
    name === '@deepseek-ai/schemastery' || name === '@deepseek-ai/cordis'
  ))
  const peerSpecs = peerNames.map((name) => `${name}@${manifest.peerDependencies[name]}`)
  if (peerSpecs.length > 0) {
    await runNpm(['install', '--no-audit', '--no-fund', '--ignore-scripts', '--save-exact', ...peerSpecs], { cwd: consumer })
  }
  check('the profile-provided peers the host half imports are declared',
    peerSpecs.some((spec) => spec.startsWith('@deepseek-ai/schemastery@')),
    `declared peers: ${peerNames.join(', ') || '(none)'}`)

  // ── Import the host half from the installed copy ──────────────────────────
  // This is the assertion the rest of the suite cannot make: it runs the plugin
  // out of `node_modules`, where only what the tarball contains exists.
  const installedEntry = join(consumer, 'node_modules', manifest.name, 'lib', 'index.js')
  check('the installed package exposes its host entry', existsSync(installedEntry))

  const probe = await run(process.execPath, ['--input-type=module', '-e', `
    const plugin = await import(${JSON.stringify(`file:///${installedEntry.replace(/\\/g, '/')}`)})
    const shape = {
      name: plugin.name,
      inject: plugin.inject,
      hasApply: typeof plugin.apply === 'function',
      hasConfig: plugin.Config !== undefined,
      version: plugin.PLUGIN_VERSION,
    }
    process.stdout.write(JSON.stringify(shape))
  `], { cwd: consumer })

  const shape = JSON.parse(probe.stdout)
  check('the installed host half imports without its dev dependencies',
    shape.name === 'skills-market-hub' && shape.hasApply === true,
    `got ${JSON.stringify(shape)}`)
  check('the installed host half still declares no required services',
    Array.isArray(shape.inject) && shape.inject.length === 0)
  check('the installed host half still exports its config schema', shape.hasConfig === true)

  // The client bundle is served by the host, never imported by Node, so it is
  // checked for the protocol envelope rather than executed.
  const bundle = await readFile(join(consumer, 'node_modules', manifest.name, 'lib', 'client.cjs'), 'utf8')
  check('the installed client bundle opens the module-loader protocol',
    bundle.slice(0, 400).includes('__ModuleLoader__') && bundle.slice(0, 400).includes(manifest.name))

  const patch = await readFile(join(consumer, 'node_modules', manifest.name, 'cordis.patch.yml'), 'utf8')
  check('the installed patch inserts exactly this package',
    patch.includes(`name: '${manifest.name}'`) && patch.includes('id: skills-market-hub'))
} finally {
  await rm(sandbox, { recursive: true, force: true })
}

process.stdout.write(failures.length === 0
  ? '\npack-check: the tarball installs and loads on its own\n'
  : `\npack-check: ${failures.length} check(s) failed\n`)
process.exitCode = failures.length === 0 ? 0 : 1
