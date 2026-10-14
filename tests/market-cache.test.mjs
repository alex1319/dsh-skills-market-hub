/**
 * The fetch layer and the cache, against a local HTTP server.
 *
 * These two modules decide what the panel sees when a registry is slow, lying, or
 * down, which is precisely when a bug here is hardest to attribute. A local server
 * lets the interesting cases be produced on demand: a timeout, a retryable status,
 * a body over the size cap, a corrupt persisted record.
 */

import { after, afterEach, before, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  configureProviderFetch,
  getSourceStatus,
  providerFetch,
  providerFetchJson,
  providerUrl,
  resetProviderFetchConfiguration,
  resetSourceStatus,
  UPSTREAM_ERROR_CODES,
} from '../lib/market/provider-fetch.js'
import { MarketCache, cacheKey, marketCacheDirectory } from '../lib/market/cache.js'
import { DiskCache } from '../lib/market/disk-cache.js'

/** A scriptable upstream: each route names the behaviour it should produce. */
let server
let base
/** Bodies the server has been asked for, so a test can count attempts. */
let requests = []
/** Per-route override: `{ status, body, delayMs, failTimes }`. */
let routes = {}

before(async () => {
  server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    requests.push(url.pathname + url.search)
    const override = routes[url.pathname] ?? {}
    if (override.delayMs !== undefined) {
      await new Promise((resolve) => setTimeout(resolve, override.delayMs))
    }
    // A route can fail a fixed number of times and then succeed, which is the only
    // way to observe a retry actually recovering rather than racing a timer.
    if (override.failTimes !== undefined) {
      override.seen = (override.seen ?? 0) + 1
      if (override.seen <= override.failTimes) {
        res.writeHead(override.status ?? 500, { 'content-type': 'application/json' })
        res.end(JSON.stringify(override.body ?? { error: 'upstream said no' }))
        return
      }
    } else if (override.status !== undefined && override.status >= 400) {
      res.writeHead(override.status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(override.body ?? { error: 'upstream said no' }))
      return
    }
    res.writeHead(200, { 'content-type': override.contentType ?? 'application/json' })
    res.end(override.body ?? JSON.stringify({ ok: true, path: url.pathname }))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  await new Promise((resolve) => server.close(resolve))
})

afterEach(() => {
  requests = []
  routes = {}
  resetSourceStatus()
  resetProviderFetchConfiguration()
})

function configure(overrides = {}) {
  configureProviderFetch({
    clawhubBaseUrl: base,
    skillhubBaseUrl: base,
    timeoutMs: 2_000,
    retries: 0,
    ...overrides,
  })
}

