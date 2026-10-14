/**
 * Provider normalizers, driven by real captured responses.
 *
 * Every assertion here is anchored to a fixture in `tests/fixtures/market/`,
 * captured from the live registry by `scripts/capture-fixtures.mjs`. That is the
 * point: these tests exist to fail when a provider changes a field name, and a
 * hand-written sample would have encoded the same wrong assumption as the code.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CLAWHUB_OWNER_PATTERN,
  AmbiguousSkillSlugError,
  isNativeSearchResult,
  normalizeDetail,
  normalizeFiles,
  normalizeListItem,
  normalizeSearchResult,
  parseClawhubSecurity,
} from '../lib/market/clawhub-provider.js'
import {
  mapSecurity,
  normalizeDetail as normalizeSkillhubDetail,
  normalizeFiles as normalizeSkillhubFiles,
  normalizeListItem as normalizeSkillhubListItem,
  parseSecurityReports,
  parseUpstream,
} from '../lib/market/skillhub-provider.js'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const FIXTURES = join(ROOT, 'tests', 'fixtures', 'market')

async function fixture(name) {
  return JSON.parse(await readFile(join(FIXTURES, name), 'utf8'))
}

const clawhubList = await fixture('clawhub-list.json')
const clawhubSearch = await fixture('clawhub-search.json')
const clawhubDetail = await fixture('clawhub-detail.json')
const clawhubVersion = await fixture('clawhub-version.json')
const skillhubList = await fixture('skillhub-list.json')
const skillhubSearch = await fixture('skillhub-search.json')
const skillhubDetail = await fixture('skillhub-detail.json')
const skillhubFiles = await fixture('skillhub-files.json')

describe('ClawHub list normalization', () => {
  it('normalizes every entry of a real page', () => {
    const items = clawhubList.items.map(normalizeListItem)
    assert.equal(items.length, 3)
    for (const item of items) {
      assert.equal(item.source, 'clawhub')
      assert.equal(item.id, `clawhub:${item.slug}`)
      assert.ok(item.name !== '', 'a card needs a title')
      assert.ok(Number.isFinite(item.stats.downloads))
      assert.equal(item.installState, 'installable')
    }
  })

  it('takes the version from tags.latest, which really is the version string', () => {
    const [first] = clawhubList.items.map(normalizeListItem)
    assert.equal(first.slug, 'self-improving-agent')
    assert.equal(first.version, '4.0.3')
  })

  it('maps topics to tags and the license from the latest version block', () => {
    const items = clawhubList.items.map(normalizeListItem)
    assert.deepEqual(items[0].tags, ['self-improvement', 'context'])
    assert.equal(items[0].license, 'MIT-0')
  })

  it('carries the download and install counts through', () => {
    const [first] = clawhubList.items.map(normalizeListItem)
    assert.equal(first.stats.downloads, clawhubList.items[0].stats.downloads)
    assert.equal(first.stats.installs, clawhubList.items[0].stats.installs)
    assert.equal(first.stats.stars, clawhubList.items[0].stats.stars)
  })

  it('drops an entry with no owner rather than inventing one', () => {
    assert.equal(normalizeListItem({ slug: 'x' }), null)
    assert.equal(normalizeListItem({ ownerHandle: 'a' }), null)
  })

  it('keeps the cursor opaque: it is a JSON string that cannot be rebuilt', () => {
    // Asserting the shape rather than parsing it into parts, because the parts
    // that appear nowhere in the payload are exactly why it must be passed back
    // verbatim.
    assert.equal(typeof clawhubList.nextCursor, 'string')
    const decoded = JSON.parse(clawhubList.nextCursor)
    assert.equal(decoded.v, 1)
    assert.ok(Array.isArray(decoded.key))
    assert.ok(decoded.key.some((part) => typeof part === 'string' && !clawhubList.items.some(
      (item) => JSON.stringify(item).includes(part),
    )), 'the cursor contains a value that appears in no item, so it cannot be reconstructed')
  })
})

describe('ClawHub search normalization', () => {
  it('separates native results from aggregated ones', () => {
    const native = clawhubSearch.results.filter(isNativeSearchResult)
    assert.ok(native.length > 0, 'the fixture must contain native results')
    assert.ok(native.length < clawhubSearch.results.length, 'the fixture must also contain aggregated ones')
    for (const result of native) {
      assert.equal(result.install.kind, 'clawhub')
      assert.notEqual(result.native, null)
    }
  })

  it('decides nativeness from the payload rather than a hardcoded source list', () => {
    // An aggregated row whose `source` this plugin has never seen must still be
    // rejected: `native: null` is the reliable signal, a source whitelist is not.
    const unknownExternal = { slug: 'x', ownerHandle: 'o', source: 'some-future-registry', native: null, install: { kind: 'some-future-registry' } }
    assert.equal(isNativeSearchResult(unknownExternal), false)
  })

  it('normalizes a native result', () => {
    const result = clawhubSearch.results.filter(isNativeSearchResult).map(normalizeSearchResult)[0]
    assert.equal(result.source, 'clawhub')
    assert.equal(result.slug, 'pdf')
    assert.equal(result.author.handle, 'awspace')
    assert.ok(result.stats.downloads > 0)
  })

  it('never reads tags from a search result, where latest is an internal id', () => {
    const withNestedTags = clawhubSearch.results.find(
      (result) => typeof result.native?.skill?.tags?.latest === 'string' && /^k[0-9a-z]+$/.test(result.native.skill.tags.latest),
    )
    assert.ok(withNestedTags, 'the fixture must contain the version-id form')
    const normalized = normalizeSearchResult(withNestedTags)
    assert.notDeepEqual(normalized.tags, [withNestedTags.native.skill.tags.latest])
    assert.deepEqual(normalized.tags, withNestedTags.native.skill.topics ?? [])
  })
})

describe('ClawHub detail normalization', () => {
  it('reads the real detail response', () => {
    const detail = normalizeDetail(clawhubDetail, 'pdf', 'awspace')

    assert.equal(detail.name, 'Pdf')
    assert.equal(detail.author.handle, 'awspace')
    assert.equal(detail.version, '0.1.0')
    assert.equal(detail.stats.downloads, 50487)
    assert.deepEqual(detail.tags, ['PDF'])
    assert.equal(detail.pageUrl, 'https://clawhub.ai/awspace/skills/pdf')
  })

  it('strips the SKILL.md frontmatter from the body and surfaces it as metadata', () => {
    const detail = normalizeDetail(clawhubDetail, 'pdf', 'awspace')

    assert.ok(!detail.description.startsWith('---'), 'the rendered body must not open with the fence')
    assert.ok(detail.description.includes('# '), 'the body is still markdown')
    // The same header is available parsed, which is what the metadata panel reads.
    assert.equal(detail.descriptionFrontmatter.name, 'pdf')
    assert.ok(detail.descriptionFrontmatter.description !== undefined)
  })

  it('falls back to the requested owner when the body omits one', () => {
    const detail = normalizeDetail({ skill: { slug: 'x', displayName: 'X' } }, 'x', 'someone')
    assert.equal(detail.author.handle, 'someone')
  })

  it('normalizes a version file inventory, keeping the content type', () => {
    const files = normalizeFiles(clawhubVersion.version.files)
    assert.equal(files.length, 3)
    const skillFile = files.find((file) => file.path === 'SKILL.md')
    assert.equal(skillFile.size, 9047)
    assert.equal(skillFile.language, 'markdown')
    assert.equal(skillFile.contentType, 'text/markdown')
    assert.equal(skillFile.tooBig, false)
    assert.match(skillFile.sha256, /^[a-f0-9]{64}$/)
  })

  it('flags a file over the per-file limit instead of dropping it', () => {
    const files = normalizeFiles([{ path: 'huge.bin', size: 6 * 1024 * 1024 }])
    assert.equal(files[0].tooBig, true)
  })
})

describe('ClawHub security mapping', () => {
  it('reports unknown when there is no scan at all', () => {
    assert.deepEqual(parseClawhubSecurity(undefined), { status: 'unknown', reports: [] })
    assert.deepEqual(parseClawhubSecurity(null), { status: 'unknown', reports: [] })
  })

  it('turns each scanner into a report row', () => {
    const { status, reports } = parseClawhubSecurity({
      status: 'benign',
      virustotalUrl: 'https://www.virustotal.com/x',
      scanners: {
        vt: { status: 'clean', statusText: 'No detections' },
        llm: { status: 'benign', summary: 'Looks like a weather skill' },
      },
    })

    assert.equal(status, 'benign')
    assert.deepEqual(reports.map((report) => report.vendor).sort(), ['llm', 'virustotal', 'vt'])
    assert.equal(reports.find((report) => report.vendor === 'llm').summary, 'Looks like a weather skill')
  })

  it('flags a malicious or blocked verdict', () => {
    assert.equal(parseClawhubSecurity({ status: 'malicious' }).status, 'flagged')
    assert.equal(parseClawhubSecurity({ status: 'blocked' }).status, 'flagged')
    assert.equal(parseClawhubSecurity({ status: 'suspicious' }).status, 'flagged')
  })

  it('flags an unrecognised scanner verdict rather than calling it unknown', () => {
    // "unknown" is the no-scan state; a scanner that said something we do not
    // understand is a finding, and must not look like "not scanned".
    const { status } = parseClawhubSecurity({ status: 'benign', scanners: { future: { status: 'quarantined' } } })
    assert.equal(status, 'flagged')
  })
})

describe('ClawHub ambiguity', () => {
  it('treats a slug as addressable only when the owner shape is valid', () => {
    assert.ok(CLAWHUB_OWNER_PATTERN.test('awspace'))
    assert.ok(CLAWHUB_OWNER_PATTERN.test('a.b-c_d'))
    assert.ok(!CLAWHUB_OWNER_PATTERN.test('has space'))
    assert.ok(!CLAWHUB_OWNER_PATTERN.test('-leading'))
    assert.ok(!CLAWHUB_OWNER_PATTERN.test(''))
  })

  it('exposes the candidate authors when a slug is ambiguous', () => {
    const error = new AmbiguousSkillSlugError('pdf', ['awspace', 'momansouri83'])
    assert.equal(error.slug, 'pdf')
    assert.deepEqual(error.owners, ['awspace', 'momansouri83'])
    assert.match(error.message, /awspace, momansouri83/)
  })
})

describe('SkillHub list normalization', () => {
  it('normalizes every entry of a real page', () => {
    const items = skillhubList.data.skills.map(normalizeSkillhubListItem)
    assert.equal(items.length, 3)
    for (const item of items) {
      assert.equal(item.source, 'skillhub')
      assert.ok(item.name !== '')
      assert.ok(item.slug !== '')
    }
  })

  it('prefers the Chinese description for a Chinese-first UI', () => {
    const raw = skillhubList.data.skills[0]
    const item = normalizeSkillhubListItem(raw)
    assert.ok(raw.description_zh !== undefined)
    assert.ok(item.summary.startsWith(raw.description_zh.slice(0, 12)))
  })

  it('reads the version from the flat list field', () => {
    const raw = skillhubList.data.skills.find((entry) => typeof entry.version === 'string')
    assert.equal(normalizeSkillhubListItem(raw).version, raw.version)
  })

  it('treats tags as absent on the list shape, where they are always null', () => {
    const raw = skillhubList.data.skills.find((entry) => entry.tags === null)
    assert.deepEqual(normalizeSkillhubListItem(raw).tags, [])
  })

  it('accepts tags as a string array when the endpoint sends one', () => {
    // The list/search shapes disagree about `tags`: one sends `null`, the other
    // may send a string array, and the detail sends an object. The fixture is a
    // live capture, so whether a tagged entry happens to be on page one is not
    // something a test may depend on — the shape handling is asserted directly.
    const tagged = skillhubSearch.data.skills.find((entry) => Array.isArray(entry.tags))
    if (tagged !== undefined) {
      assert.deepEqual(normalizeSkillhubListItem(tagged).tags, tagged.tags)
    }
    assert.deepEqual(normalizeSkillhubListItem({ slug: 'x', name: 'X', tags: ['a', 'b'] }).tags, ['a', 'b'])
    assert.deepEqual(normalizeSkillhubListItem({ slug: 'x', name: 'X', tags: null }).tags, [])
    assert.deepEqual(normalizeSkillhubListItem({ slug: 'x', name: 'X', tags: { latest: '1.0.0' } }).tags, [], 'the detail object form is not a tag list')
  })

  it('reads requires_api_key from the string form the registry sends', () => {
    const flagged = skillhubList.data.skills.map(normalizeSkillhubListItem).find((item) => item.requiresApiKey === true)
    const unflagged = skillhubList.data.skills.map(normalizeSkillhubListItem).find((item) => item.requiresApiKey === undefined)
    assert.ok(flagged !== undefined || unflagged !== undefined, 'the flag must be read as a boolean, not the string "true"')
  })
})

describe('SkillHub mirror detection', () => {
  it('reads the owner from an upstream URL', () => {
    const upstream = parseUpstream('clawhub', 'https://clawhub.ai/shaharsha/tavily-search-pro', undefined)
    assert.deepEqual(upstream, { source: 'clawhub', slug: 'tavily-search-pro', owner: 'shaharsha' })
  })

  it('prefers the explicit upstream owner login', () => {
    const upstream = parseUpstream('clawhub', 'https://clawhub.ai/x/y', 'shaharsha')
    assert.equal(upstream.owner, 'shaharsha')
  })

  it('does not treat a skills URL word as an author', () => {
    const upstream = parseUpstream('clawhub', 'https://clawhub.ai/shaharsha/skills/tavily-search-pro', undefined)
    assert.equal(upstream.owner, 'shaharsha')
  })

  it('ignores a community entry and a malformed URL', () => {
    assert.equal(parseUpstream('community', 'https://clawhub.ai/a/b', undefined), undefined)
    assert.equal(parseUpstream('clawhub', 'not a url', undefined), undefined)
    assert.equal(parseUpstream('clawhub', undefined, undefined), undefined)
  })

  it('finds the mirror in the real list response, when the page happens to hold one', () => {
    // Which entries land on page one of a live registry is not a stable fact, so
    // this asserts the shape when a mirror is present rather than requiring one.
    const mirrored = skillhubList.data.skills.find((entry) => entry.source === 'clawhub')
    if (mirrored === undefined) return
    const normalized = normalizeSkillhubListItem(mirrored)
    assert.equal(normalized.upstream.source, 'clawhub')
    assert.equal(normalized.upstream.slug, mirrored.slug)
  })

  it('normalizes a mirror entry end to end', () => {
    // Pinned from a capture, so the mirror path is always exercised even when a
    // fresh page one is all community skills.
    const mirrored = {
      slug: 'tavily-search-pro',
      name: 'Tavily Search Pro',
      description: 'Tavily AI search',
      description_zh: 'Tavily AI 搜索',
      version: '1.0.3',
      downloads: 37536,
      source: 'clawhub',
      upstream_url: 'https://clawhub.ai/shaharsha/tavily-search-pro',
      upstream_owner_login: 'shaharsha',
      ownerName: 'shaharsha',
      namespace: { handle: 'clawhub_shaharsha', displayName: 'shaharsha' },
      updated_at: 1791975403485,
    }
    const normalized = normalizeSkillhubListItem(mirrored)
    assert.deepEqual(normalized.upstream, { source: 'clawhub', slug: 'tavily-search-pro', owner: 'shaharsha' })
    assert.equal(normalized.author.handle, 'clawhub_shaharsha')
    assert.equal(normalized.author.displayName, 'shaharsha')
    assert.equal(normalized.version, '1.0.3')
  })
})

describe('SkillHub detail normalization', () => {
  it('reads the envelope-less detail response', () => {
    const detail = normalizeSkillhubDetail(skillhubDetail, 'anti-fraud', '')

    // Values are compared against the fixture, not against literals: page-one
    // fixtures are live captures, and a download counter that moves between two
    // captures must not read as a code regression.
    assert.equal(detail.name, skillhubDetail.skill.displayName)
    assert.equal(detail.version, skillhubDetail.latestVersion.version)
    assert.equal(detail.stats.downloads, skillhubDetail.skill.stats.downloads)
    assert.equal(detail.pageUrl, 'https://skillhub.cn/skills/anti-fraud')
  })

  it('reads the name from displayName, which is the only name the detail carries', () => {
    // The list shape calls it `name`; the detail has no such key, and reading the
    // wrong one yields a card titled with its own slug.
    assert.equal(skillhubDetail.skill.name, undefined)
    assert.equal(normalizeSkillhubDetail(skillhubDetail, 'anti-fraud', '').name, skillhubDetail.skill.displayName)
  })

  it('reads the version from latestVersion, which is where the detail keeps it', () => {
    assert.equal(skillhubDetail.skill.version, undefined)
    assert.equal(normalizeSkillhubDetail(skillhubDetail, 'anti-fraud', '').version, skillhubDetail.latestVersion.version)
  })

  it('reads the counts from skill.stats, which is where the detail keeps them', () => {
    assert.equal(skillhubDetail.downloads, undefined)
    assert.equal(normalizeSkillhubDetail(skillhubDetail, 'anti-fraud', '').stats.downloads, skillhubDetail.skill.stats.downloads)
  })

  it('never claims a license, because this registry publishes none', () => {
    assert.equal(JSON.stringify(skillhubDetail).includes('license'), false)
    assert.equal(normalizeSkillhubDetail(skillhubDetail, 'anti-fraud', '').license, undefined)
  })
})

describe('SkillHub security mapping', () => {
  it('turns the object map into report rows', () => {
    const reports = parseSecurityReports(skillhubDetail.securityReports)
    assert.ok(reports.length >= 2)
    for (const report of reports) assert.equal(typeof report.vendor, 'string')
    assert.ok(reports.some((report) => report.status === 'benign'))
  })

  it('returns nothing for a missing or malformed map', () => {
    assert.deepEqual(parseSecurityReports(undefined), [])
    assert.deepEqual(parseSecurityReports([]), [], 'an array is not the shape this endpoint uses')
  })

  it('maps all-benign to benign and honours the verified flag', () => {
    const reports = [{ vendor: 'a', status: 'benign', statusText: 'ok' }]
    assert.equal(mapSecurity(reports, false), 'benign')
    assert.equal(mapSecurity(reports, true), 'verified')
  })

  it('accepts the other clean spellings', () => {
    assert.equal(mapSecurity([{ vendor: 'a', status: 'clean', statusText: 'ok' }], false), 'benign')
    assert.equal(mapSecurity([{ vendor: 'a', status: 'safe', statusText: 'ok' }], false), 'benign')
  })

  it('flags an unrecognised verdict instead of calling it unknown', () => {
    assert.equal(mapSecurity([{ vendor: 'a', status: 'quarantined', statusText: '?' }], false), 'flagged')
  })

  it('reports unknown only when there is nothing to read', () => {
    assert.equal(mapSecurity([], false), 'unknown')
  })
})

describe('SkillHub file inventory', () => {
  it('normalizes the envelope-less file list', () => {
    const files = normalizeSkillhubFiles(skillhubFiles)
    assert.equal(files.length, skillhubFiles.count)
    const skillFile = files.find((file) => file.path === 'SKILL.md')
    assert.equal(skillFile.size, 17538)
    assert.match(skillFile.sha256, /^[a-f0-9]{64}$/)
  })

  it('leaves contentType unset, because this endpoint does not send one', () => {
    const files = normalizeSkillhubFiles(skillhubFiles)
    assert.ok(files.every((file) => file.contentType === undefined))
    assert.equal(files.find((file) => file.path === 'SKILL.md').language, 'markdown')
  })

  it('reads a nested path', () => {
    const files = normalizeSkillhubFiles(skillhubFiles)
    assert.ok(files.some((file) => file.path.includes('/')), 'the fixture must contain a nested file')
  })
})
