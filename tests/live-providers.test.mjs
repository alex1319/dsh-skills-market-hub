/**
 * Live integration against both real registries.
 *
 * Skipped unless `SMH_LIVE=1`, because it needs the network, it is slower than the
 * rest of the suite, and an upstream outage must not read as a regression in this
 * plugin. It exists because a fixture is a photograph: it proves the normalizers
 * match the shape someone captured, not that the registries still answer this way
 * today. Run it before a release, and after any upstream change report.
 *
 *   SMH_LIVE=1 node --test tests/live-providers.test.mjs
 *
 * What it checks that no fixture can: that the endpoints are still where this
 * plugin thinks they are, that the pagination cursors this plugin hands back are
 * still accepted, and that a real skill's bytes can be fetched and checksummed.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { clawhubProvider } from '../lib/market/clawhub-provider.js'
import { skillhubProvider } from '../lib/market/skillhub-provider.js'
import { configureProviderFetch, resetProviderFetchConfiguration } from '../lib/market/provider-fetch.js'
import { installMarketSkill, resetInstallLocks, uninstallMarketSkill } from '../lib/skills/install-service.js'
import { setInstalledLookup, setMarketCache, setProviders } from '../lib/market/market-service.js'
import { scanInstalledSkills } from '../lib/skills/installed.js'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const enabled = process.env.SMH_LIVE === '1'

/** A longer budget than the shipped default: a shared CI runner is not a desktop. */
const LIVE_TIMEOUT_MS = 30_000
const LIVE_TIMEOUT = { timeout: LIVE_TIMEOUT_MS }