describe('provider fetch', () => {
  it('reads a JSON body from the configured base', async () => {
    configure()
    const { value, status } = await providerFetchJson('clawhub', providerUrl('clawhub', '/data'))
    assert.equal(status, 200)
    assert.deepEqual(value, { ok: true, path: '/data' })
  })

  it('passes query parameters and omits undefined ones', async () => {
    configure()
    await providerFetchJson('clawhub', providerUrl('clawhub', '/q'), {
      query: { a: '1', b: undefined, c: 3 },
    })
    assert.equal(requests[0], '/q?a=1&c=3')
  })

  it('retries a 500 and succeeds once the upstream recovers', async () => {
    configure({ retries: 2 })
    routes['/flaky'] = { status: 500, failTimes: 1 }

    const response = await providerFetch('clawhub', providerUrl('clawhub', '/flaky'))
    assert.equal(response.status, 200)
    assert.equal(requests.length, 2, 'one failure plus one successful retry')
  })

  it('gives up after the configured budget and reports the status', async () => {
    configure({ retries: 1 })
    routes['/always-500'] = { status: 500 }

    const response = await providerFetch('clawhub', providerUrl('clawhub', '/always-500'))
    assert.equal(response.status, 500, 'the caller decides what a failed read means')
    assert.equal(requests.length, 2, 'the initial attempt plus one retry')
  })

  it('does not retry a 404, because trying again cannot help', async () => {
    configure({ retries: 3 })
    routes['/missing'] = { status: 404 }
    const response = await providerFetch('clawhub', providerUrl('clawhub', '/missing'))
    assert.equal(response.status, 404)
    assert.equal(requests.length, 1)
  })

  it('maps a timeout onto its own code', async () => {
    configure({ timeoutMs: 60, retries: 0 })
    routes['/slow'] = { delayMs: 400 }

    await assert.rejects(
      providerFetch('clawhub', providerUrl('clawhub', '/slow')),
      (error) => {
        assert.equal(error.code, UPSTREAM_ERROR_CODES.timeout)
        return true
      },
    )
  })

  it('refuses a body over the size cap while streaming it', async () => {
    configure()
    routes['/huge'] = { body: 'x'.repeat(4_000), contentType: 'text/plain' }

    await assert.rejects(
      providerFetch('clawhub', providerUrl('clawhub', '/huge'), { maxBytes: 1_000 }),
      (error) => {
        assert.equal(error.code, UPSTREAM_ERROR_CODES.badResponse)
        return true
      },
    )
  })

  it('reports a non-JSON body as a bad response, never as an empty result', async () => {
    configure()
    routes['/html'] = { body: '<html>gateway</html>', contentType: 'text/html' }

    await assert.rejects(
      providerFetchJson('clawhub', providerUrl('clawhub', '/html')),
      (error) => {
        assert.equal(error.code, UPSTREAM_ERROR_CODES.badResponse)
        return true
      },
    )
  })

  it('records per-source health', async () => {
    configure()
    routes['/broken'] = { status: 503 }
    await providerFetch('skillhub', providerUrl('skillhub', '/broken')).catch(() => undefined)
    await providerFetch('clawhub', providerUrl('clawhub', '/data')).catch(() => undefined)

    const status = getSourceStatus()
    assert.equal(status.clawhub.status, 'ok')
    assert.notEqual(status.skillhub.status, 'ok')
  })

  it('reports a source that has never been read as unknown', () => {
    const status = getSourceStatus()
    assert.equal(status.clawhub.status, 'unknown')
    assert.equal(status.skillhub.status, 'unknown')
  })

  it('propagates a caller abort instead of retrying it', async () => {
    configure({ timeoutMs: 5_000, retries: 2 })
    routes['/slow'] = { delayMs: 300 }
    const controller = new AbortController()
    setTimeout(() => { controller.abort() }, 30)

    await assert.rejects(providerFetch('clawhub', providerUrl('clawhub', '/slow'), { signal: controller.signal }))
    assert.equal(requests.length, 1, 'an aborted request must not be retried')
  })
})

