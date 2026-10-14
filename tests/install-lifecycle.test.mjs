/**
 * The install/uninstall lifecycle, against a real temp directory.
 *
 * These tests write actual files, because the guarantees they check are
 * filesystem guarantees: an atomic publish, a checksum that aborts before
 * anything lands, a deletion that refuses a directory this plugin did not write.
 * A mocked `fs` would assert the calls, not the outcome 鈥?and the outcome is the
 * whole point.
 *
 * The registry is stubbed rather than fetched: the byte-level behaviour under
 * test has nothing to do with which registry served the bytes.
 */

import { afterEach, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, readdir, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  SkillOperationError,
  installMarketSkill,
  isSafeRelativeFilePath,
  isTransientLock,
  readInstalledEntryFile,
  readInstalledSkill,
  sha256Hex,
  sweepStagingDirectories,
  uninstallInstalledEntry,
  uninstallMarketSkill,
  resetInstallLocks,
  RENAME_ATTEMPTS,
} from '../lib/skills/install-service.js'
import {
  INSTALL_META_FILE,
  installedEntryKey,
  parseInstalledMeta,
  scanInstalledSkills,
  serializeInstalledMeta,
} from '../lib/skills/installed.js'
import { setInstalledLookup, setMarketCache, setProviders, resetInstalledLookup } from '../lib/market/market-service.js'

const SKILL_MD = '---\nname: demo\ndescription: A demo skill.\n---\n\n# Demo\n\nBody text.\n'
const SAFE_PATH = 'reference/notes.md'

let root

/** A registry stub serving one skill whose file contents the caller controls. */
function stubProvider(overrides = {}) {
  const files = overrides.files ?? [
    { path: 'SKILL.md', size: Buffer.byteLength(SKILL_MD), sha256: sha256Hex(SKILL_MD) },
    { path: SAFE_PATH, size: 9, sha256: sha256Hex('notes txt') },
  ]
  const contents = overrides.contents ?? { 'SKILL.md': SKILL_MD, [SAFE_PATH]: 'notes txt' }

  return {
    source: 'clawhub',
    // The default stub stands in for ClawHub, which *does* pin on the owner
    // argument 鈥?that is what makes the pin-mismatch case below a real assertion
    // rather than a branch nothing reaches.
    pinsOwner: overrides.pinsOwner ?? true,
    async list() { return { items: [] } },
    async search() { return { items: [] } },
    async detail(slug) {
      if (overrides.detailFails === true) throw new Error('upstream is down')
      return {
        id: `clawhub:${slug}`,
        source: 'clawhub',
        slug,
        name: 'Demo',
        summary: 'A demo skill.',
        author: { handle: overrides.owner ?? 'author' },
        stats: { downloads: 1 },
        tags: [],
        securityStatus: 'benign',
        installState: 'installable',
        version: overrides.version ?? '1.0.0',
        description: 'Body text.',
        files,
        totalSize: files.reduce((sum, file) => sum + file.size, 0),
      }
    },
    async listFiles() { return files },
    async fetchFile(_slug, { path }) {
      const content = contents[path]
      if (content === undefined) throw new SkillOperationError(404, 'MARKET_NOT_INSTALLED', `no such file: ${path}`)
      return { content: overrides.corrupt === true && path === 'SKILL.md' ? `${content}tampered` : content, size: Buffer.byteLength(content) }
    },
  }
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'skills-market-hub-test-'))
  resetInstallLocks()
  resetInstalledLookup()
  setMarketCache(null)
  setProviders({ clawhub: stubProvider() })
})

afterEach(async () => {
  resetInstalledLookup()
  setProviders({})
  await rm(root, { recursive: true, force: true })
})

