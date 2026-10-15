/**
 * The Discover page: five rankings, and the three upstream pages behind them.
 *
 * Two properties are worth testing here rather than in a browser, because a
 * browser cannot show either of them:
 *
 *  - **Which shelf a skill lands on, and why.** "精选" is a formula and 官方 is a
 *    filter; both are decisions about published numbers, and a screenshot shows
 *    the outcome without showing the rule. The tests below pin the rule.
 *  - **What an unhealthy registry costs.** Discover reads three upstream pages, so
 *    "one registry is down" is a state the page must survive, and the difference
 *    between "a shelf is short" and "the page is broken" is exactly where a
 *    partial outage would otherwise turn into a blank screen.
 *
 * The pools are built here rather than loaded from the captured fixtures: a
 * fixture is a photograph of a registry at one moment, and a ranking test that
 * asserted against one would fail the next time the fixtures were re-captured —
 * for a reason that has nothing to do with the ranking. What the fixtures *are*
 * used for is normalization, which `providers.test.mjs` covers.
 */

import { afterEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildDiscoverCollections,
  DISCOVER_COLLECTION_SIZE,
  FEATURED_MIN_AXES,
} from '../lib/market/discover.js'
import {
  listDiscoverSkills,
  resetInstalledLookup,
  setInstalledLookup,
  setProviders,
} from '../lib/market/market-service.js'
import { resetCategoryVocabulary, setCategoryVocabulary } from '../lib/market/taxonomy.js'
import { DISCOVER_COLLECTION_IDS, skillId } from '../lib/market/types.js'

/**
 * One normalized entry, with only the fields the rankings read.
 *
 * `installs` and `stars` are omitted unless asked for, because that is the state
 * the real normalizers produce: ClawHub's list endpoint publishes all three, and
 * a registry that publishes none must not have its silence read as a zero.
 */
function skill(source, slug, overrides = {}) {
  const { downloads = 0, installs, stars, ...rest } = overrides
  return {
    id: skillId(source, slug),
    source,
    slug,
    name: rest.name ?? slug,
    summary: rest.summary ?? '',
    author: { handle: rest.owner ?? 'author' },
    stats: {
      downloads,
      ...(installs === undefined ? {} : { installs }),
      ...(stars === undefined ? {} : { stars }),
    },
    tags: [],
    securityStatus: 'unknown',
    installState: 'installable',
    ...(rest.updatedAt === undefined ? {} : { updatedAt: rest.updatedAt }),
    ...(rest.verified === undefined ? {} : { verified: rest.verified }),
    ...(rest.upstream === undefined ? {} : { upstream: rest.upstream }),
  }
}

const empty = { trending: [], newest: [], skillhub: [] }

/** One shelf by id, or a failed lookup rather than `undefined` in an assertion. */
function shelf(collections, id) {
  const found = collections.find((entry) => entry.id === id)
  assert.ok(found !== undefined, `no shelf named ${id}`)
  return found
}

const slugs = (collection) => collection.items.map((entry) => entry.slug)

