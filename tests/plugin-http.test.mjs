/**
 * Every endpoint, over a real socket, on the plugin's own wiring.
 *
 * Unlike the activation tests, these drive `apply()` exactly as the host does and
 * then speak HTTP to it — so the route table, the parameter validation, the error
 * envelope, the trust gate, and the install path are all exercised together
 * rather than one at a time.
 *
 * The skills root and `DSH_HOME` are throwaway temp directories (see
 * `bootPlugin`), so no test can touch a real profile.
 */

import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { bootPlugin, postJson, request } from './fixtures/host.mjs'

const plugin = await import('../lib/index.js')

const ROUTE_PREFIX = '/api/skills-market-hub'

describe('skills-market-hub HTTP surface', () => {
  describe('activation', () => {
    it('declares no required service, so a headless profile still loads it', () => {
      assert.deepEqual(plugin.inject, [])
      assert.equal(plugin.name, 'skills-market-hub')
      assert.ok(plugin.Config !== undefined, 'Config must be exported for the settings form')
    })

    it('binds the web server lazily when it appears after activation', async () => {
      const { fakeContext, fakeWebServer } = await import('./fixtures/host.mjs')
      const host = fakeContext({})
      plugin.apply(host.ctx, {})

      const webServer = fakeWebServer()
      assert.equal(webServer.routes.length, 0, 'nothing to bind yet')

      // The Loader activates rows concurrently: the server can show up later, and
      // the plugin must pick it up from the service event.
      host.ctx.get = (name) => (name === 'webServer' ? webServer : undefined)
      host.emitService('webServer')

      assert.equal(webServer.routes.length, 1)
      assert.equal(webServer.routes[0].kind, 'prefix')
      assert.equal(webServer.routes[0].path, ROUTE_PREFIX)
      await host.disposeAll()
    })

    it('accepts the legacy httpServer service key', async () => {
      const { fakeContext, fakeWebServer } = await import('./fixtures/host.mjs')
      const webServer = fakeWebServer()
      const host = fakeContext({ httpServer: webServer })
      plugin.apply(host.ctx, {})
      assert.equal(webServer.routes.length, 1)
      await host.disposeAll()
    })

    it('leaves a disposer that removes the route on unload', async () => {
      const { fakeContext, fakeWebServer } = await import('./fixtures/host.mjs')
      const webServer = fakeWebServer()
      const host = fakeContext({ webServer })
      plugin.apply(host.ctx, {})
      assert.equal(webServer.routes.length, 1)
      await host.disposeAll()
      assert.equal(webServer.routes.length, 0)
    })
  })

  describe('routing and validation', () => {
    let host

    before(async () => { host = await bootPlugin(plugin) })
    after(async () => { await host.close() })

    it('answers a ping, proving the route is bound and reachable', async () => {
      const response = await request(host.base, `${ROUTE_PREFIX}/ping`)
      assert.equal(response.status, 200)
      assert.deepEqual(response.body, { ok: true })
      assert.equal(response.headers.get('cache-control'), 'no-store')
      assert.match(response.headers.get('content-type') ?? '', /application\/json/)
    })

    it('reports its own version', async () => {
      const response = await request(host.base, `${ROUTE_PREFIX}/version`)
      assert.equal(response.body.name, 'skills-market-hub')
      assert.match(response.body.version, /^\d+\.\d+\.\d+/)
    })

    it('reports counters whose keys are all numbers', async () => {
      const response = await request(host.base, `${ROUTE_PREFIX}/stats`)
      assert.equal(response.status, 200)
      for (const [key, value] of Object.entries(response.body.stats)) {
        assert.equal(typeof value, 'number', `${key} must be a number`)
      }
    })

    it('reports per-source health', async () => {
      const response = await request(host.base, `${ROUTE_PREFIX}/status`)
      assert.equal(response.status, 200)
      assert.ok('clawhub' in response.body.sources)
      assert.ok('skillhub' in response.body.sources)
    })

    it('rejects an unknown path with the documented envelope', async () => {
      const response = await request(host.base, `${ROUTE_PREFIX}/nope`)
      assert.equal(response.status, 404)
      assert.equal(response.body.error.code, 'NOT_FOUND')
      assert.equal(typeof response.body.error.message, 'string')
    })

    it('is a 404 outside its own prefix, not a wildcard', async () => {
      const response = await request(host.base, '/api/something-else')
      assert.equal(response.status, 404)
      assert.equal(response.body.error.code, 'NO_ROUTE')
    })

    it('rejects a wrong method with 405 and an Allow header', async () => {
      const response = await request(host.base, `${ROUTE_PREFIX}/ping`, { method: 'POST' })
      assert.equal(response.status, 405)
      assert.equal(response.body.error.code, 'METHOD_NOT_ALLOWED')
      assert.equal(response.headers.get('allow'), 'GET')
    })

    it('rejects malformed percent-encoding as a bad request', async () => {
      const response = await request(host.base, `${ROUTE_PREFIX}/%E0%A4%A`)
      assert.equal(response.status, 400)
      assert.equal(response.body.error.code, 'BAD_REQUEST')
    })

    it('keeps answering after a rejected request', async () => {
      await request(host.base, `${ROUTE_PREFIX}/nope`)
      assert.equal((await request(host.base, `${ROUTE_PREFIX}/ping`)).status, 200)
    })

    it('rejects an unknown market source', async () => {
      const response = await request(host.base, `${ROUTE_PREFIX}/skills/evil/git`)
      assert.equal(response.status, 400)
      assert.equal(response.body.error.code, 'BAD_REQUEST')
    })

    it('rejects a traversal attempt in a file path', async () => {
      const response = await request(host.base, `${ROUTE_PREFIX}/skills/clawhub/demo/file?path=../../etc/passwd`)
      assert.equal(response.status, 400)
      assert.equal(response.body.error.code, 'BAD_REQUEST')
    })

    it('rejects an invalid category, owner, refresh, and limit', async () => {
      const cases = [
        `${ROUTE_PREFIX}/skills?category=..%2Fetc`,
        `${ROUTE_PREFIX}/skills/clawhub/demo?owner=..%2Fevil`,
        `${ROUTE_PREFIX}/skills?refresh=maybe`,
        `${ROUTE_PREFIX}/skills?limit=abc`,
        `${ROUTE_PREFIX}/skills?source=nope`,
        `${ROUTE_PREFIX}/skills?security=nope`,
        `${ROUTE_PREFIX}/skills?installed=nope`,
        `${ROUTE_PREFIX}/skills?scope=nope`,
      ]
      for (const path of cases) {
        const response = await request(host.base, path)
        assert.equal(response.status, 400, path)
        assert.equal(response.body.error.code, 'BAD_REQUEST', path)
      }
    })

    it('rejects a malformed cursor rather than silently restarting the list', async () => {
      const response = await request(host.base, `${ROUTE_PREFIX}/skills?cursor=not-a-cursor`)
      assert.equal(response.status, 400)
      assert.equal(response.body.error.code, 'BAD_REQUEST')
    })

    it('rejects a malformed install id', async () => {
      const response = await postJson(host.base, `${ROUTE_PREFIX}/install`, { id: 'nope' })
      assert.equal(response.status, 400)
      assert.equal(response.body.error.code, 'BAD_REQUEST')
    })

    it('rejects a malformed owner in an install body', async () => {
      const response = await postJson(host.base, `${ROUTE_PREFIX}/install`, { id: 'clawhub:demo', owner: 'a b' })
      assert.equal(response.status, 400)
    })

    it('rejects an oversized request body', async () => {
      const response = await request(host.base, `${ROUTE_PREFIX}/install`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: 'clawhub:demo', padding: 'x'.repeat(70 * 1024) }),
      })
      assert.equal(response.status, 400)
    })

    it('rejects a body that is not a JSON object', async () => {
      const response = await request(host.base, `${ROUTE_PREFIX}/install`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '[1,2,3]',
      })
      assert.equal(response.status, 400)
    })

    it('requires a valid key for the installed endpoints', async () => {
      for (const path of [
        `${ROUTE_PREFIX}/installed/detail`,
        `${ROUTE_PREFIX}/installed/detail?key=short`,
        `${ROUTE_PREFIX}/installed/file?key=short&path=SKILL.md`,
      ]) {
        const response = await request(host.base, path)
        assert.equal(response.status, 400, path)
      }
    })

    it('reports 404 for an unknown installed key', async () => {
      const key = 'a'.repeat(64)
      const response = await request(host.base, `${ROUTE_PREFIX}/installed/detail?key=${key}`)
      assert.equal(response.status, 404)
      assert.equal(response.body.error.code, 'MARKET_NOT_INSTALLED')
    })
  })

  describe('the trust gate', () => {
    it('is absent by default and enforced the moment it appears', async () => {
      const { fakeContext, fakeWebServer } = await import('./fixtures/host.mjs')
      const webServer = fakeWebServer()
      // The service table is read through `ctx.get` on every request, so mutating
      // it mid-flight is exactly how a late-activating Connection row behaves.
      const services = { webServer }
      const fake = fakeContext(services)
      plugin.apply(fake.ctx, {})

      const base = await webServer.listen()

      // No gate at all: the surface answers.
      assert.equal((await request(base, `${ROUTE_PREFIX}/ping`)).status, 200)

      services.connection = { requestRejection: () => 403 }
      const forbidden = await request(base, `${ROUTE_PREFIX}/ping`)
      assert.equal(forbidden.status, 403)
      assert.equal(forbidden.body.error.code, 'FORBIDDEN')

      services.connection = { requestRejection: () => 401 }
      const unauthorized = await request(base, `${ROUTE_PREFIX}/ping`)
      assert.equal(unauthorized.status, 401)
      assert.equal(unauthorized.body.error.code, 'UNAUTHORIZED')

      services.connection = { requestRejection: () => undefined }
      assert.equal((await request(base, `${ROUTE_PREFIX}/ping`)).status, 200)

      // A gate whose predicate throws must fail closed: an exception from the
      // security fence must never become "serve the request anyway".
      services.connection = { requestRejection: () => { throw new Error('fence is broken') } }
      assert.equal((await request(base, `${ROUTE_PREFIX}/ping`)).status, 403)

      // A boolean predicate is accepted too, because that is the shape the
      // structural contract documents.
      services.connection = { requestRejection: () => true }
      assert.equal((await request(base, `${ROUTE_PREFIX}/ping`)).status, 403)

      await webServer.close()
      await fake.disposeAll()
    })
  })

  describe('local inventory', () => {
    let host

    before(async () => { host = await bootPlugin(plugin) })
    after(async () => { await host.close() })

    it('starts empty', async () => {
      const response = await request(host.base, `${ROUTE_PREFIX}/installed`)
      assert.equal(response.status, 200)
      assert.deepEqual(response.body.items, [])
    })

    it('reports a hand-written skill as unmanaged, with the policy visible per row', async () => {
      const dir = join(host.skillsRoot, 'handwritten')
      await mkdir(dir, { recursive: true })
      await writeFile(join(dir, 'SKILL.md'), '---\nname: handwritten\ndescription: Mine.\n---\n\nBody.\n', 'utf8')

      const response = await request(host.base, `${ROUTE_PREFIX}/installed`)
      const item = response.body.items.find((entry) => entry.dirName === 'handwritten')
      assert.ok(item, 'a skill placed by hand must appear in the inventory')
      assert.equal(item.managed, false)
      assert.equal(item.id, 'local:handwritten')
      // `removable` carries the configuration policy, not the ownership verdict:
      // with removal enabled it is true here, and the uninstall endpoint is what
      // refuses this particular row.
      assert.equal(item.removable, true)
    })

    it('serves the document, its frontmatter and its file list by key', async () => {
      const items = (await request(host.base, `${ROUTE_PREFIX}/installed`)).body.items
      const item = items.find((entry) => entry.dirName === 'handwritten')

      const detail = await request(host.base, `${ROUTE_PREFIX}/installed/detail?key=${item.key}`)
      assert.equal(detail.status, 200)
      assert.match(detail.body.markdown, /name: handwritten/)
      assert.equal(detail.body.frontmatter, 'name: handwritten\ndescription: Mine.')
      assert.deepEqual(detail.body.files.map((file) => file.path), ['SKILL.md'])
    })

    it('carries the same removal policy in the detail view as in the row', async () => {
      // The regression test for 0.1.10. The detail endpoint returned the raw scan
      // record, whose `removable` was a placeholder `false`, so the detail view's
      // uninstall button was disabled for every skill behind a tooltip blaming a
      // configuration that forbade nothing — while the list row beside it offered
      // the same removal. One policy, two answers.
      //
      // The assertion is deliberately about *agreement*, not about the value: a
      // future change to the default must not be able to satisfy this test on one
      // endpoint and break the other.
      const items = (await request(host.base, `${ROUTE_PREFIX}/installed`)).body.items
      const item = items.find((entry) => entry.dirName === 'handwritten')
      assert.ok(item, 'the fixture skill must be present')

      const detail = await request(host.base, `${ROUTE_PREFIX}/installed/detail?key=${item.key}`)
      assert.equal(detail.status, 200)
      assert.equal(
        detail.body.item.removable,
        item.removable,
        'the detail view and the list row must report the same removal policy',
      )
      assert.equal(typeof detail.body.item.removable, 'boolean', 'the policy is always published, never omitted')
    })

    it('publishes the policy on the record a removal returns', async () => {
      // The third path that publishes an installed record. It is covered for the
      // same reason as the other two: the defect was one path out of three, and
      // nothing was asserting on the two that happened to be correct either.
      const dir = join(host.skillsRoot, 'removable-one')
      await mkdir(dir, { recursive: true })
      await writeFile(join(dir, 'SKILL.md'), '---\nname: removable-one\ndescription: Mine.\n---\n\nBody.\n', 'utf8')
      await writeFile(
        join(dir, '.skills-market-hub.json'),
        JSON.stringify({ id: 'clawhub:removable-one', source: 'clawhub', slug: 'removable-one', installedAt: new Date().toISOString(), files: [] }),
        'utf8',
      )

      const items = (await request(host.base, `${ROUTE_PREFIX}/installed`)).body.items
      const item = items.find((entry) => entry.dirName === 'removable-one')
      const response = await postJson(host.base, `${ROUTE_PREFIX}/installed/uninstall`, { key: item.key })

      assert.equal(response.status, 200)
      assert.equal(response.body.item.removable, true)
    })

    it('serves one file by key', async () => {
      const items = (await request(host.base, `${ROUTE_PREFIX}/installed`)).body.items
      const item = items.find((entry) => entry.dirName === 'handwritten')
      const file = await request(host.base, `${ROUTE_PREFIX}/installed/file?key=${item.key}&path=SKILL.md`)
      assert.equal(file.status, 200)
      assert.match(file.body.file.content, /name: handwritten/)
      assert.equal(file.body.file.language, 'markdown')
    })

    it('refuses to remove a hand-written skill', async () => {
      const items = (await request(host.base, `${ROUTE_PREFIX}/installed`)).body.items
      const item = items.find((entry) => entry.dirName === 'handwritten')
      const response = await postJson(host.base, `${ROUTE_PREFIX}/installed/uninstall`, { key: item.key })
      assert.equal(response.status, 409)
      assert.equal(response.body.error.code, 'MARKET_NOT_MANAGED')
      // The directory is still there.
      const after = (await request(host.base, `${ROUTE_PREFIX}/installed`)).body.items
      assert.ok(after.some((entry) => entry.dirName === 'handwritten'))
    })
  })

  describe('uninstall policy', () => {
    it('refuses every removal when the config disables it', async () => {
      const host = await bootPlugin(plugin, { config: { allowUninstall: false } })
      const response = await postJson(host.base, `${ROUTE_PREFIX}/installed/uninstall`, { key: 'a'.repeat(64) })
      assert.equal(response.status, 405)
      await host.close()
    })

    it('marks rows non-removable when the config disables it', async () => {
      const host = await bootPlugin(plugin, { config: { allowUninstall: false } })
      const dir = join(host.skillsRoot, 'x')
      await mkdir(dir, { recursive: true })
      await writeFile(join(dir, 'SKILL.md'), '---\nname: x\n---\n', 'utf8')
      const items = (await request(host.base, `${ROUTE_PREFIX}/installed`)).body.items
      assert.equal(items[0].removable, false)
      await host.close()
    })

    it('marks the detail view non-removable too, so both agree under a disabled config', async () => {
      // The other direction of the agreement check. Without it, a fix that made
      // the detail endpoint always answer `true` would pass the enabled-config
      // test and quietly offer a button the host refuses.
      const host = await bootPlugin(plugin, { config: { allowUninstall: false } })
      try {
        const dir = join(host.skillsRoot, 'x')
        await mkdir(dir, { recursive: true })
        await writeFile(join(dir, 'SKILL.md'), '---\nname: x\n---\n', 'utf8')

        const items = (await request(host.base, `${ROUTE_PREFIX}/installed`)).body.items
        assert.equal(items[0].removable, false)

        const detail = await request(host.base, `${ROUTE_PREFIX}/installed/detail?key=${items[0].key}`)
        assert.equal(detail.status, 200)
        assert.equal(detail.body.item.removable, false)
      } finally {
        await host.close()
      }
    })
  })

  describe('the classification endpoint', () => {
    let host

    before(async () => {
      // Both providers unreachable, and the vocabulary primed by hand: this block
      // is about what the endpoint *answers*, and leaving either to the network
      // would make the assertions depend on a live registry.
      const { setCategoryVocabulary } = await import('../lib/market/taxonomy.js')
      setCategoryVocabulary([
        { key: 'design-media', name: '设计多媒体', nameEn: 'Design & Media', sortOrder: 50, level: 1 },
        { key: 'content-creation', name: '内容创作', nameEn: 'Content Creation', sortOrder: 20, level: 1 },
      ])
      host = await bootPlugin(plugin, {
        config: {
          clawhubBaseUrl: 'http://127.0.0.1:9',
          skillhubBaseUrl: 'http://127.0.0.1:9',
          timeoutMs: 1_500,
          requestRetries: 0,
        },
      })
    })

    after(async () => {
      await host.close()
      const { resetCategoryVocabulary } = await import('../lib/market/taxonomy.js')
      resetCategoryVocabulary()
    })

    it('serves the vocabulary the registry published, in its own order', async () => {
      const response = await request(host.base, `${ROUTE_PREFIX}/categories`)
      assert.equal(response.status, 200)
      assert.deepEqual(response.body.items.map((entry) => entry.key), ['content-creation', 'design-media'])
      assert.equal(response.body.items[1].name, '设计多媒体')
      assert.equal(response.body.items[1].nameEn, 'Design & Media')
    })

    it('answers with an empty list rather than failing when the vocabulary is unreadable', async () => {
      // Both registries are pointed at a dead port, so the read fails the way an
      // offline machine's would. The endpoint must still answer 200: an empty
      // vocabulary is a true answer, and a request that failed here would take the
      // panel's filter bar down with it.
      const { resetCategoryVocabulary } = await import('../lib/market/taxonomy.js')
      resetCategoryVocabulary()

      const response = await request(host.base, `${ROUTE_PREFIX}/categories`)
      assert.equal(response.status, 200)
      assert.deepEqual(response.body.items, [])

      // Restore the primed vocabulary for any later test in this block.
      const { setCategoryVocabulary } = await import('../lib/market/taxonomy.js')
      setCategoryVocabulary([
        { key: 'design-media', name: '设计多媒体', nameEn: 'Design & Media', sortOrder: 50, level: 1 },
        { key: 'content-creation', name: '内容创作', nameEn: 'Content Creation', sortOrder: 20, level: 1 },
      ])
    })
  })

  describe('the discover endpoint', () => {
    let host

    before(async () => {
      // Both registries point at a port nothing listens on. Discover is the one
      // endpoint that reads three upstream pages at once, so "every source is down"
      // is the state most likely to turn into a hang or a bodyless failure here.
      host = await bootPlugin(plugin, {
        config: {
          clawhubBaseUrl: 'http://127.0.0.1:9',
          skillhubBaseUrl: 'http://127.0.0.1:9',
          timeoutMs: 1_500,
          requestRetries: 0,
        },
      })
    })
    after(async () => { await host.close() })

    it('refuses a write with 405 and an Allow header', async () => {
      const response = await request(host.base, `${ROUTE_PREFIX}/discover`, { method: 'POST' })
      assert.equal(response.status, 405)
      assert.equal(response.body.error.code, 'METHOD_NOT_ALLOWED')
      assert.equal(response.headers.get('allow'), 'GET')
    })

    it('answers with the documented envelope when no registry can be reached', async () => {
      const response = await request(host.base, `${ROUTE_PREFIX}/discover`)
      assert.ok(response.status >= 400, `expected a failure, got ${response.status}`)
      assert.equal(typeof response.body.error.code, 'string')
      assert.equal(typeof response.body.error.message, 'string')
    })

    it('still answers every other endpoint afterwards', async () => {
      assert.equal((await request(host.base, `${ROUTE_PREFIX}/ping`)).status, 200)
    })
  })

  describe('the discover endpoint against a reachable registry', () => {
    let host
    let upstream
    let seen
    let seedRoot

    before(async () => {
      seen = []
      // One local server standing in for both registries: they are addressed by
      // different paths, so the same socket can answer for each. This is the only
      // way to assert the *shape* of what Discover serves without letting a live
      // registry decide whether the test passes.
      upstream = createServer((req, res) => {
        seen.push(req.url)
        const send = (body) => {
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify(body))
        }
        if (req.url.startsWith('/api/v1/categories')) {
          send({ count: 1, items: [{ key: 'knowledge', name: '知识', nameEn: 'Knowledge', sortOrder: 1, active: true }] })
          return
        }
        if (req.url.startsWith('/api/v1/skills')) {
          // ClawHub's list shape. Downloads are deliberately *lower* than the
          // SkillHub entry below while installs are higher, so the assertions can
          // tell which of the two figures the shelf actually ranked by.
          send({
            items: [{
              ownerHandle: 'wishlad85',
              slug: 'dev-workflow',
              displayName: 'Superpowers Dev Workflow',
              summary: 'A workflow for shipping.',
              topics: ['automation'],
              tags: { latest: '1.2.0' },
              stats: { downloads: 29_400, installs: 1_800, stars: 260 },
              createdAt: 1_700_000_000_000,
              updatedAt: 1_790_000_000_000,
              latestVersion: { version: '1.2.0', createdAt: 1_790_000_000_000, changelog: '', license: 'MIT' },
              metadata: null,
            }],
            nextCursor: null,
          })
          return
        }
        // SkillHub's list shape, envelope and all.
        send({
          code: 0,
          message: 'success',
          data: {
            total: 1,
            skills: [{
              slug: 'pdf-toolkit',
              name: 'PDF 工具箱',
              description_zh: '读写 PDF。',
              category: 'knowledge',
              subCategories: [],
              downloads: 50_489,
              installs: 1_490,
              stars: 66,
              version: '2.0.0',
              updated_at: 1_789_000_000_000,
              created_at: 1_700_000_000_000,
              ownerName: 'awspace',
              namespace: { handle: 'awspace', displayName: 'awspace' },
              labels: { requires_api_key: 'false' },
              tags: ['pdf'],
              verified: true,
              source: 'community',
            }],
          },
        })
      })
      await new Promise((resolve) => { upstream.listen(0, '127.0.0.1', resolve) })
      const { port } = upstream.address()

      // Seeded *before* the plugin activates: the local inventory index is built
      // once at activation and rebuilt after an install, so a directory dropped in
      // afterwards would not be in it — and the point of this test is what Discover
      // does with a skill that is already on disk.
      //
      // The provenance sidecar is what makes this the *market* skill: a directory
      // without one is a hand-written skill, it reports itself as `local:<dir>`, and
      // the market layer deliberately does not match it against `skillhub:pdf-toolkit`.
      seedRoot = await mkdtemp(join(tmpdir(), 'smh-discover-skills-'))
      const seeded = join(seedRoot, 'pdf-toolkit')
      await mkdir(seeded, { recursive: true })
      await writeFile(join(seeded, 'SKILL.md'), '---\nname: pdf-toolkit\n---\n', 'utf8')
      await writeFile(join(seeded, '.skills-market-hub.json'), JSON.stringify({
        id: 'skillhub:pdf-toolkit',
        source: 'skillhub',
        slug: 'pdf-toolkit',
        owner: 'awspace',
        version: '2.0.0',
        installedAt: '2026-01-01T00:00:00.000Z',
        files: [{ path: 'SKILL.md', sha256: 'a'.repeat(64) }],
      }), 'utf8')

      host = await bootPlugin(plugin, {
        skillsRoot: seedRoot,
        config: {
          clawhubBaseUrl: `http://127.0.0.1:${port}`,
          skillhubBaseUrl: `http://127.0.0.1:${port}`,
          timeoutMs: 5_000,
          requestRetries: 0,
        },
      })
    })

    after(async () => {
      await host.close()
      await new Promise((resolve) => { upstream.close(resolve) })
      await rm(seedRoot, { recursive: true, force: true })
      const { resetCategoryVocabulary } = await import('../lib/market/taxonomy.js')
      resetCategoryVocabulary()
    })

    it('serves every shelf, already capped and carrying the figure it ranked by', async () => {
      const response = await request(host.base, `${ROUTE_PREFIX}/discover`)

      assert.equal(response.status, 200)
      assert.deepEqual(
        response.body.collections.map((entry) => entry.id),
        ['featured', 'trending', 'official', 'newest', 'installs'],
      )
      for (const collection of response.body.collections) {
        assert.ok(Array.isArray(collection.items))
        assert.ok(collection.items.length <= 10, `${collection.id} must be capped`)
        assert.ok(['downloads', 'installs', 'stars', 'updatedAt'].includes(collection.metric))
      }
      assert.ok('clawhub' in response.body.sources && 'skillhub' in response.body.sources)
    })

    it('merges both registries onto one shelf, ranked by the figure that shelf names', async () => {
      const response = await request(host.base, `${ROUTE_PREFIX}/discover`)
      const sources = new Set(response.body.collections.flatMap((entry) => entry.items.map((item) => item.source)))

      assert.ok(sources.has('clawhub') && sources.has('skillhub'), `only saw ${[...sources].join(', ')}`)

      // Both entries are originals, so both belong — and the order proves the
      // ranking rather than the fixture: by downloads the SkillHub entry leads, by
      // installs the ClawHub one does, and this shelf ranks by installs.
      const installs = response.body.collections.find((entry) => entry.id === 'installs')
      assert.deepEqual(installs.items.map((item) => item.slug), ['dev-workflow', 'pdf-toolkit'])
      assert.deepEqual(installs.items.map((item) => item.stats.installs), [1_800, 1_490])
    })

    it('asks ClawHub for the orderings it publishes, and SkillHub for none', async () => {
      seen.length = 0
      // `refresh=1` because the three upstream pages are cached: without it this
      // request would be answered from disk and the server would see nothing at all,
      // which is the *next* test's subject.
      await request(host.base, `${ROUTE_PREFIX}/discover?refresh=1`)

      const sorts = seen
        .filter((url) => url.startsWith('/api/v1/skills'))
        .map((url) => new URL(url, 'http://x').searchParams.get('sort'))
        .sort()
      assert.deepEqual(sorts, ['newest', 'trending'], 'the two ClawHub indices Discover is built on')

      const skillhubReads = seen.filter((url) => url.startsWith('/api/skills'))
      assert.equal(skillhubReads.length, 1)
      assert.equal(new URL(skillhubReads[0], 'http://x').searchParams.get('sort'), null)
    })

    it('answers a second read from cache, and goes back upstream when asked to', async () => {
      // This page is the panel's landing screen and the sidebar mounts one panel at
      // a time, so the read happens again on every switch away and back. Measured
      // against the live registries it costs ~1.3s warm and ~4.1s cold; a cache hit
      // is the whole difference between that and a file read.
      await request(host.base, `${ROUTE_PREFIX}/discover?refresh=1`)

      seen.length = 0
      const cached = await request(host.base, `${ROUTE_PREFIX}/discover`)
      assert.equal(cached.status, 200)
      assert.deepEqual(seen, [], 'a plain read must not touch the registries')
      assert.equal(cached.body.sources.clawhub.status, 'cached', 'and it says where the answer came from')

      seen.length = 0
      await request(host.base, `${ROUTE_PREFIX}/discover?refresh=1`)
      assert.ok(seen.some((url) => url.startsWith('/api/v1/skills')), 'a forced read goes back upstream')
    })

    it('still refuses a malformed refresh flag rather than ignoring it', async () => {
      const response = await request(host.base, `${ROUTE_PREFIX}/discover?refresh=maybe`)
      assert.equal(response.status, 400)
      assert.equal(response.body.error.code, 'BAD_REQUEST')
    })

    it('annotates a locally present skill on the shelf that carries it', async () => {
      // Read through `?refresh=1` so the shelves and the annotation are produced by
      // the same request: the point is that install state is computed *after* the
      // cache, and a cached shelf must still know what is on this disk.
      const response = await request(host.base, `${ROUTE_PREFIX}/discover?refresh=1`)
      const row = response.body.collections
        .flatMap((entry) => entry.items)
        .find((item) => item.slug === 'pdf-toolkit')

      assert.ok(row !== undefined, 'the seeded skill must reach a shelf')
      assert.equal(row.installState, 'installed', 'a shelf must not offer Install for what is on disk')
      assert.equal(row.installedInfo.dirName, 'pdf-toolkit')
    })
  })

  describe('market reads against an unreachable registry', () => {
    let host

    before(async () => {
      // Point both providers at a port nothing listens on: the point is that an
      // upstream failure arrives as the documented envelope, not as a hang or a
      // bodyless 400.
      host = await bootPlugin(plugin, {
        config: {
          clawhubBaseUrl: 'http://127.0.0.1:9',
          skillhubBaseUrl: 'http://127.0.0.1:9',
          timeoutMs: 1_500,
          requestRetries: 0,
        },
      })
    })
    after(async () => { await host.close() })

    it('answers a list request with a mapped upstream error', async () => {
      const response = await request(host.base, `${ROUTE_PREFIX}/skills?limit=2`)
      assert.ok(response.status >= 400, `expected a failure, got ${response.status}`)
      assert.equal(typeof response.body.error.code, 'string')
      assert.equal(typeof response.body.error.message, 'string')
    })

    it('reports the failed source in the status endpoint', async () => {
      const response = await request(host.base, `${ROUTE_PREFIX}/status`)
      assert.equal(response.status, 200)
      const clawhub = response.body.sources.clawhub
      assert.ok(clawhub.status === 'failed' || clawhub.status === 'unknown', `unexpected status ${clawhub.status}`)
    })

    it('answers a detail request without hanging', async () => {
      const response = await request(host.base, `${ROUTE_PREFIX}/skills/clawhub/demo`)
      assert.ok(response.status >= 400)
    })

    it('answers an install request with a mapped error and writes nothing', async () => {
      const response = await postJson(host.base, `${ROUTE_PREFIX}/install`, { id: 'clawhub:demo' })
      assert.ok(response.status >= 400)
      const entries = await readdir(host.skillsRoot)
      assert.deepEqual(entries, [], 'a failed install must leave the skills root untouched')
    })
  })
})