describe('install lifecycle', () => {
  it('writes the skill and its provenance sidecar, and reports the path', async () => {
    const result = await installMarketSkill('clawhub', 'demo', { skillsRoot: root })

    const installed = join(root, 'demo')
    assert.equal(result.installedPath, installed)
    assert.equal(await readFile(join(installed, 'SKILL.md'), 'utf8'), SKILL_MD)
    assert.equal(await readFile(join(installed, SAFE_PATH), 'utf8'), 'notes txt')
    assert.equal(result.skill.installState, 'installed')
    assert.equal(result.skill.installedInfo.dirName, 'demo')

    const meta = JSON.parse(await readFile(join(installed, INSTALL_META_FILE), 'utf8'))
    assert.equal(meta.id, 'clawhub:demo')
    assert.equal(meta.source, 'clawhub')
    assert.equal(meta.slug, 'demo')
    assert.equal(meta.owner, 'author')
    assert.equal(meta.version, '1.0.0')
    assert.ok(!Number.isNaN(Date.parse(meta.installedAt)))
    assert.equal(meta.files.length, 2)
    assert.equal(meta.files.find((file) => file.path === 'SKILL.md').sha256, sha256Hex(SKILL_MD))
  })

  it('leaves no staging directory behind on success', async () => {
    await installMarketSkill('clawhub', 'demo', { skillsRoot: root })
    const entries = await readdir(root)
    assert.deepEqual(entries.filter((entry) => entry.startsWith('.skills-market-hub')), [])
    assert.deepEqual(entries.sort(), ['demo'])
  })

  it('creates a nested file exactly where the relative path says', async () => {
    await installMarketSkill('clawhub', 'demo', { skillsRoot: root })
    const stats = await readFile(join(root, 'demo', 'reference', 'notes.md'), 'utf8')
    assert.equal(stats, 'notes txt')
  })

  it('aborts on a checksum mismatch and lands nothing', async () => {
    setProviders({ clawhub: stubProvider({ corrupt: true }) })

    await assert.rejects(
      installMarketSkill('clawhub', 'demo', { skillsRoot: root }),
      (error) => {
        assert.ok(error instanceof SkillOperationError)
        assert.equal(error.status, 502)
        assert.equal(error.code, 'MARKET_CHECKSUM_MISMATCH')
        return true
      },
    )

    assert.equal(existsSync(join(root, 'demo')), false, 'a failed install must not publish')
    const entries = await readdir(root)
    assert.deepEqual(entries, [], 'and must not leave staging behind either')
  })

  it('refuses a skill with no SKILL.md', async () => {
    const files = [{ path: 'README.md', size: 3 }]
    setProviders({
      clawhub: stubProvider({ files, contents: { 'README.md': 'abc' } }),
    })
    await assert.rejects(
      installMarketSkill('clawhub', 'demo', { skillsRoot: root }),
      (error) => error.code === 'MARKET_NOT_INSTALLABLE',
    )
    assert.deepEqual(await readdir(root), [])
  })

  it('refuses a directory that already holds something else', async () => {
    await mkdir(join(root, 'demo'), { recursive: true })
    await writeFile(join(root, 'demo', 'SKILL.md'), 'someone else wrote this', 'utf8')

    await assert.rejects(
      installMarketSkill('clawhub', 'demo', { skillsRoot: root }),
      (error) => {
        assert.equal(error.status, 409)
        assert.equal(error.code, 'MARKET_NOT_INSTALLABLE')
        return true
      },
    )
    assert.equal(await readFile(join(root, 'demo', 'SKILL.md'), 'utf8'), 'someone else wrote this', 'the existing skill is untouched')
  })

  it('refuses to install the same skill twice', async () => {
    await installMarketSkill('clawhub', 'demo', { skillsRoot: root })
    // Re-annotate as installed, which is what the second request would observe.
    const records = await scanInstalledSkills([root])
    resetInstalledLookup()
    setInstalledLookup({ has: (id) => id === 'clawhub:demo', info: () => ({ dirName: 'demo' }) })
    assert.equal(records.length, 1)

    await assert.rejects(
      installMarketSkill('clawhub', 'demo', { skillsRoot: root }),
      (error) => error.code === 'MARKET_ALREADY_INSTALLED' || error.code === 'MARKET_NOT_INSTALLABLE',
    )
  })

  it('reports a registry that resolved a different author than the caller pinned', async () => {
    setProviders({ clawhub: stubProvider({ owner: 'someone-else' }) })
    await assert.rejects(
      installMarketSkill('clawhub', 'demo', { skillsRoot: root, owner: 'author' }),
      (error) => {
        assert.equal(error.status, 409)
        return true
      },
    )
    assert.deepEqual(await readdir(root), [])
  })

  it('refuses a slug that cannot become a directory name', async () => {
    await assert.rejects(
      installMarketSkill('clawhub', '..', { skillsRoot: root }),
      (error) => error.code === 'MARKET_NOT_INSTALLABLE',
    )
  })

  it('reports an unreachable registry without publishing anything', async () => {
    setProviders({ clawhub: stubProvider({ detailFails: true }) })
    await assert.rejects(installMarketSkill('clawhub', 'demo', { skillsRoot: root }))
    assert.deepEqual(await readdir(root), [])
  })

  it('serializes concurrent installs of the same skill', async () => {
    const [first, second] = await Promise.allSettled([
      installMarketSkill('clawhub', 'demo', { skillsRoot: root }),
      installMarketSkill('clawhub', 'demo', { skillsRoot: root }),
    ])

    const fulfilled = [first, second].filter((result) => result.status === 'fulfilled')
    const rejected = [first, second].filter((result) => result.status === 'rejected')
    assert.equal(fulfilled.length, 1, 'exactly one install may win')
    assert.equal(rejected.length, 1)
    assert.equal(rejected[0].reason.code, 'MARKET_INSTALL_IN_PROGRESS')

    // The winner's tree is whole, and the loser left nothing behind.
    assert.equal(await readFile(join(root, 'demo', 'SKILL.md'), 'utf8'), SKILL_MD)
    assert.deepEqual((await readdir(root)).filter((entry) => entry.startsWith('.')).length, 0)
  })
})