describe('live registries', { skip: enabled ? false : 'set SMH_LIVE=1 to run against the real registries' }, () => {
  configureProviderFetch({ timeoutMs: 20_000, retries: 2 })
  setMarketCache(null)
  setProviders({ clawhub: clawhubProvider, skillhub: skillhubProvider })
  resetInstallLocks()

  it('lists ClawHub skills and hands back a usable cursor', LIVE_TIMEOUT, async () => {
    const page = await clawhubProvider.list({ limit: 3 })

    assert.ok(page.items.length > 0, 'the registry returned no skills')
    for (const item of page.items) {
      assert.equal(item.source, 'clawhub')
      assert.match(item.id, /^clawhub:.+/)
      assert.ok(item.name !== '', 'a card needs a title')
      assert.ok(item.author.handle !== 'unknown', 'a card needs an author')
      assert.ok(Number.isFinite(item.stats.downloads))
    }

    if (page.nextCursor !== undefined) {
      // The cursor is opaque and must survive a round trip verbatim; a client that
      // rebuilt it would page into a different ordering or fail outright.
      const second = await clawhubProvider.list({ cursor: page.nextCursor, limit: 3 })
      assert.ok(second.items.length > 0, 'the cursor the registry handed back was not accepted')
      const firstIds = new Set(page.items.map((item) => item.id))
      assert.ok(
        second.items.every((item) => !firstIds.has(item.id)),
        'page two repeated page one, so the cursor is not a cursor',
      )
    }
  })

  it('searches ClawHub and returns only native skills', LIVE_TIMEOUT, async () => {
    const page = await clawhubProvider.search({ q: 'pdf', limit: 10 })

    assert.ok(page.items.length > 0, 'the search returned nothing for a common term')
    for (const item of page.items) {
      assert.equal(item.source, 'clawhub')
      // Aggregated rows from other registries carry `native: null`; offering one as
      // an installable ClawHub slug would fail at install time.
      assert.ok(item.slug !== '', 'a search result needs a slug to be addressable')
    }
  })

  it('reads a ClawHub detail, its file inventory, and one file', LIVE_TIMEOUT, async () => {
    // `pdf` is a slug published by several authors, which is exactly the case the
    // owner parameter exists for.
    const detail = await clawhubProvider.detail('pdf', { owner: 'awspace' })

    assert.equal(detail.slug, 'pdf')
    assert.equal(detail.author.handle, 'awspace')
    assert.ok(detail.description.length > 0, 'the detail carries the skill document')
    assert.ok(!detail.description.startsWith('---'), 'the rendered body must not open with a frontmatter fence')
    assert.equal(detail.descriptionFrontmatter?.name, 'pdf')
    assert.ok(detail.version !== undefined)

    const files = await clawhubProvider.listFiles('pdf', { version: detail.version, owner: 'awspace' })
    assert.ok(files.length > 0, 'the version has no file inventory')
    const skillFile = files.find((file) => file.path.toLowerCase() === 'skill.md')
    assert.ok(skillFile, 'a skill without SKILL.md cannot be installed')

    const content = await clawhubProvider.fetchFile('pdf', { path: skillFile.path, owner: 'awspace' })
    assert.ok(content.content.length > 0, 'the file endpoint returned nothing')
    if (skillFile.sha256 !== undefined) {
      // The registry publishes a hash; the plugin's own hash must agree with it,
      // because that comparison is what aborts a tampered install.
      const { createHash } = await import('node:crypto')
      const digest = createHash('sha256').update(content.content, 'utf8').digest('hex')
      assert.equal(digest, skillFile.sha256, 'the fetched bytes do not match the published checksum')
    }
  })

  it('reports the ambiguity ClawHub answers without an owner', LIVE_TIMEOUT, async () => {
    // A slug published by more than one author must surface the candidates rather
    // than silently resolving to the most downloaded one.
    try {
      const detail = await clawhubProvider.detail('pdf', {})
      // Some slugs are unambiguous today; when this one is not, the call must have
      // succeeded with a real author.
      assert.ok(detail.author.handle !== 'unknown')
    } catch (error) {
      const { AmbiguousSkillSlugError } = await import('../lib/market/clawhub-provider.js')
      assert.ok(error instanceof AmbiguousSkillSlugError, `unexpected error: ${String(error)}`)
      assert.ok(error.owners.length > 1, 'an ambiguity must name more than one author')
    }
  })

  it('lists, searches and reads a SkillHub skill', LIVE_TIMEOUT, async () => {
    const page = await skillhubProvider.list({ limit: 3 })
    assert.ok(page.items.length > 0)
    for (const item of page.items) {
      assert.equal(item.source, 'skillhub')
      assert.ok(item.name !== '')
    }

    const searched = await skillhubProvider.search({ q: 'pdf', limit: 3 })
    assert.ok(searched.items.length > 0, 'the keyword search returned nothing')

    const first = page.items[0]
    const detail = await skillhubProvider.detail(first.slug, {})
    assert.equal(detail.slug, first.slug)
    assert.ok(detail.name !== '', 'the detail must carry a name')
    assert.ok(detail.version !== undefined, 'the detail must carry a version')

    const files = await skillhubProvider.listFiles(first.slug, {})
    assert.ok(files.length > 0, 'the skill has no file inventory')
    assert.ok(files.every((file) => file.sha256 === undefined || /^[a-f0-9]{64}$/.test(file.sha256)))
  })

  it('pages SkillHub with its own cursor', LIVE_TIMEOUT, async () => {
    const first = await skillhubProvider.list({ limit: 3 })
    assert.ok(first.nextCursor !== undefined, 'a registry of this size must offer a next page')

    const second = await skillhubProvider.list({ cursor: first.nextCursor, limit: 3 })
    assert.ok(second.items.length > 0, 'the cursor this plugin handed back was not accepted')

    const firstIds = new Set(first.items.map((item) => item.id))
    const fresh = second.items.filter((item) => !firstIds.has(item.id))

    // This registry's offset paging overlaps at the page boundary: its own
    // `page=1&pageSize=3` and `page=2&pageSize=3` responses repeat one entry (a
    // shift of one, not a fixed offset). Verified against the raw endpoint, so it
    // is upstream behaviour rather than a defect here.
    //
    // What must hold regardless is that the cursor makes progress: a page with
    // nothing new on it means the cursor is not a cursor, and the list would grow
    // forever without ever reaching the end. The panel additionally deduplicates by
    // id, so the repeat never reaches the reader as a duplicate card.
    assert.ok(fresh.length > 0, 'page two contained nothing page one had not already shown, so the cursor does not advance')
    assert.ok(fresh.length >= second.items.length - 1, `page two was mostly a repeat (${second.items.length - fresh.length} of ${second.items.length} already seen)`)
  })

  it('installs a real SkillHub skill whose two author handles disagree', LIVE_TIMEOUT, async () => {
    const root = await mkdtemp(join(tmpdir(), 'skills-market-hub-live-'))
    try {
      // Find a skill where the listing's account handle and the detail's author
      // handle actually differ — the shape that made every SkillHub install fail
      // in 0.1.0. Picking a skill *because* it has this shape keeps the regression
      // covered without pinning the test to one slug that may vanish; most of this
      // registry has it (17 of 24 sampled).
      const target = await findSkillWithMismatchedHandles()
      assert.ok(target !== undefined, 'no SkillHub skill with differing handles was found; the mismatch may have been fixed upstream, in which case this guard can be relaxed')

      const result = await installMarketSkill('skillhub', target.skill.slug, {
        skillsRoot: root,
        // Pass the author exactly the way the panel does: taken off the card.
        owner: target.skill.author.handle,
      })

      // The published tree is on disk, whole.
      const installed = await readdir(result.installedPath)
      assert.ok(installed.includes('SKILL.md'), 'a published skill must have its SKILL.md')
      assert.ok(installed.includes('.skills-market-hub.json'), 'installation must record its provenance')

      const meta = JSON.parse(await readFile(join(result.installedPath, '.skills-market-hub.json'), 'utf8'))
      assert.equal(meta.id, `skillhub:${target.skill.slug}`)
      assert.ok(meta.files.length > 0, 'the provenance ledger must record the files it wrote')
      assert.ok(!Number.isNaN(Date.parse(meta.installedAt)))

      // The harness's own inventory sees it, with the provenance attached.
      const inventory = await scanInstalledSkills([root])
      const record = inventory.find((entry) => entry.dirName === target.skill.slug)
      assert.ok(record !== undefined, 'the installed skill must appear in the inventory')
      assert.equal(record.managed, true)
      assert.equal(record.id, `skillhub:${target.skill.slug}`)

      // Uninstall removes exactly that directory.
      const removed = await uninstallMarketSkill('skillhub', target.skill.slug, { skillsRoot: root, allowUninstall: true })
      assert.equal(removed.removedPath, result.installedPath)
      assert.equal(existsSync(result.installedPath), false)
      assert.deepEqual((await readdir(root)).filter((entry) => entry.startsWith('.')), [], 'uninstall must not leave staging or trash behind')
    } finally {
      await rm(root, { recursive: true, force: true })
      setInstalledLookup({ has: () => false, info: () => undefined })
      resetProviderFetchConfiguration()
    }
  })
})

/**
 * Find one SkillHub skill whose card handle differs from its detail handle.
 *
 * @returns the listing entry whose detail resolves to a different author, or
 *   `undefined` when a sample of the registry shows no such skill.
 */
async function findSkillWithMismatchedHandles() {
  const seen = new Set()
  for (const query of ['markdown', 'pdf', 'agent']) {
    const page = await skillhubProvider.search({ q: query, limit: 20 })
    for (const item of page.items) {
      if (seen.has(item.slug) || item.version === undefined) continue
      seen.add(item.slug)
      const detail = await skillhubProvider.detail(item.slug, {}).catch(() => null)
      if (detail === null) continue
      if (detail.author.handle !== item.author.handle) return { skill: item, detail }
    }
  }
  return undefined
}
