/**
 * Owner pinning, per registry.
 *
 * This is a regression suite for a bug that shipped in 0.1.0 and was found in the
 * GUI, not by the rest of the tests: installing any **SkillHub** skill failed with
 * "the registry resolved a different author for this skill".
 *
 * The cause was treating two registries as if they agreed about what an author
 * argument means:
 *
 *  - ClawHub publishes one slug under many authors. `?owner=` selects *which*
 *    skill is meant, so a resolved author that disagrees is a different skill and
 *    refusing the install is correct.
 *  - SkillHub's detail route already fixes the account
 *    (`/api/v1/skills/{slug}`) and ignores `owner` entirely. The listing's account
 *    handle (`namespace.handle`) and the detail's user handle (`owner.handle`) are
 *    *different fields of the same account*, so comparing them refuses a skill
 *    that was installable all along.
 *
 * The two cases are asserted side by side on purpose: a fix that simply deleted
 * the check would pass the SkillHub test and silently reopen the ClawHub hole.
 */

import { afterEach, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { installMarketSkill, resetInstallLocks } from '../lib/skills/install-service.js'
import { resetInstalledLookup, setMarketCache, setProviders } from '../lib/market/market-service.js'

const SKILL_MD = '---\nname: demo\ndescription: Demo.\n---\n\nBody.\n'

let root

/**
 * A registry stub whose listing handle and detail handle deliberately disagree,
 * which is what SkillHub really does.
 */
function stub({ source, pinsOwner, listHandle = 'namespace-handle', detailHandle = 'user-12345' }) {
  const files = [{ path: 'SKILL.md', size: Buffer.byteLength(SKILL_MD), sha256: sha256(SKILL_MD) }]
  return {
    source,
    pinsOwner,
    async list() { return { items: [] } },
    async search() { return { items: [] } },
    async detail(slug) {
      return {
        id: `${source}:${slug}`,
        source,
        slug,
        name: 'Demo',
        summary: 'Demo.',
        author: { handle: detailHandle },
        stats: { downloads: 1 },
        tags: [],
        securityStatus: 'unknown',
        installState: 'installable',
        version: '1.0.0',
        description: 'Body.',
        files,
        totalSize: files[0].size,
      }
    },
    async listFiles() { return files },
    async fetchFile() { return { content: SKILL_MD, size: Buffer.byteLength(SKILL_MD) } },
    // Exposed so a test can name the handle a card would have carried.
    listHandle,
  }
}

function sha256(text) {
  // A local helper keeps the fixture independent of the module under test.
  return require('node:crypto').createHash('sha256').update(text, 'utf8').digest('hex')
}

const require = (await import('node:module')).createRequire(import.meta.url)

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'skills-market-hub-pin-'))
  resetInstallLocks()
  resetInstalledLookup()
  setMarketCache(null)
})

afterEach(async () => {
  setProviders({})
  resetInstalledLookup()
  await rm(root, { recursive: true, force: true })
})

describe('a registry that does not pin owners', () => {
  it('installs even when the listing handle differs from the detail handle', async () => {
    // The exact production shape: the card carries `namespace.handle`, the detail
    // answers with `owner.handle`, and the two are different strings.
    const provider = stub({ source: 'skillhub', pinsOwner: false })
    setProviders({ skillhub: provider })

    const result = await installMarketSkill('skillhub', 'demo', {
      skillsRoot: root,
      owner: provider.listHandle,
    })

    assert.equal(result.skill.installState, 'installed')
    assert.equal(existsSync(join(root, 'demo', 'SKILL.md')), true)
    assert.deepEqual((await readdir(root)).filter((entry) => entry.startsWith('.')), [])
  })

  it('still installs when the caller passes no owner at all', async () => {
    setProviders({ skillhub: stub({ source: 'skillhub', pinsOwner: false }) })
    const result = await installMarketSkill('skillhub', 'demo', { skillsRoot: root })
    assert.equal(result.skill.installState, 'installed')
  })
})

describe('a registry that does pin owners', () => {
  it('refuses a skill the registry resolved to a different author', async () => {
    setProviders({ clawhub: stub({ source: 'clawhub', pinsOwner: true, detailHandle: 'someone-else' }) })

    await assert.rejects(
      installMarketSkill('clawhub', 'demo', { skillsRoot: root, owner: 'the-author-i-picked' }),
      (error) => {
        assert.equal(error.status, 409)
        assert.equal(error.code, 'MARKET_NOT_INSTALLABLE')
        // The message names both handles, so the reader can tell which author they
        // are actually looking at instead of re-trying the same button.
        assert.match(error.message, /someone-else/)
        assert.match(error.message, /the-author-i-picked/)
        return true
      },
    )

    assert.deepEqual(await readdir(root), [], 'a refused install must write nothing')
  })

  it('installs when the pinned author is the one that resolved', async () => {
    setProviders({ clawhub: stub({ source: 'clawhub', pinsOwner: true, detailHandle: 'awspace' }) })

    const result = await installMarketSkill('clawhub', 'demo', { skillsRoot: root, owner: 'awspace' })
    assert.equal(result.skill.installState, 'installed')
  })

  it('installs when the caller pinned nothing, accepting whatever resolves', async () => {
    // An unpinned request is the registry's own resolution: this plugin must not
    // invent an ambiguity the caller did not raise.
    setProviders({ clawhub: stub({ source: 'clawhub', pinsOwner: true, detailHandle: 'whoever' }) })
    const result = await installMarketSkill('clawhub', 'demo', { skillsRoot: root })
    assert.equal(result.skill.installState, 'installed')
  })
})