describe('file path safety', () => {
  it('accepts ordinary relative paths', () => {
    for (const path of ['SKILL.md', 'reference/notes.md', 'a/b/c.txt']) {
      assert.equal(isSafeRelativeFilePath(path), true, path)
    }
  })

  it('refuses anything that could escape the skill directory', () => {
    for (const path of [
      '',
      '/etc/passwd',
      '..',
      '../escape.md',
      'a/../../escape.md',
      'a\\b.md',
      'a\0b.md',
      './a',
      'a//b',
      'x'.repeat(600),
    ]) {
      assert.equal(isSafeRelativeFilePath(path), false, JSON.stringify(path))
    }
  })

  it('refuses an inventory whose path escapes, before writing anything', async () => {
    const files = [
      { path: 'SKILL.md', size: Buffer.byteLength(SKILL_MD), sha256: sha256Hex(SKILL_MD) },
      { path: '../escape.md', size: 4, sha256: sha256Hex('evil') },
    ]
    setProviders({ clawhub: stubProvider({ files, contents: { 'SKILL.md': SKILL_MD, '../escape.md': 'evil' } }) })

    await assert.rejects(
      installMarketSkill('clawhub', 'demo', { skillsRoot: root }),
      (error) => error.code === 'MARKET_NOT_INSTALLABLE',
    )
    assert.equal(existsSync(join(root, '..', 'escape.md')), false)
    assert.deepEqual(await readdir(root), [])
  })

  it('refuses a file over the per-file limit', async () => {
    const files = [
      { path: 'SKILL.md', size: Buffer.byteLength(SKILL_MD), sha256: sha256Hex(SKILL_MD) },
      { path: 'huge.bin', size: 6 * 1024 * 1024 },
    ]
    setProviders({ clawhub: stubProvider({ files, contents: { 'SKILL.md': SKILL_MD } }) })
    await assert.rejects(
      installMarketSkill('clawhub', 'demo', { skillsRoot: root }),
      (error) => error.code === 'MARKET_NOT_INSTALLABLE',
    )
  })
})

