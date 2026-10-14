/**
 * Aggregation rules: install-state annotation, limits, filters and paging.
 *
 * These are the decisions a reader actually experiences — whether the install
 * button is live, whether the list they scrolled repeats itself, whether a search
 * finds a skill whose description is wrapped in markdown emphasis.
 */

import { afterEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  annotateInstallState,
  annotatePage,
  applyFileLimits,
  filterSkills,
  listMarketCategories,
  paginate,
  parseOffsetCursor,
  resetInstalledLookup,
  setInstalledLookup,
} from '../lib/market/market-service.js'
import { resetCategoryVocabulary, setCategoryVocabulary, CATEGORY_VOCABULARY_PATH } from '../lib/market/taxonomy.js'
import { configureProviderFetch, resetProviderFetchConfiguration } from '../lib/market/provider-fetch.js'
import { createServer } from 'node:http'
import { MARKET_LIMITS, skillId } from '../lib/market/types.js'

/** A minimal upstream entry; only the fields the rules read. */
function skill(overrides = {}) {
  const source = overrides.source ?? 'clawhub'
  const slug = overrides.slug ?? 'demo'
  return {
    id: skillId(source, slug),
    source,
    slug,
    name: overrides.name ?? slug,
    summary: overrides.summary ?? '',
    author: { handle: overrides.owner ?? 'author' },
    stats: { downloads: 0 },
    tags: overrides.tags ?? [],
    securityStatus: overrides.securityStatus ?? 'unknown',
    installState: 'installable',
  }
}

/** A lookup reporting exactly one installed skill. */
function lookupWith(id, info) {
  return {
    has: (candidate) => candidate === id,
    info: (candidate) => (candidate === id ? info : undefined),
  }
}

afterEach(() => { resetInstalledLookup() })

describe('install-state annotation', () => {
  it('reports a fresh entry as installable', () => {
    assert.deepEqual(annotateInstallState(skill()), { installState: 'installable' })
  })

  it('reports a locally present skill as installed, with its location', () => {
    setInstalledLookup(lookupWith('clawhub:weather', { dirName: 'weather', version: '2.1.0', installedAt: '2026-01-01T00:00:00.000Z' }))

    const state = annotateInstallState(skill({ slug: 'weather' }))

    assert.equal(state.installState, 'installed')
    assert.equal(state.installedInfo.dirName, 'weather')
    assert.equal(state.installedInfo.version, '2.1.0')
    assert.equal(state.installedInfo.installedAt, '2026-01-01T00:00:00.000Z')
  })

  it('still reports installed when the sidecar recorded no version', () => {
    setInstalledLookup(lookupWith('clawhub:weather', { dirName: 'weather' }))
    const state = annotateInstallState(skill({ slug: 'weather' }))
    assert.equal(state.installState, 'installed')
    assert.equal(state.installedInfo.dirName, 'weather')
    assert.equal(state.installedInfo.version, undefined)
  })

  it('marks a slug that cannot be a directory name as not installable', () => {
    for (const slug of ['..', 'a/b', '.hidden', 'UPPER CASE', 'trailing ']) {
      const state = annotateInstallState(skill({ slug }))
      assert.equal(state.installState, 'not-installable', `slug ${JSON.stringify(slug)}`)
      assert.equal(state.notInstallableReason, 'invalid-name')
    }
  })

  it('does not consult the lookup for an unaddressable slug', () => {
    let asked = false
    setInstalledLookup({ has: () => { asked = true; return false }, info: () => undefined })
    annotateInstallState(skill({ slug: '..' }))
    assert.equal(asked, false, 'an unaddressable slug is decided before the lookup')
  })

  it('annotates a whole page without mutating the input', () => {
    setInstalledLookup(lookupWith('clawhub:b', { dirName: 'b' }))
    const page = [skill({ slug: 'a' }), skill({ slug: 'b' })]
    const before = JSON.stringify(page)

    const annotated = annotatePage(page)

    assert.deepEqual(annotated.map((entry) => entry.installState), ['installable', 'installed'])
    assert.equal(JSON.stringify(page), before)
  })
})