describe('discover shelves', () => {
  it('always returns every shelf, in reading order, even with nothing to fill them', () => {
    const collections = buildDiscoverCollections(empty)

    assert.deepEqual(collections.map((entry) => entry.id), [...DISCOVER_COLLECTION_IDS])
    for (const collection of collections) {
      assert.deepEqual(collection.items, [], `${collection.id} must be empty, not absent`)
      assert.equal(typeof collection.metric, 'string', `${collection.id} must name the figure it ranks by`)
    }
  })

  it('caps every shelf, so one registry cannot fill the page', () => {
    const many = Array.from({ length: 40 }, (_, index) => skill('clawhub', `s${index}`, { downloads: 40 - index }))

    const collections = buildDiscoverCollections({ ...empty, trending: many })

    for (const collection of collections) {
      assert.ok(
        collection.items.length <= DISCOVER_COLLECTION_SIZE,
        `${collection.id} returned ${collection.items.length} rows`,
      )
    }
  })

  it('lists a skill once when two upstream pages both carry it', () => {
    // The real overlap: ClawHub's trending and newest indices are different pages
    // over the same catalogue, and a skill can be on both.
    const shared = skill('clawhub', 'shared', { downloads: 10, installs: 5, stars: 2 })
    const collections = buildDiscoverCollections({
      trending: [shared],
      newest: [shared],
      skillhub: [],
    })

    for (const collection of collections) {
      assert.equal(collection.items.length, collection.items.length === 0 ? 0 : 1, `${collection.id}`)
      assert.equal(slugs(collection).filter((slug) => slug === 'shared').length, collection.items.length === 0 ? 0 : 1)
    }
  })

  it('folds a SkillHub mirror into its ClawHub original instead of listing both', () => {
    const original = skill('clawhub', 'pdf', { owner: 'awspace', downloads: 500, installs: 100 })
    const mirror = skill('skillhub', 'pdf-mirror', {
      owner: 'awspace',
      downloads: 400,
      installs: 90,
      upstream: { source: 'clawhub', slug: 'pdf', owner: 'awspace' },
    })

    const collections = buildDiscoverCollections({ trending: [original], newest: [], skillhub: [mirror] })

    assert.ok(
      collections.every((collection) => !slugs(collection).includes('pdf-mirror')),
      'the copy must never be a row of its own',
    )
    assert.ok(
      shelf(collections, 'installs').items.some((entry) => entry.id === 'clawhub:pdf'),
      'the original survives, and is the entry an install would take',
    )
  })
})

describe('the trending shelf', () => {
  it('keeps ClawHub\u2019s own index order and alternates SkillHub in by installs', () => {
    const collections = buildDiscoverCollections({
      trending: [skill('clawhub', 'a'), skill('clawhub', 'b'), skill('clawhub', 'c')],
      newest: [],
      // Deliberately given in the wrong order: SkillHub publishes no ranking the
      // plugin can name, so this shelf orders its entries itself.
      skillhub: [skill('skillhub', 'x', { installs: 5 }), skill('skillhub', 'y', { installs: 50 })],
    })

    assert.deepEqual(slugs(shelf(collections, 'trending')), ['a', 'y', 'b', 'x', 'c'])
  })

  it('ranks by installs rather than downloads, because that is the figure it prints', () => {
    const collections = buildDiscoverCollections({
      trending: [],
      newest: [],
      skillhub: [
        skill('skillhub', 'loud', { downloads: 9999, installs: 1 }),
        skill('skillhub', 'used', { downloads: 10, installs: 900 }),
      ],
    })

    assert.equal(shelf(collections, 'trending').metric, 'installs')
    assert.deepEqual(slugs(shelf(collections, 'trending')), ['used', 'loud'])
  })
})

describe('the newest shelf', () => {
  it('keeps ClawHub\u2019s newest index order and alternates SkillHub in by recency', () => {
    const collections = buildDiscoverCollections({
      trending: [],
      newest: [skill('clawhub', 'a', { updatedAt: 300 }), skill('clawhub', 'b', { updatedAt: 100 })],
      skillhub: [
        skill('skillhub', 'old', { updatedAt: 1 }),
        skill('skillhub', 'fresh', { updatedAt: 900 }),
      ],
    })

    assert.equal(shelf(collections, 'newest').metric, 'updatedAt')
    // ClawHub's page arrives already ordered, so it is taken as given; only
    // SkillHub's side is sorted here.
    assert.deepEqual(slugs(shelf(collections, 'newest')), ['a', 'fresh', 'b', 'old'])
  })
})