describe('uninstall', () => {
  it('removes a skill this plugin installed', async () => {
    await installMarketSkill('clawhub', 'demo', { skillsRoot: root })
    const result = await uninstallMarketSkill('clawhub', 'demo', { skillsRoot: root, allowUninstall: true })

    assert.equal(result.removedPath, join(root, 'demo'))
    assert.equal(existsSync(join(root, 'demo')), false)
    assert.equal(result.skill.installState, 'installable')
    assert.equal(result.skill.name, 'demo', 'the headline is read before the directory goes away')
  })

  it('refuses to remove a directory this plugin did not write', async () => {
    await mkdir(join(root, 'handwritten'), { recursive: true })
    await writeFile(join(root, 'handwritten', 'SKILL.md'), SKILL_MD, 'utf8')

    await assert.rejects(
      uninstallMarketSkill('clawhub', 'handwritten', { skillsRoot: root, allowUninstall: true }),
      (error) => {
        assert.equal(error.status, 409)
        assert.equal(error.code, 'MARKET_NOT_MANAGED')
        return true
      },
    )
    assert.equal(existsSync(join(root, 'handwritten', 'SKILL.md')), true)
  })

  it('refuses a sidecar that names a different skill', async () => {
    await mkdir(join(root, 'demo'), { recursive: true })
    await writeFile(join(root, 'demo', 'SKILL.md'), SKILL_MD, 'utf8')
    await writeFile(
      join(root, 'demo', INSTALL_META_FILE),
      serializeInstalledMeta({
        id: 'clawhub:other',
        source: 'clawhub',
        slug: 'other',
        installedAt: new Date().toISOString(),
        files: [],
      }),
      'utf8',
    )

    await assert.rejects(
      uninstallMarketSkill('clawhub', 'demo', { skillsRoot: root, allowUninstall: true }),
      (error) => error.code === 'MARKET_NOT_MANAGED',
    )
    assert.equal(existsSync(join(root, 'demo')), true, 'a mismatched sidecar proves nothing, so nothing is deleted')
  })

  it('reports 404 for a skill that is not installed', async () => {
    await assert.rejects(
      uninstallMarketSkill('clawhub', 'nope', { skillsRoot: root, allowUninstall: true }),
      (error) => {
        assert.equal(error.status, 404)
        return true
      },
    )
  })

  it('refuses everything when removal is disabled', async () => {
    await installMarketSkill('clawhub', 'demo', { skillsRoot: root })
    await assert.rejects(
      uninstallMarketSkill('clawhub', 'demo', { skillsRoot: root, allowUninstall: false }),
      (error) => {
        assert.equal(error.status, 405)
        return true
      },
    )
    assert.equal(existsSync(join(root, 'demo')), true)
  })
})