describe('file limits', () => {
  const file = (path, size) => ({ path, size, language: 'text', tooBig: size > MARKET_LIMITS.maxFileSize })

  it('rejects a skill with no SKILL.md', () => {
    const state = applyFileLimits(skill(), [file('README.md', 10)])
    assert.equal(state.installState, 'not-installable')
    assert.equal(state.notInstallableReason, 'empty-file-list')
  })

  it('rejects an empty inventory', () => {
    const state = applyFileLimits(skill(), [])
    assert.equal(state.notInstallableReason, 'empty-file-list')
  })

  it('accepts a SKILL.md written in any case', () => {
    const state = applyFileLimits(skill(), [file('Skill.MD', 10)])
    assert.equal(state.installState, 'installable')
  })

  it('rejects too many files', () => {
    const files = [file('SKILL.md', 10)]
    for (let index = 0; index < MARKET_LIMITS.maxFileCount; index += 1) files.push(file(`f${index}.md`, 1))
    const state = applyFileLimits(skill(), files)
    assert.equal(state.notInstallableReason, 'too-many-files')
  })

  it('rejects a single oversized file', () => {
    const state = applyFileLimits(skill(), [file('SKILL.md', 10), file('big.bin', MARKET_LIMITS.maxFileSize + 1)])
    assert.equal(state.notInstallableReason, 'file-too-large')
  })

  it('rejects a total size over the cap', () => {
    const chunk = Math.floor(MARKET_LIMITS.maxTotalSize / 3) + 1
    const state = applyFileLimits(skill(), [file('SKILL.md', chunk), file('a.bin', chunk), file('b.bin', chunk)])
    assert.equal(state.installState, 'not-installable')
  })

  it('leaves an already-installed entry alone', () => {
    const installedSkill = { ...skill(), installState: 'installed' }
    assert.equal(applyFileLimits(installedSkill, []).installState, 'installed')
  })
})

describe('filters', () => {
  const page = [
    skill({ slug: 'weather', name: 'Weather', source: 'clawhub', securityStatus: 'verified', summary: 'Fetch forecasts.' }),
    skill({ slug: 'pdf', name: 'PDF Toolkit', source: 'clawhub', securityStatus: 'flagged', summary: 'Extract **tables** from PDFs.' }),
    skill({ slug: 'anti-fraud', name: '反欺诈', source: 'skillhub', securityStatus: 'benign', summary: '识别诈骗话术' }),
  ]
    .map((entry) => ({ ...entry, ...annotateInstallState(entry) }))

  const base = { source: 'all', security: 'all', installed: 'all', limit: 10 }

  it('returns everything with no filters', () => {
    assert.equal(filterSkills(page, base).length, 3)
  })

  it('filters by source', () => {
    assert.deepEqual(filterSkills(page, { ...base, source: 'skillhub' }).map((entry) => entry.slug), ['anti-fraud'])
  })

  it('filters by security verdict, including flagged', () => {
    assert.deepEqual(filterSkills(page, { ...base, security: 'flagged' }).map((entry) => entry.slug), ['pdf'])
    assert.deepEqual(filterSkills(page, { ...base, security: 'verified' }).map((entry) => entry.slug), ['weather'])
  })

  it('matches a search term that markdown emphasis would otherwise hide', () => {
    // "tables" is written as `**tables**` in the summary; a reader searching for
    // the word they can see must find it.
    assert.deepEqual(filterSkills(page, { ...base, q: 'tables' }).map((entry) => entry.slug), ['pdf'])
  })

  it('matches CJK text', () => {
    assert.deepEqual(filterSkills(page, { ...base, q: '诈骗' }).map((entry) => entry.slug), ['anti-fraud'])
  })

  it('treats a multi-word query as an AND', () => {
    assert.equal(filterSkills(page, { ...base, q: 'pdf toolkit' }).length, 1)
    assert.equal(filterSkills(page, { ...base, q: 'pdf weather' }).length, 0)
  })

  it('matches the author handle', () => {
    const withAuthor = [{ ...skill({ slug: 'x', owner: 'awspace' }), installState: 'installable' }]
    assert.equal(filterSkills(withAuthor, { ...base, q: 'awspace' }).length, 1)
  })

  it('is case- and width-insensitive', () => {
    assert.equal(filterSkills(page, { ...base, q: 'WEATHER' }).length, 1)
    assert.equal(filterSkills(page, { ...base, q: 'ｐｄｆ' }).length, 1, 'full-width input folds to ASCII')
  })

  it('filters by install state', () => {
    setInstalledLookup(lookupWith('clawhub:weather', { dirName: 'weather' }))
    const annotated = annotatePage(page)
    assert.deepEqual(
      filterSkills(annotated, { ...base, installed: 'installed' }).map((entry) => entry.slug),
      ['weather'],
    )
    assert.equal(filterSkills(annotated, { ...base, installed: 'installable' }).length, 2)
  })
})

