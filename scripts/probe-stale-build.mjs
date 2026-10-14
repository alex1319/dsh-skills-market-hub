/**
 * Prove the stale-build detector against a real install artifact.
 *
 * Run manually: it copies `lib/` into an installed-shaped directory, checks the
 * healthy case, then rewrites the manifest so the loaded code is behind it — the
 * exact production failure — and checks that the detector fires.
 *
 * Usage: node scripts/probe-stale-build.mjs
 */

import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const NAME = 'dsh-skills-market-hub'

const sandbox = await mkdtemp(join(tmpdir(), 'smh-stale-probe-'))
const pkg = join(sandbox, 'node_modules', NAME)

try {
  await mkdir(pkg, { recursive: true })
  await cp(join(ROOT, 'lib'), join(pkg, 'lib'), { recursive: true })
  await cp(join(ROOT, 'package.json'), join(pkg, 'package.json'))

  // Load the detector out of the copied package, so the module URL it receives is
  // the installed one — the same shape the host produces.
  const { detectStaleBuild, staleBuildWarning } = await import(
    pathToFileURL(join(pkg, 'lib', 'stale-build.js')).href
  )
  const moduleUrl = pathToFileURL(join(pkg, 'lib', 'stale-build.js')).href
  const builtVersion = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8')).version

  const healthy = detectStaleBuild(builtVersion, moduleUrl, NAME)
  process.stdout.write(`healthy install   : stale=${healthy.stale}  built=${healthy.builtVersion}  manifest=${String(healthy.manifestVersion)}\n`)

  // The production failure: the package was refreshed while the loaded code was
  // not. Rewriting the manifest reproduces it exactly.
  const manifestPath = join(pkg, 'package.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  manifest.version = '999.0.0'
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

  const stale = detectStaleBuild(builtVersion, moduleUrl, NAME)
  process.stdout.write(`stale install     : stale=${stale.stale}  built=${stale.builtVersion}  manifest=${String(stale.manifestVersion)}\n`)
  if (stale.stale) process.stdout.write(`warning           : ${staleBuildWarning(stale)}\n`)

  const ok = healthy.stale === false && stale.stale === true
  process.stdout.write(ok ? '\nprobe: the detector is silent when healthy and fires when stale\n' : '\nprobe: FAILED\n')
  process.exitCode = ok ? 0 : 1
} finally {
  await rm(sandbox, { recursive: true, force: true })
}