describe('installed inventory', () => {
  it('lists a managed skill with its provenance', async () => {
    await installMarketSkill('clawhub', 'demo', { skillsRoot: root })
    const records = await scanInstalledSkills([root])

    assert.equal(records.length, 1)
    const [record] = records
    assert.equal(record.managed, true)
    assert.equal(record.id, 'clawhub:demo')
    assert.equal(record.dirName, 'demo')
    assert.equal(record.name, 'demo')
    assert.equal(record.summary, 'A demo skill.')
    assert.equal(record.version, '1.0.0')
    assert.equal(record.owner, 'author')
    assert.ok(record.bytes > 0)
    assert.ok(record.fileCount >= 2)
    assert.equal(record.linked, false)
    assert.match(record.key, /^[a-f0-9]{64}$/)
  })

  it('lists a hand-written skill as unmanaged', async () => {
    await mkdir(join(root, 'handwritten'), { recursive: true })
    await writeFile(join(root, 'handwritten', 'SKILL.md'), '---\nname: handwritten\n---\n\nMine.\n', 'utf8')

    const records = await scanInstalledSkills([root])
    assert.equal(records.length, 1)
    assert.equal(records[0].managed, false)
    assert.equal(records[0].id, 'local:handwritten')
    assert.equal(records[0].source, 'local')
    assert.equal(records[0].name, 'handwritten')
  })

  it('recognises a flat markdown skill', async () => {
    await writeFile(join(root, 'flat.md'), '---\nname: flat\n---\n\nFlat skill.\n', 'utf8')
    const records = await scanInstalledSkills([root])
    assert.equal(records.length, 1)
    assert.equal(records[0].dirName, 'flat')
    assert.equal(records[0].managed, false)
  })

  it('reports a symbolic link as linked without following it', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'skills-market-hub-outside-'))
    try {
      await writeFile(join(outside, 'SKILL.md'), '---\nname: elsewhere\n---\n', 'utf8')
      await symlink(outside, join(root, 'linked'), 'junction').catch(() => undefined)

      const records = await scanInstalledSkills([root])
      const linked = records.find((record) => record.dirName === 'linked')
      // Creating a link can fail on a locked-down Windows account; the assertion
      // only applies when the link exists.
      if (linked !== undefined) {
        assert.equal(linked.linked, true)
        assert.equal(linked.managed, false, 'a link is never claimed as this plugin\'s work')
      }
    } finally {
      await rm(outside, { recursive: true, force: true })
    }
  })

  it('ignores staging, trash, and other dot-prefixed entries', async () => {
    await mkdir(join(root, '.skills-market-hub-install-abc'), { recursive: true })
    await writeFile(join(root, '.skills-market-hub-install-abc', 'SKILL.md'), 'x', 'utf8')
    await mkdir(join(root, '.skills-market-hub-trash-demo-1'), { recursive: true })
    await writeFile(join(root, '.skills-market-hub-trash-demo-1', 'SKILL.md'), 'x', 'utf8')

    assert.deepEqual(await scanInstalledSkills([root]), [])
  })

  it('ignores a directory with no SKILL.md', async () => {
    await mkdir(join(root, 'not-a-skill'), { recursive: true })
    await writeFile(join(root, 'not-a-skill', 'readme.txt'), 'x', 'utf8')
    assert.deepEqual(await scanInstalledSkills([root]), [])
  })

  it('keeps the first record when two roots reach the same directory', async () => {
    await installMarketSkill('clawhub', 'demo', { skillsRoot: root })
    const records = await scanInstalledSkills([root, root, join(root, 'demo')])
    assert.equal(records.length, 1)
  })
})

describe('sidecar validation', () => {
  it('accepts a well-formed sidecar and rejects the rest', () => {
    const valid = {
      id: 'clawhub:demo',
      source: 'clawhub',
      slug: 'demo',
      installedAt: '2026-01-01T00:00:00.000Z',
      files: [{ path: 'SKILL.md', sha256: 'a'.repeat(64) }],
    }
    assert.ok(parseInstalledMeta(valid, 'clawhub', 'demo') !== null)

    // Every rejection below means "not managed by this plugin", which is the
    // reading that makes the uninstall path refuse rather than delete.
    assert.equal(parseInstalledMeta(valid, 'skillhub', 'demo'), null, 'a different source is a different skill')
    assert.equal(parseInstalledMeta(valid, 'clawhub', 'other'), null, 'a different slug is a different skill')
    assert.equal(parseInstalledMeta({ ...valid, installedAt: '' }, 'clawhub', 'demo'), null)
    assert.equal(parseInstalledMeta({ ...valid, owner: 'a b' }, 'clawhub', 'demo'), null)
    assert.equal(parseInstalledMeta({ ...valid, id: 7 }, 'clawhub', 'demo'), null)
    assert.equal(parseInstalledMeta(null, 'clawhub', 'demo'), null)
    assert.equal(parseInstalledMeta([], 'clawhub', 'demo'), null)
  })

  it('keeps the ledger usable when it is damaged, because identity is what matters', () => {
    const withBadLedger = {
      id: 'clawhub:demo',
      source: 'clawhub',
      slug: 'demo',
      installedAt: '2026-01-01T00:00:00.000Z',
      files: 'not an array',
    }
    const parsed = parseInstalledMeta(withBadLedger, 'clawhub', 'demo')
    assert.ok(parsed !== null, 'a damaged ledger does not revoke ownership')
    assert.deepEqual(parsed.files, [])
  })

  it('derives a stable key for one directory', () => {
    assert.equal(installedEntryKey(root), installedEntryKey(root))
    assert.notEqual(installedEntryKey(root), installedEntryKey(join(root, 'demo')))
  })
})