describe('disk cache', () => {
  let dir

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'skills-market-hub-cache-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('round-trips a record, preserving the moment upstream was read', async () => {
    const store = new DiskCache({ directory: dir })
    const fetchedAt = Date.now() - 60_000

    assert.equal(await store.write('k', { hello: 'world' }, 3_600_000, fetchedAt), true)
    const record = await store.read('k')

    assert.deepEqual(record.value, { hello: 'world' })
    assert.equal(record.fetchedAt, fetchedAt, 'the read time must survive, or the panel lies about freshness')
    assert.equal(record.expired, false)
  })

  it('flags an expired record rather than deleting it', async () => {
    const store = new DiskCache({ directory: dir })
    await store.write('k', 1, -1)
    const record = await store.read('k')
    assert.equal(record.expired, true)
    assert.equal(record.value, 1, 'a stale record is the fallback when upstream is down')
  })

  it('reports an absent record as null', async () => {
    const store = new DiskCache({ directory: dir })
    assert.equal(await store.read('nothing'), null)
  })

  it('ignores a record that belongs to a different key', async () => {
    const store = new DiskCache({ directory: dir })
    await store.write('a', 1, 1_000)
    // Rewrite the file under another key's name: a rename or a hash collision must
    // not be able to hand back another key's value.
    const [file] = await readdir(dir)
    const raw = JSON.parse(await (await import('node:fs/promises')).readFile(join(dir, file), 'utf8'))
    raw.key = 'b'
    await writeFile(join(dir, file), JSON.stringify(raw), 'utf8')
    assert.equal(await store.read('b'), null)
  })

  it('self-heals a corrupt record instead of failing every read', async () => {
    const store = new DiskCache({ directory: dir })
    await store.write('k', 1, 1_000)
    const [file] = await readdir(dir)
    await writeFile(join(dir, file), '{ this is not json', 'utf8')

    assert.equal(await store.read('k'), null)
    const remaining = await readdir(dir)
    assert.ok(!remaining.includes(file), 'the unreadable record is dropped so the next write can replace it')
  })

  it('refuses to store a record over the per-record cap', async () => {
    const store = new DiskCache({ directory: dir, limits: { maxRecordBytes: 100 } })
    assert.equal(await store.write('k', 'x'.repeat(500), 1_000), false)
    assert.equal(await store.read('k'), null)
  })

  it('evicts the oldest records past the count cap', async () => {
    const store = new DiskCache({ directory: dir, limits: { maxRecords: 2 } })
    for (const key of ['a', 'b', 'c', 'd']) {
      await store.write(key, key, 3_600_000)
      // The eviction order is by mtime, and a same-millisecond write has no
      // ordering; a small delay makes the test about eviction, not about clocks.
      await new Promise((resolve) => setTimeout(resolve, 5))
    }

    const present = []
    for (const key of ['a', 'b', 'c', 'd']) {
      if (await store.read(key) !== null) present.push(key)
    }
    assert.ok(present.length <= 2, `expected at most 2 records, found ${present.length}: ${present.join(',')}`)
    assert.ok(present.includes('d'), 'the newest record must survive')
  })

  it('clears every record', async () => {
    const store = new DiskCache({ directory: dir })
    await store.write('a', 1, 1_000)
    await store.write('b', 2, 1_000)
    await store.clear()
    assert.equal(await store.read('a'), null)
  })

  it('removes a record on request', async () => {
    const store = new DiskCache({ directory: dir })
    await store.write('a', 1, 1_000)
    await store.remove('a')
    assert.equal(await store.read('a'), null)
  })
})