describe('paging', () => {
  const items = Array.from({ length: 7 }, (_, index) => skill({ slug: `s${index}` }))

  it('returns the first page with a cursor to the rest', () => {
    const page = paginate(items, 3, undefined)
    assert.deepEqual(page.items.map((entry) => entry.slug), ['s0', 's1', 's2'])
    assert.equal(page.nextCursor, 'catalog:3')
    assert.equal(page.total, 7)
  })

  it('walks the whole list without repeating or skipping', () => {
    const seen = []
    let cursor
    for (let guard = 0; guard < 10; guard += 1) {
      const page = paginate(items, 3, cursor)
      seen.push(...page.items.map((entry) => entry.slug))
      if (page.nextCursor === null) break
      cursor = page.nextCursor
    }
    assert.deepEqual(seen, items.map((entry) => entry.slug))
  })

  it('reports no further page on the last one', () => {
    assert.equal(paginate(items, 3, 'catalog:6').nextCursor, null)
  })

  it('returns an empty page rather than an error past the end', () => {
    const page = paginate(items, 3, 'catalog:99')
    assert.deepEqual(page.items, [])
    assert.equal(page.nextCursor, null)
  })

  it('reads an absent cursor as the first page', () => {
    assert.equal(parseOffsetCursor(undefined), 0)
    assert.equal(parseOffsetCursor(''), 0)
  })

  it('refuses to interpret a cursor it did not produce', () => {
    // A provider cursor spliced into a local page must not silently become page 0
    // of a *different* paging scheme; it restarts this view, which the caller
    // asked for by sending a value it never received.
    assert.equal(parseOffsetCursor('eyJjbGF3aHViIjoiYzEifQ'), 0)
    assert.equal(parseOffsetCursor('catalog:abc'), 0)
    assert.equal(parseOffsetCursor('catalog:-1'), 0)
    assert.equal(parseOffsetCursor('catalog:3'), 3)
  })
})

describe('the classification endpoint', () => {
  afterEach(() => { resetCategoryVocabulary() })

  it('serves the vocabulary in the registry\u2019s own order', async () => {
    // Primed rather than fetched: this test is about what the endpoint answers,
    // and the fetch behind it is covered by the live suite.
    setCategoryVocabulary([
      { key: 'later', name: '后一个', nameEn: 'Later', sortOrder: 20, level: 1 },
      { key: 'first', name: '前一个', nameEn: 'First', sortOrder: 10, level: 1 },
    ])

    const { items, status } = await listMarketCategories()
    assert.deepEqual(items.map((entry) => entry.key), ['first', 'later'])
    assert.equal(status.status, 'ok')
    assert.equal(status.fromCache, true)
  })

  it('answers with an empty list rather than failing when nothing is known', async () => {
    // The registry is pointed at a port nothing listens on, so the read fails the
    // way an offline machine's would — and the endpoint must still answer. Without
    // this, the assertion would depend on what the live registry happens to return.
    configureProviderFetch({ skillhubBaseUrl: 'http://127.0.0.1:9', retries: 0, timeoutMs: 500 })
    try {
      const { items, status } = await listMarketCategories()
      assert.deepEqual(items, [])
      assert.equal(status.fromCache, false)
    } finally {
      resetProviderFetchConfiguration()
    }
  })

  it('fetches the vocabulary from the route that actually serves it', async () => {
    // The bug this pins: the version-less `/api/categories` answers 405 with an
    // empty body, which is indistinguishable from "the registry publishes none" —
    // so a wrong path here degrades silently instead of failing. The live suite
    // caught it; this test makes it catchable offline, by pointing the source at a
    // local server and asserting both the request path and the parsed result.
    const requests = []
    const server = createServer((req, res) => {
      requests.push(req.url)
      if (req.url !== CATEGORY_VOCABULARY_PATH) {
        // Exactly what the real registry does for the wrong spelling.
        res.writeHead(405).end()
        return
      }
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ count: 1, items: [{ key: 'design-media', name: '设计多媒体', nameEn: 'Design & Media', sortOrder: 50, active: true }] }))
    })
    await new Promise((resolve) => { server.listen(0, '127.0.0.1', resolve) })
    const { port } = server.address()
    configureProviderFetch({ skillhubBaseUrl: `http://127.0.0.1:${port}`, retries: 0, timeoutMs: 5_000 })

    try {
      const { items } = await listMarketCategories()
      assert.deepEqual(requests, [CATEGORY_VOCABULARY_PATH], 'the vocabulary must be read from its own route')
      assert.deepEqual(items.map((entry) => entry.key), ['design-media'])
      assert.equal(items[0].name, '设计多媒体')
      assert.equal(items[0].nameEn, 'Design & Media')
    } finally {
      resetProviderFetchConfiguration()
      await new Promise((resolve) => { server.close(resolve) })
    }
  })
})
