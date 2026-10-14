/**
 * Stale-build detection, against a real installed-package layout.
 *
 * The detector exists because a `file:` install is a copy rather than a link, so
 * the code that loads can be older than the package beside it. Its whole job is to
 * be *exactly right* about one narrow claim, because a warning that fires when
 * nothing is wrong gets ignored — and then the real one is ignored too.
 *
 * The fixtures therefore reproduce the shape a real install has —
 * `<root>/node_modules/<name>/{package.json,lib/index.js}` — instead of dropping a
 * package into a bare temp directory. That distinction is not cosmetic: a bare temp
 * directory lets the upward manifest search escape into the machine's own
 * filesystem, which is exactly the situation the `name` match exists to survive.
 */

import { afterEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { detectStaleBuild, staleBuildWarning } from '../lib/stale-build.js'

const NAME = 'dsh-skills-market-hub'

let sandbox

/**
 * Create an installed-shaped package and return the URL of its entry module.
 *
 * @param options.manifest - omit to simulate a package with no manifest at all;
 *   the outer `node_modules` still gets one under a *different* name, so a search
 *   that ignored the name would find something and be wrong.
 */
async function installedPackage({ builtVersion, manifestVersion, manifest = true, outerManifest = true }) {
  sandbox = await mkdtemp(join(tmpdir(), 'skills-market-hub-stale-'))
  const pkg = join(sandbox, 'node_modules', NAME)
  await mkdir(join(pkg, 'lib'), { recursive: true })
  const entry = join(pkg, 'lib', 'index.js')
  await writeFile(entry, '// built artifact\n', 'utf8')

  if (manifest) {
    await writeFile(join(pkg, 'package.json'), `${JSON.stringify({ name: NAME, version: manifestVersion }, null, 2)}\n`, 'utf8')
  }
  if (outerManifest) {
    // The host project's manifest, one level above the package. A search that does
    // not check the name would stop here and compare against it.
    await writeFile(join(sandbox, 'package.json'), `${JSON.stringify({ name: 'some-host-project', version: '99.0.0' })}\n`, 'utf8')
  }
  return { moduleUrl: pathToFileURL(entry).href, builtVersion }
}

afterEach(async () => {
  if (sandbox !== undefined) await rm(sandbox, { recursive: true, force: true })
  sandbox = undefined
})

describe('stale build detection', () => {
  it('reports a match when the build and the manifest agree', async () => {
    const { moduleUrl, builtVersion } = await installedPackage({ builtVersion: '0.1.1', manifestVersion: '0.1.1' })
    const report = detectStaleBuild(builtVersion, moduleUrl, NAME)

    assert.equal(report.builtVersion, '0.1.1')
    assert.equal(report.manifestVersion, '0.1.1')
    assert.equal(report.stale, false)
    assert.ok(report.manifestPath.endsWith('package.json'))
  })

  it('reports a stale build when they disagree', async () => {
    // The production shape: the manifest was refreshed by a reinstall while the
    // loaded code came from the copy made before the rebuild.
    const { moduleUrl, builtVersion } = await installedPackage({ builtVersion: '0.1.0', manifestVersion: '0.1.1' })
    const report = detectStaleBuild(builtVersion, moduleUrl, NAME)

    assert.equal(report.stale, true)
    assert.equal(report.builtVersion, '0.1.0')
    assert.equal(report.manifestVersion, '0.1.1')
  })

  it('does not compare against an unrelated manifest further up the tree', async () => {
    // Without the name match this reports stale: the host project's manifest says
    // 99.0.0 and the build says 0.1.1. A false alarm here is worse than no check,
    // because it fires on every healthy development install.
    const { moduleUrl, builtVersion } = await installedPackage({
      builtVersion: '0.1.1',
      manifestVersion: '0.1.1',
      manifest: false,
      outerManifest: true,
    })
    const report = detectStaleBuild(builtVersion, moduleUrl, NAME)

    assert.equal(report.stale, false, 'a package with no manifest of its own proves nothing')
    assert.equal(report.manifestVersion, undefined)
  })

  it('does not cry wolf on an unreadable or malformed manifest', async () => {
    sandbox = await mkdtemp(join(tmpdir(), 'skills-market-hub-stale-'))
    const pkg = join(sandbox, 'node_modules', NAME)
    await mkdir(join(pkg, 'lib'), { recursive: true })
    const entry = join(pkg, 'lib', 'index.js')
    await writeFile(entry, '// built artifact\n', 'utf8')
    await writeFile(join(pkg, 'package.json'), '{ not json', 'utf8')

    assert.equal(detectStaleBuild('0.1.1', pathToFileURL(entry).href, NAME).stale, false)
  })

  it('does not cry wolf when the manifest has no usable version', async () => {
    sandbox = await mkdtemp(join(tmpdir(), 'skills-market-hub-stale-'))
    const pkg = join(sandbox, 'node_modules', NAME)
    await mkdir(join(pkg, 'lib'), { recursive: true })
    const entry = join(pkg, 'lib', 'index.js')
    await writeFile(entry, '// built artifact\n', 'utf8')
    await writeFile(join(pkg, 'package.json'), JSON.stringify({ name: NAME }), 'utf8')

    assert.equal(detectStaleBuild('0.1.1', pathToFileURL(entry).href, NAME).stale, false)
  })

  it('finds the manifest from a module nested deeper than the entry', async () => {
    // The plugin's real entry is `lib/index.js` but most of its modules are deeper.
    // A fixed number of `..` segments gets exactly one of those two right.
    sandbox = await mkdtemp(join(tmpdir(), 'skills-market-hub-stale-'))
    const pkg = join(sandbox, 'node_modules', NAME)
    await mkdir(join(pkg, 'lib', 'market'), { recursive: true })
    const entry = join(pkg, 'lib', 'market', 'cache.js')
    await writeFile(entry, '// built artifact\n', 'utf8')
    await writeFile(join(pkg, 'package.json'), JSON.stringify({ name: NAME, version: '0.1.1' }), 'utf8')

    const report = detectStaleBuild('0.1.0', pathToFileURL(entry).href, NAME)
    assert.equal(report.manifestVersion, '0.1.1')
    assert.equal(report.stale, true)
  })

  it('locates the manifest from the module that asks, not from the process cwd', async () => {
    const { moduleUrl, builtVersion } = await installedPackage({ builtVersion: '0.1.1', manifestVersion: '0.1.1' })
    const report = detectStaleBuild(builtVersion, moduleUrl, NAME)
    assert.ok(report.manifestPath.startsWith(sandbox), `unexpected manifest path ${String(report.manifestPath)}`)
  })
})

describe('the warning text', () => {
  it('names both versions and says what to run', () => {
    const text = staleBuildWarning({
      builtVersion: '0.1.0',
      manifestVersion: '0.1.1',
      manifestPath: '/x/package.json',
      stale: true,
    })

    // Both versions, so the reader can tell which side is behind.
    assert.match(text, /v0\.1\.0/)
    assert.match(text, /v0\.1\.1/)
    // And the fix, including why it is --force: without it the package manager
    // sees an unchanged path and leaves the copy alone.
    assert.match(text, /pnpm install --force/)
    assert.match(text, /restart/)
  })
})