describe('installed reads', () => {
  it('reads the document, its raw frontmatter, and its file list', async () => {
    await installMarketSkill('clawhub', 'demo', { skillsRoot: root })
    const key = installedEntryKey(join(root, 'demo'))
    const detail = await readInstalledSkill([root], key)

    assert.equal(detail.markdown, SKILL_MD)
    assert.equal(detail.frontmatter, 'name: demo\ndescription: A demo skill.')
    assert.deepEqual(detail.files.map((file) => file.path).sort(), ['SKILL.md', 'reference/notes.md'])
    assert.equal(detail.files.find((file) => file.path === 'SKILL.md').language, 'markdown')
  })

  it('reads one file of an installed skill', async () => {
    await installMarketSkill('clawhub', 'demo', { skillsRoot: root })
    const key = installedEntryKey(join(root, 'demo'))
    const file = await readInstalledEntryFile([root], key, SAFE_PATH)
    assert.equal(file.content, 'notes txt')
    assert.equal(file.truncated, false)
  })

  it('refuses a file path outside the skill directory', async () => {
    await installMarketSkill('clawhub', 'demo', { skillsRoot: root })
    const key = installedEntryKey(join(root, 'demo'))

    for (const path of ['../SKILL.md', '/etc/passwd', 'a/../../x']) {
      await assert.rejects(
        readInstalledEntryFile([root], key, path),
        (error) => error.status === 400,
        path,
      )
    }
  })

  it('refuses an unknown key', async () => {
    await assert.rejects(
      readInstalledSkill([root], 'a'.repeat(64)),
      (error) => error.status === 404,
    )
  })
})

describe('uninstall by entry key', () => {
  it('removes a managed entry addressed by its key', async () => {
    await installMarketSkill('clawhub', 'demo', { skillsRoot: root })
    const key = installedEntryKey(join(root, 'demo'))
    const result = await uninstallInstalledEntry([root], key, { skillsRoot: root, allowUninstall: true })

    assert.equal(result.item.dirName, 'demo')
    assert.equal(existsSync(join(root, 'demo')), false)
  })

  it('refuses an unmanaged entry', async () => {
    await mkdir(join(root, 'handwritten'), { recursive: true })
    await writeFile(join(root, 'handwritten', 'SKILL.md'), SKILL_MD, 'utf8')
    const key = installedEntryKey(join(root, 'handwritten'))

    await assert.rejects(
      uninstallInstalledEntry([root], key, { skillsRoot: root, allowUninstall: true }),
      (error) => error.code === 'MARKET_NOT_MANAGED',
    )
    assert.equal(existsSync(join(root, 'handwritten')), true)
  })
})