describe('market cache', () => {
  let dir

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'skills-market-hub-cache-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('serves a second read from the record, without restamping it', async () => {
    let loads = 0
    const cache = new MarketCache({ directory: dir, ttlMs: 3_600_000 })
    const load = async () => { loads += 1; return { page: loads } }

    const first = await cache.readThrough({ key: 'k', source: 'clawhub', load })
    const second = await cache.readThrough({ key: 'k', source: 'clawhub', load })

    assert.equal(first.fromCache, false)
    assert.equal(second.fromCache, true)
    assert.equal(loads, 1, 'a fresh record must not go upstream')
    assert.deepEqual(second.value, first.value)
    // The age the panel prints is the age of the *read*, not of the hit.
    assert.equal(second.fetchedAt, first.fetchedAt)
  })

  it('goes upstream on an expired record', async () => {
    let loads = 0
    const cache = new MarketCache({ directory: dir, ttlMs: 1_000 })
    const load = async () => { loads += 1; return loads }

    await cache.readThrough({ key: 'k', source: 'clawhub', load, force: true })
    // A record written with an already-past expiry stands in for an aged one.
    await cache.clear()
    const store = new DiskCache({ directory: dir })
    await store.write('k', 1, -1)

    const result = await cache.readThrough({ key: 'k', source: 'clawhub', load })
    assert.equal(result.fromCache, false)
    assert.equal(loads, 2)
  })

  it('falls back to a stale record when upstream fails', async () => {
    const cache = new MarketCache({ directory: dir, ttlMs: 1_000 })
    const store = new DiskCache({ directory: dir })
    const fetchedAt = Date.now() - 60_000
    await store.write('k', { page: 'stale' }, -1, fetchedAt)

    const result = await cache.readThrough({
      key: 'k',
      source: 'clawhub',
      load: async () => { throw new Error('upstream is down') },
    })

    assert.equal(result.fromCache, true, 'a two-day-old page beats an error page')
    assert.deepEqual(result.value, { page: 'stale' })
  })

  it('refuses the stale fallback when the caller forbids it', async () => {
    const cache = new MarketCache({ directory: dir, ttlMs: 1_000 })
    const store = new DiskCache({ directory: dir })
    await store.write('k', 'stale', -1)

    await assert.rejects(
      cache.readThrough({
        key: 'k',
        source: 'clawhub',
        allowStale: false,
        load: async () => { throw new Error('upstream is down') },
      }),
      /upstream is down/,
    )
  })

  it('never answers a forced read from the record it was asked to bypass', async () => {
    let loads = 0
    const cache = new MarketCache({ directory: dir, ttlMs: 3_600_000 })
    const load = async () => { loads += 1; return loads }

    await cache.readThrough({ key: 'k', source: 'clawhub', load })
    const forced = await cache.readThrough({ key: 'k', source: 'clawhub', load, force: true })

    assert.equal(forced.fromCache, false)
    assert.equal(loads, 2)
  })

  it('does not fall back to stale data on a forced read that fails', async () => {
    const cache = new MarketCache({ directory: dir, ttlMs: 3_600_000 })
    await cache.readThrough({ key: 'k', source: 'clawhub', load: async () => 'fresh' })

    // An install decision uses a forced read: answering it from an hour-old
    // record is exactly what it was asked not to do.
    await assert.rejects(
      cache.readThrough({
        key: 'k',
        source: 'clawhub',
        force: true,
        allowStale: false,
        load: async () => { throw new Error('registry withdrew it') },
      }),
      /registry withdrew it/,
    )
  })

  it('counts what it did', async () => {
    const cache = new MarketCache({ directory: dir, ttlMs: 3_600_000 })
    const load = async () => 'v'

    await cache.readThrough({ key: 'k', source: 'clawhub', load })
    await cache.readThrough({ key: 'k', source: 'clawhub', load })
    await cache.readThrough({ key: 'k', source: 'clawhub', load, force: true })

    const stats = cache.stats()
    assert.equal(stats.hits, 1)
    assert.equal(stats.misses, 2)
    assert.equal(stats.upstreamRequests, 2)
    assert.equal(stats.forcedRefreshes, 1)
    assert.equal(stats.writes, 2)
  })

  it('survives an unwritable store without failing the read', async () => {
    // A path that cannot be a directory, so every write fails.
    const cache = new MarketCache({ directory: join(dir, 'file-not-a-dir'), ttlMs: 1_000 })
    await writeFile(join(dir, 'file-not-a-dir'), 'x', 'utf8')

    const result = await cache.readThrough({ key: 'k', source: 'clawhub', load: async () => 'served anyway' })
    assert.equal(result.value, 'served anyway', 'a broken cache must not break the marketplace')
    assert.equal(result.fromCache, false)
  })
})

describe('cache keys', () => {
  it('distinguishes values that a naive join would collide', () => {
    // `source:slug:owner` joined with colons collides for `a:b` + `c` and `a` + `b:c`.
    const one = cacheKey('detail', ['clawhub', 'a:b', 'c'])
    const two = cacheKey('detail', ['clawhub', 'a', 'b:c'])
    assert.notEqual(one, two)
  })

  it('treats an absent component as its own value', () => {
    assert.notEqual(cacheKey('detail', ['clawhub', 'demo']), cacheKey('detail', ['clawhub', 'demo', undefined]))
    assert.equal(cacheKey('detail', ['clawhub', 'demo', undefined]), cacheKey('detail', ['clawhub', 'demo', undefined]))
  })

  it('namespaces by kind', () => {
    assert.notEqual(cacheKey('detail', ['x']), cacheKey('file', ['x']))
  })

  it('puts the store under the harness home', () => {
    const path = marketCacheDirectory('C:/home/.dsh')
    assert.ok(path.includes('cache'))
    assert.ok(path.includes('skills-market-hub'))
  })
})
