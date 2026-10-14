/**
 * Pagination cursor and cross-source merge rules.
 *
 * Both are small enough to look obviously correct and wrong enough to be worth
 * asserting: a cursor that silently restarts a list makes the panel repeat
 * entries, and a merge that drops the authoritative copy is invisible until
 * someone installs the stale mirror.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { decodeCursor, encodeCursor } from '../lib/market/cursor.js'
import { dedupeSkills, sortByDownloads } from '../lib/market/dedupe.js'
import { skillId } from '../lib/market/types.js'

/** Build a minimal list entry; only the fields a merge decision reads matter. */
function skill(overrides = {}) {
  const source = overrides.source ?? 'clawhub'
  const slug = overrides.slug ?? 'demo'
  return {
    id: skillId(source, slug),
    source,
    slug,
    name: overrides.name ?? slug,
    summary: overrides.summary ?? 'summary',
    author: { handle: overrides.owner ?? 'author' },
    stats: { downloads: overrides.downloads ?? 0 },
    tags: overrides.tags ?? [],
    securityStatus: overrides.securityStatus ?? 'unknown',
    installState: 'installable',
    ...(overrides.upstream === undefined ? {} : { upstream: overrides.upstream }),
    ...(overrides.iconUrl === undefined ? {} : { iconUrl: overrides.iconUrl }),
    ...(overrides.securityReports === undefined ? {} : { securityReports: overrides.securityReports }),
  }
}

describe('market cursor', () => {
  it('round-trips per-source positions', () => {
    const encoded = encodeCursor({ clawhub: 'opaque-cursor-1', skillhub: '3' })
    assert.ok(encoded !== null)
    assert.deepEqual(decodeCursor(encoded), { clawhub: 'opaque-cursor-1', skillhub: '3' })
  })

  it('is opaque base64url, not a readable page number', () => {
    const encoded = encodeCursor({ skillhub: '2' })
    assert.ok(encoded !== null)
    assert.ok(!encoded.includes('{'))
    assert.match(encoded, /^[A-Za-z0-9_-]+$/)
  })

  it('returns null when no source has a further page', () => {
    assert.equal(encodeCursor({}), null)
    assert.equal(encodeCursor({ clawhub: '' }), null)
  })

  it('treats an absent source in a decoded cursor as exhausted', () => {
    // The distinction that matters: `{}` means "no positions", which the caller
    // reads as "every source is done" — not "start every source from the top".
    assert.deepEqual(decodeCursor(encodeCursor({ clawhub: 'c1' }) ?? ''), { clawhub: 'c1' })
  })

  it('treats an absent cursor as the first page', () => {
    assert.deepEqual(decodeCursor(undefined), {})
    assert.deepEqual(decodeCursor(''), {})
  })

  it('rejects anything it did not produce', () => {
    assert.equal(decodeCursor('not-base64url-json'), null)
    assert.equal(decodeCursor(Buffer.from('[1,2]').toString('base64url')), null)
    assert.equal(decodeCursor(Buffer.from('{"other":"x"}').toString('base64url')), null)
    assert.equal(decodeCursor(Buffer.from('{"clawhub":42}').toString('base64url')), null)
    assert.equal(decodeCursor(Buffer.from('{"clawhub":""}').toString('base64url')), null)
  })
})