describe('the installs shelf', () => {
  it('ranks both registries together by the count the reader is shown', () => {
    const collections = buildDiscoverCollections({
      trending: [],
      newest: [],
      skillhub: [
        skill('skillhub', 'small', { installs: 2 }),
        skill('skillhub', 'big', { installs: 800 }),
      ],
    })

    assert.deepEqual(slugs(shelf(collections, 'installs')), ['big', 'small'])
  })

  it('sorts a registry that published no install count last rather than treating it as zero', () => {
    // ClawHub publishes installs, SkillHub usually does not. A missing figure is
    // "the registry did not say", and rendering it as 0 would let silence outrank
    // a skill with a genuinely small number.
    const collections = buildDiscoverCollections({
      trending: [],
      newest: [],
      skillhub: [skill('skillhub', 'silent'), skill('skillhub', 'known', { installs: 1 })],
    })

    assert.deepEqual(slugs(shelf(collections, 'installs')), ['known', 'silent'])
  })
})

describe('the official shelf', () => {
  it('carries only what a registry itself verified', () => {
    const collections = buildDiscoverCollections({
      trending: [skill('clawhub', 'plain', { downloads: 900 })],
      newest: [],
      skillhub: [
        skill('skillhub', 'vouched', { verified: true, downloads: 10 }),
        skill('skillhub', 'refused', { verified: false, downloads: 800 }),
      ],
    })

    assert.deepEqual(slugs(shelf(collections, 'official')), ['vouched'])
  })

  it('is empty rather than padded when no registry flagged anything', () => {
    // The honest failure mode: both registries publish the flag rarely, so this
    // shelf is often short. Filling it with near-matches would be inventing a
    // verification the registry never gave.
    const collections = buildDiscoverCollections({
      trending: [skill('clawhub', 'popular', { downloads: 100_000, installs: 9_000, stars: 500 })],
      newest: [],
      skillhub: [skill('skillhub', 'also-popular', { downloads: 90_000 })],
    })

    assert.deepEqual(shelf(collections, 'official').items, [])
  })
})

describe('the featured shelf', () => {
  it('needs more than one reading, so leading a single axis is not enough', () => {
    const collections = buildDiscoverCollections({
      trending: [
        // First by downloads, and by nothing else: the registry published no
        // install or star count for it.
        skill('clawhub', 'one-trick', { downloads: 100_000 }),
        // Strong on all three.
        skill('clawhub', 'broad', { downloads: 50_000, installs: 4_000, stars: 300 }),
      ],
      newest: [],
      skillhub: [],
    })

    assert.ok(FEATURED_MIN_AXES >= 2, 'a single axis must never be enough')
    assert.deepEqual(slugs(shelf(collections, 'featured')), ['broad'])
  })

  it('puts the skill that placed in more readings first', () => {
    const collections = buildDiscoverCollections({
      trending: [
        skill('clawhub', 'two-axes', { downloads: 100, stars: 5 }),
        skill('clawhub', 'three-axes', { downloads: 90, installs: 4, stars: 3 }),
      ],
      newest: [],
      skillhub: [],
    })

    assert.deepEqual(slugs(shelf(collections, 'featured')), ['three-axes', 'two-axes'])
  })

  it('is deterministic, so two readers of the same page see the same page', () => {
    const pools = {
      trending: [
        skill('clawhub', 'a', { downloads: 10, installs: 10, stars: 10 }),
        skill('clawhub', 'b', { downloads: 10, installs: 10, stars: 10 }),
      ],
      newest: [],
      skillhub: [skill('skillhub', 'c', { downloads: 10, installs: 10, stars: 10 })],
    }

    const first = buildDiscoverCollections(pools)
    const second = buildDiscoverCollections(pools)

    assert.deepEqual(
      first.map((collection) => ({ id: collection.id, items: slugs(collection) })),
      second.map((collection) => ({ id: collection.id, items: slugs(collection) })),
    )
  })
})

// ── The service behind the route ────────────────────────────────────────────