/**
 * The publish step, when the filesystem says no.
 *
 * The failures covered here are races — a Windows scanner holding a handle on a
 * directory that was just created — and a race cannot be arranged on demand. What
 * *can* be pinned is the response to one, which is what was wrong: a refused
 * publish was reported as a generic "publishing the skill failed" even when the
 * plugin had already classified the cause correctly elsewhere, and the cleanup
 * that failed immediately afterwards was swallowed with `.catch(() => undefined)`,
 * leaving an unexplained directory in the user's skills root.
 *
 * The seam is `InstallOptions.fs`, not a patched `node:fs/promises`: an ES module
 * namespace refuses assignment, and reaching around that would test the loader
 * rather than the code.
 */
describe('publish failures', () => {
  /** A filesystem that behaves, except where the test says otherwise. */
  function fakeFs(overrides = {}) {
    return {
      rename: overrides.rename ?? ((from, to) => rename(from, to)),
      rm: overrides.rm ?? ((target) => rm(target, { recursive: true, force: true })),
      exists: overrides.exists ?? (async (target) => existsSync(target)),
    }
  }

  /** An `EPERM` shaped the way Node raises one on Windows. */
  function lockError(syscall, target) {
    const error = new Error(`EPERM: operation not permitted, ${syscall} '${target}'`)
    error.code = 'EPERM'
    error.syscall = syscall
    return error
  }

  it('classifies a held handle as retryable, and a real answer as final', () => {
    // The distinction the whole retry loop rests on. `EPERM` is what a scanner
    // produces; `ENOENT` is the disk telling the truth, and retrying it would only
    // make the reader wait for the same answer.
    for (const code of ['EPERM', 'EACCES', 'EBUSY']) {
      assert.equal(isTransientLock(Object.assign(new Error(code), { code })), true, code)
    }
    for (const code of ['ENOENT', 'ENOTEMPTY', 'EEXIST', 'ENOSPC', 'EROFS']) {
      assert.equal(isTransientLock(Object.assign(new Error(code), { code })), false, code)
    }
    assert.equal(isTransientLock(undefined), false)
    assert.equal(isTransientLock(new Error('no code')), false)
  })

  it('retries a refused publish and succeeds, which is what a scanner needs', async () => {
    let attempts = 0
    const waited = []

    const result = await installMarketSkill('clawhub', 'demo', {
      skillsRoot: root,
      delay: async (ms) => { waited.push(ms) },
      fs: fakeFs({
        rename: async (from, to) => {
          attempts += 1
          if (attempts < 3) throw lockError('rename', from)
          return rename(from, to)
        },
      }),
    })

    assert.equal(attempts, 3, 'the third attempt must be the one that lands')
    assert.equal(await readFile(join(result.installedPath, 'SKILL.md'), 'utf8'), SKILL_MD)
    // Backoff grows, and the test never spends the real time.
    assert.deepEqual(waited, [60, 120])
    assert.deepEqual((await readdir(root)).sort(), ['demo'], 'and no staging directory survives')
  })

  it('reports an occupied destination as a conflict, not as a disk error', async () => {
    // The platform difference this exists for: POSIX answers a rename onto a
    // non-empty directory with `ENOTEMPTY`, Windows with `EPERM`. The old code
    // only recognised the first, so on Windows a name conflict reached the reader
    // as the one message that explains nothing.
    let attempts = 0
    await mkdir(join(root, 'demo'), { recursive: true })

    await assert.rejects(
      installMarketSkill('clawhub', 'demo', {
        skillsRoot: root,
        delay: async () => undefined,
        fs: fakeFs({ rename: async (from) => { attempts += 1; throw lockError('rename', from) } }),
      }),
      (error) => {
        assert.equal(error.status, 409)
        assert.equal(error.code, 'MARKET_NOT_INSTALLABLE')
        assert.match(error.message, /already occupies/)
        return true
      },
    )
    // Answered before the publish was even reached: a conflict is not a lock, and
    // waiting on one would only delay the answer.
    assert.equal(attempts, 0)
  })

  it('reports the operating system\u2019s own error instead of a sentence that says nothing', async () => {
    await assert.rejects(
      installMarketSkill('clawhub', 'demo', {
        skillsRoot: root,
        delay: async () => undefined,
        fs: fakeFs({ rename: async (from) => { throw lockError('rename', from) } }),
      }),
      (error) => {
        assert.equal(error.status, 500)
        assert.equal(error.code, 'MARKET_DISK_ERROR')
        // The three things a reader needs: what the OS said, that it was retried,
        // and which directory to remove if it stays behind.
        assert.match(error.message, /EPERM/)
        assert.match(error.message, new RegExp(`${RENAME_ATTEMPTS} attempts`))
        assert.match(error.message, /skills-market-hub-install-/)
        return true
      },
    )
  })

  it('reports a staging directory it could not remove, instead of swallowing it', async () => {
    const stuck = []

    const result = await installMarketSkill('clawhub', 'demo', {
      skillsRoot: root,
      delay: async () => undefined,
      fs: fakeFs({
        // Fails only for the staging directory: the shape of "a handle was held on
        // it at the wrong moment". The install itself succeeds — the rename moved
        // the staging path away — which is exactly why silence here left a real
        // skills root with a directory nobody could explain.
        rm: async (target) => {
          if (String(target).includes('.skills-market-hub-install-')) throw lockError('rm', target)
          return rm(target, { recursive: true, force: true })
        },
      }),
      onStuckStaging: (path) => { stuck.push(path) },
    })

    assert.equal(result.installedPath, join(root, 'demo'))
    assert.equal(stuck.length, 1)
    assert.match(stuck[0], /\.skills-market-hub-install-/)
  })

  it('clears a leftover from an earlier attempt before staging the next one', async () => {
    // The recovery path a user actually depends on: a directory that outlived the
    // install which made it must not accumulate, and must not block the next try.
    const leftover = join(root, '.skills-market-hub-install-orphan')
    await mkdir(leftover, { recursive: true })
    await writeFile(join(leftover, 'partial.txt'), 'half a skill', 'utf8')

    const result = await installMarketSkill('clawhub', 'demo', { skillsRoot: root })

    assert.equal(existsSync(leftover), false, 'the orphan must be gone')
    assert.deepEqual((await readdir(root)).sort(), ['demo'])
    assert.equal(await readFile(join(result.installedPath, 'SKILL.md'), 'utf8'), SKILL_MD)
  })

  it('reports an orphan it cannot remove rather than retrying forever', async () => {
    const leftover = join(root, '.skills-market-hub-install-orphan')
    await mkdir(leftover, { recursive: true })
    const stuck = []

    await installMarketSkill('clawhub', 'demo', {
      skillsRoot: root,
      delay: async () => undefined,
      fs: fakeFs({
        rm: async (target) => {
          if (String(target).includes('orphan')) throw lockError('rm', target)
          return rm(target, { recursive: true, force: true })
        },
      }),
      onStuckStaging: (path) => { stuck.push(path) },
    })

    assert.deepEqual(stuck, [leftover])
  })

  it('sweeps staging directories without touching a real skill', async () => {
    await installMarketSkill('clawhub', 'demo', { skillsRoot: root })
    await mkdir(join(root, '.skills-market-hub-install-a'), { recursive: true })
    await mkdir(join(root, '.skills-market-hub-install-b'), { recursive: true })

    const stuck = await sweepStagingDirectories(root, { delay: async () => undefined })

    assert.deepEqual(stuck, [])
    assert.deepEqual((await readdir(root)).sort(), ['demo'])
  })

  it('answers an absent skills root without inventing a failure', async () => {
    // Startup runs this before any install, on a machine that may have no skills
    // root at all. "Nothing to sweep" is not an error.
    const stuck = await sweepStagingDirectories(join(root, 'does-not-exist'))
    assert.deepEqual(stuck, [])
  })
})