describe('cross-source merge', () => {
  it('keeps a skill that has no counterpart', () => {
    const merged = dedupeSkills([skill({ slug: 'solo', source: 'clawhub' })])
    assert.equal(merged.length, 1)
    assert.equal(merged[0].mirrors, undefined)
  })

  it('folds a SkillHub mirror into the ClawHub original and records the id', () => {
    const original = skill({ source: 'clawhub', slug: 'weather', owner: 'alice', downloads: 900 })
    const mirror = skill({
      source: 'skillhub',
      slug: 'weather',
      owner: 'alice',
      downloads: 10,
      upstream: { source: 'clawhub', slug: 'weather', owner: 'alice' },
    })

    const merged = dedupeSkills([original, mirror])

    assert.equal(merged.length, 1, 'the mirror must not appear as its own row')
    assert.equal(merged[0].id, 'clawhub:weather', 'the authoritative source wins')
    assert.deepEqual(merged[0].mirrors, ['skillhub:weather'])
  })

  it('does not merge on a slug match alone when the authors differ', () => {
    const original = skill({ source: 'clawhub', slug: 'pdf', owner: 'awspace' })
    const other = skill({
      source: 'skillhub',
      slug: 'pdf',
      owner: 'someone-else',
      upstream: { source: 'clawhub', slug: 'pdf', owner: 'someone-else' },
    })

    const merged = dedupeSkills([original, other])
    assert.equal(merged.length, 2, 'a shared slug across authors is a different skill')
  })

  it('merges when the mirror names no upstream owner', () => {
    const original = skill({ source: 'clawhub', slug: 'pdf', owner: 'awspace' })
    const mirror = skill({
      source: 'skillhub',
      slug: 'pdf',
      owner: 'unknown-uploader',
      upstream: { source: 'clawhub', slug: 'pdf' },
    })

    const merged = dedupeSkills([original, mirror])
    assert.equal(merged.length, 1)
    assert.equal(merged[0].id, 'clawhub:pdf')
  })

  it('fills only the fields the original left empty', () => {
    const original = skill({
      source: 'clawhub',
      slug: 'weather',
      owner: 'alice',
      tags: ['authoritative-tag'],
      securityStatus: 'verified',
    })
    const mirror = skill({
      source: 'skillhub',
      slug: 'weather',
      owner: 'alice',
      tags: ['mirror-tag'],
      securityStatus: 'flagged',
      iconUrl: 'https://example.invalid/icon.png',
      upstream: { source: 'clawhub', slug: 'weather', owner: 'alice' },
    })

    const merged = dedupeSkills([original, mirror])

    assert.deepEqual(merged[0].tags, ['authoritative-tag'], 'a stated value is never replaced')
    assert.equal(merged[0].securityStatus, 'verified', 'the original verdict stands')
    assert.equal(merged[0].iconUrl, 'https://example.invalid/icon.png', 'an absent icon is filled')
  })

  it('takes the mirror verdict only when the original has none', () => {
    const original = skill({ source: 'clawhub', slug: 'weather', owner: 'alice', securityStatus: 'unknown' })
    const mirror = skill({
      source: 'skillhub',
      slug: 'weather',
      owner: 'alice',
      securityStatus: 'benign',
      securityReports: [{ vendor: 'acme', status: 'benign', statusText: 'clean' }],
      upstream: { source: 'clawhub', slug: 'weather', owner: 'alice' },
    })

    const merged = dedupeSkills([original, mirror])
    assert.equal(merged[0].securityStatus, 'benign')
    assert.equal(merged[0].securityReports.length, 1)
  })

  it('records every mirror when a skill is mirrored more than once', () => {
    const original = skill({ source: 'clawhub', slug: 'weather', owner: 'alice' })
    const mirrorA = skill({
      source: 'skillhub', slug: 'weather', owner: 'alice',
      upstream: { source: 'clawhub', slug: 'weather', owner: 'alice' },
    })
    const mirrorB = { ...mirrorA, id: 'skillhub:weather-copy' }

    const merged = dedupeSkills([original, mirrorA, mirrorB])
    assert.equal(merged.length, 1)
    assert.deepEqual(merged[0].mirrors, ['skillhub:weather', 'skillhub:weather-copy'])
  })

  it('never mutates its inputs', () => {
    const original = skill({ source: 'clawhub', slug: 'weather', owner: 'alice', tags: ['t'] })
    const mirror = skill({
      source: 'skillhub', slug: 'weather', owner: 'alice',
      upstream: { source: 'clawhub', slug: 'weather', owner: 'alice' },
    })
    const before = JSON.stringify([original, mirror])

    dedupeSkills([original, mirror])
    dedupeSkills([original, mirror]) // a cached page is read more than once

    assert.equal(JSON.stringify([original, mirror]), before)
    assert.equal(original.mirrors, undefined, 'the mirrors list is not grown in place')
  })
})

describe('ordering', () => {
  it('sorts by downloads, most first', () => {
    const sorted = sortByDownloads([
      skill({ slug: 'low', downloads: 5 }),
      skill({ slug: 'high', downloads: 500 }),
      skill({ slug: 'mid', downloads: 50 }),
    ])
    assert.deepEqual(sorted.map((entry) => entry.slug), ['high', 'mid', 'low'])
  })

  it('keeps input order for equal download counts, so paging is reproducible', () => {
    const sorted = sortByDownloads([
      skill({ slug: 'first', downloads: 10 }),
      skill({ slug: 'second', downloads: 10 }),
      skill({ slug: 'third', downloads: 10 }),
    ])
    assert.deepEqual(sorted.map((entry) => entry.slug), ['first', 'second', 'third'])
  })

  it('sorts an entry with no download stat last', () => {
    const sorted = sortByDownloads([
      skill({ slug: 'unknown', downloads: Number.NaN }),
      skill({ slug: 'known', downloads: 1 }),
    ])
    assert.deepEqual(sorted.map((entry) => entry.slug), ['known', 'unknown'])
  })
})