/** A provider table recording the arguments it was called with. */
function stubbedProviders({ clawhubItems = [], skillhubItems = [], clawhubFails = false, skillhubFails = false } = {}) {
  const seen = []
  /** The reads Discover never makes, so a stray call is a failure rather than a pass. */
  const unused = async () => { throw new Error('the Discover read must not touch this endpoint') }

  return {
    seen,
    providers: {
      clawhub: {
        source: 'clawhub',
        pinsOwner: true,
        list: async (params) => {
          seen.push({ source: 'clawhub', order: params.order, limit: params.limit, cursor: params.cursor })
          if (clawhubFails) throw new Error('clawhub is unreachable')
          return { items: clawhubItems }
        },
        search: unused,
        detail: unused,
        listFiles: unused,
        fetchFile: unused,
      },
      skillhub: {
        source: 'skillhub',
        pinsOwner: false,
        list: async (params) => {
          seen.push({ source: 'skillhub', order: params.order, limit: params.limit, cursor: params.cursor })
          if (skillhubFails) throw new Error('skillhub is unreachable')
          return { items: skillhubItems }
        },
        search: unused,
        detail: unused,
        listFiles: unused,
        fetchFile: unused,
      },
    },
  }
}

afterEach(() => {
  setProviders({})
  resetInstalledLookup()
  resetCategoryVocabulary()
})

describe('the Discover read', () => {
  it('asks ClawHub for its trending and newest indices, and SkillHub for its own page', async () => {
    // The vocabulary is primed so the read does not go looking for it: this test is
    // about which *list* requests are made.
    setCategoryVocabulary([{ key: 'knowledge', name: '知识', sortOrder: 1, level: 1 }])
    const { seen, providers } = stubbedProviders()
    setProviders(providers)

    await listDiscoverSkills()

    const clawhub = seen.filter((entry) => entry.source === 'clawhub').map((entry) => entry.order).sort()
    assert.deepEqual(clawhub, ['newest', 'trending'], 'both ClawHub orderings are requested')

    const skillhub = seen.filter((entry) => entry.source === 'skillhub')
    assert.equal(skillhub.length, 1)
    assert.equal(skillhub[0].order, undefined, 'SkillHub has no ordering to ask for, and none is invented')
    // Every read is a first page: a Discover shelf is not paginated, and a cursor
    // belongs to the ordering that produced it.
    assert.ok(seen.every((entry) => entry.cursor === undefined))
  })

  it('keeps the shelves a working registry filled when the other one fails', async () => {
    setCategoryVocabulary([{ key: 'knowledge', name: '知识', sortOrder: 1, level: 1 }])
    const { providers } = stubbedProviders({
      clawhubFails: true,
      skillhubItems: [skill('skillhub', 'survivor', { downloads: 5, installs: 3, stars: 1 })],
    })
    setProviders(providers)

    const result = await listDiscoverSkills()

    assert.deepEqual(slugs(shelf(result.collections, 'installs')), ['survivor'])
    assert.ok('clawhub' in result.sources && 'skillhub' in result.sources, 'health travels with the shelves')
  })

  it('reports an error only when every read failed', async () => {
    setCategoryVocabulary([{ key: 'knowledge', name: '知识', sortOrder: 1, level: 1 }])
    const { providers } = stubbedProviders({ clawhubFails: true, skillhubFails: true })
    setProviders(providers)

    await assert.rejects(() => listDiscoverSkills(), /unreachable/)
  })

  it('annotates install state on every shelf, not on the pool', async () => {
    setCategoryVocabulary([{ key: 'knowledge', name: '知识', sortOrder: 1, level: 1 }])
    const { providers } = stubbedProviders({
      clawhubItems: [skill('clawhub', 'held', { downloads: 10, installs: 10, stars: 10 })],
    })
    setProviders(providers)
    setInstalledLookup({ has: (id) => id === 'clawhub:held', info: () => ({ dirName: 'held' }) })

    const result = await listDiscoverSkills()

    const onShelves = result.collections.flatMap((collection) => collection.items)
    assert.ok(onShelves.length > 0, 'the fixture must reach at least one shelf')
    for (const entry of onShelves) {
      assert.equal(entry.installState, 'installed', `${entry.id} on a shelf must carry its local state`)
      assert.equal(entry.installedInfo.dirName, 'held')
    }
  })
})
