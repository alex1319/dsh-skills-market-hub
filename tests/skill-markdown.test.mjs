/**
 * The YAML subset reader and the SKILL.md frontmatter splitter.
 *
 * The frontmatter case is exercised against a **real** SKILL.md captured from
 * ClawHub (`tests/fixtures/market/clawhub-file.txt`), because the interesting
 * part of this reader is not the grammar — it is whether it survives the shapes
 * that real authors actually write.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseYamlSubset } from '../lib/market/yaml.js'
import {
  frontmatterText,
  metaString,
  metaStringList,
  skillHeadline,
  skillReadinessIssue,
  splitFrontmatter,
  toSummary,
} from '../lib/market/frontmatter.js'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const REAL_SKILL = await readFile(join(ROOT, 'tests', 'fixtures', 'market', 'clawhub-file.txt'), 'utf8')

describe('YAML subset reader', () => {
  it('reads plain scalars with their YAML types', () => {
    const parsed = parseYamlSubset([
      'name: weather',
      'version: 2',
      'ratio: 0.5',
      'enabled: true',
      'disabled: false',
      'missing: null',
      'tilde: ~',
    ].join('\n'))

    assert.equal(parsed.name, 'weather')
    assert.equal(parsed.version, 2)
    assert.equal(parsed.ratio, 0.5)
    assert.equal(parsed.enabled, true)
    assert.equal(parsed.disabled, false)
    assert.equal(parsed.missing, null)
    assert.equal(parsed.tilde, null)
  })

  it('keeps a colon inside a URL and inside a quoted key from splitting the line', () => {
    const parsed = parseYamlSubset([
      'homepage: https://example.com/a:b',
      '"odd:key": value',
    ].join('\n'))

    assert.equal(parsed.homepage, 'https://example.com/a:b')
    assert.equal(parsed['odd:key'], 'value')
  })

  it('unquotes scalars and undoubles the escape', () => {
    const parsed = parseYamlSubset([
      "single: 'it''s here'",
      'double: "a \\"quoted\\" word"',
    ].join('\n'))

    assert.equal(parsed.single, "it's here")
    assert.equal(parsed.double, 'a \\"quoted\\" word')
  })

  it('reads nested mappings by indentation', () => {
    const parsed = parseYamlSubset([
      'metadata:',
      '  author: someone',
      '  counts:',
      '    files: 3',
    ].join('\n'))

    assert.deepEqual(parsed.metadata, { author: 'someone', counts: { files: 3 } })
  })

  it('reads block sequences, including sequences of mappings', () => {
    const parsed = parseYamlSubset([
      'tags:',
      '  - alpha',
      '  - beta',
      'steps:',
      '  - name: first',
      '    run: echo one',
      '  - name: second',
      '    run: echo two',
    ].join('\n'))

    assert.deepEqual(parsed.tags, ['alpha', 'beta'])
    assert.deepEqual(parsed.steps, [
      { name: 'first', run: 'echo one' },
      { name: 'second', run: 'echo two' },
    ])
  })

  it('reads flow sequences and flow mappings', () => {
    const parsed = parseYamlSubset([
      'tools: [read, write, glob]',
      'meta: {a: 1, b: two}',
    ].join('\n'))

    assert.deepEqual(parsed.tools, ['read', 'write', 'glob'])
    assert.deepEqual(parsed.meta, { a: 1, b: 'two' })
  })

  it('reads a literal block scalar, preserving newlines', () => {
    const parsed = parseYamlSubset([
      'description: |',
      '  First line.',
      '  Second line.',
      'name: after',
    ].join('\n'))

    assert.equal(parsed.description, 'First line.\nSecond line.\n')
    assert.equal(parsed.name, 'after')
  })

  it('reads a folded block scalar, joining lines with a space', () => {
    const parsed = parseYamlSubset([
      'description: >-',
      '  A long sentence that the author',
      '  wrapped across two lines.',
      'name: after',
    ].join('\n'))

    assert.equal(parsed.description, 'A long sentence that the author wrapped across two lines.')
    assert.equal(parsed.name, 'after')
  })

  it('ignores comments and blank lines', () => {
    const parsed = parseYamlSubset([
      '# leading comment',
      'name: weather',
      '',
      '   ',
      '# trailing comment',
    ].join('\n'))

    assert.deepEqual(parsed, { name: 'weather' })
  })

  it('degrades an unsupported construct to a scalar instead of throwing', () => {
    const parsed = parseYamlSubset('anchored: &base value')
    assert.equal(parsed.anchored, '&base value')
  })

  it('returns an empty mapping for empty input', () => {
    assert.deepEqual(parseYamlSubset(''), {})
    assert.deepEqual(parseYamlSubset('\n\n# only a comment\n'), {})
  })
})

describe('SKILL.md frontmatter', () => {
  it('splits a real ClawHub SKILL.md into header and body', () => {
    const { meta, raw, body } = splitFrontmatter(REAL_SKILL)

    assert.equal(meta.name, 'self-improving-agent')
    assert.equal(meta.version, '4.0.2')
    assert.match(String(meta.description), /^Captures and maintains learnings/)
    // A key with no value at all is still a key.
    assert.equal(meta.metadata, null)

    assert.ok(raw !== null && raw.startsWith('name: self-improving-agent'))
    assert.ok(!raw.includes('---'), 'the fences are not part of the header')

    assert.ok(body.startsWith('# Self-Improvement Skill'))
    assert.ok(!body.includes('name: self-improving-agent'), 'the header is gone from the body')
    // This file happens to carry no horizontal rule, so the fences are the only
    // `---` lines in it — which is exactly why the splitter must key off line
    // content and position rather than "the last --- in the document".
    assert.equal(body.split('\n').filter((line) => line.trim() === '---').length, 0)
  })

  it('keeps body horizontal rules out of the frontmatter', () => {
    const content = '---\nname: x\n---\n# Title\n\n---\n\nafter the rule\n'
    const { meta, raw, body } = splitFrontmatter(content)
    assert.equal(meta.name, 'x')
    assert.equal(raw, 'name: x')
    assert.ok(body.includes('\n---\n'), 'the body rule survives the split')
    assert.equal(body.split('\n').filter((line) => line.trim() === '---').length, 1)
  })

  it('handles a CRLF document the same as an LF one', () => {
    const lf = '---\nname: x\ndescription: |\n  one\n  two\n---\n# Body\n'
    const crlf = lf.replace(/\n/g, '\r\n')

    const fromLf = splitFrontmatter(lf)
    const fromCrlf = splitFrontmatter(crlf)

    assert.equal(fromCrlf.meta.name, 'x')
    assert.equal(fromCrlf.meta.description, 'one\ntwo\n')
    assert.equal(fromCrlf.raw, fromLf.raw)
    // The body is reported with the line endings it was given; what matters is
    // that the header was found and removed identically.
    assert.equal(fromCrlf.body.replace(/\r\n/g, '\n'), fromLf.body)
  })

  it('treats a document with no frontmatter as all body', () => {
    const content = '# Just markdown\n\nNothing else.'
    const { meta, raw, body } = splitFrontmatter(content)
    assert.deepEqual(meta, {})
    assert.equal(raw, null)
    assert.equal(body, content)
  })

  it('treats an unclosed fence as no frontmatter, so the skill is still readable', () => {
    const content = '---\nname: broken\n\n# Body kept'
    const { meta, raw, body } = splitFrontmatter(content)
    assert.deepEqual(meta, {})
    assert.equal(raw, null)
    assert.equal(body, content)
  })

  it('accepts `...` as the closing fence', () => {
    const { meta, body } = splitFrontmatter('---\nname: x\n...\n# Body')
    assert.equal(meta.name, 'x')
    assert.equal(body, '# Body')
  })

  it('reports the raw header text for a source view', () => {
    assert.equal(frontmatterText('---\nname: x\n---\nbody'), 'name: x')
    assert.equal(frontmatterText('no header'), null)
  })

  it('reads string fields and string lists defensively', () => {
    const parsed = parseYamlSubset([
      'name: weather',
      'count: 3',
      'tools: [read, write]',
      'one: single',
      'mixed:',
      '  - ok',
      '  - 7',
    ].join('\n'))

    assert.equal(metaString(parsed, 'name'), 'weather')
    assert.equal(metaString(parsed, 'count'), '3', 'a number is surfaced as its text form')
    assert.equal(metaString(parsed, 'missing'), undefined)
    assert.deepEqual(metaStringList(parsed, 'tools'), ['read', 'write'])
    assert.deepEqual(metaStringList(parsed, 'one'), ['single'])
    assert.deepEqual(metaStringList(parsed, 'mixed'), ['ok'], 'non-string members are dropped')
    assert.deepEqual(metaStringList(parsed, 'missing'), [])
  })
})

describe('skill headline', () => {
  it('prefers frontmatter and falls back to the body', () => {
    const declared = skillHeadline('---\nname: weather\ndescription: Fetch forecasts.\nlicense: MIT\n---\n# Body')
    assert.equal(declared.name, 'weather')
    assert.equal(declared.summary, 'Fetch forecasts.')
    assert.equal(declared.license, 'MIT')

    const undeclared = skillHeadline('# Title\n\nThe first paragraph describes it.', 'dir-name')
    assert.equal(undeclared.name, 'dir-name')
    assert.equal(undeclared.summary, 'The first paragraph describes it.')
  })

  it('reads the allowed-tools spelling both ways', () => {
    assert.deepEqual(
      skillHeadline('---\nname: x\nallowed-tools: [read, write]\n---\n').allowedTools,
      ['read', 'write'],
    )
    assert.deepEqual(
      skillHeadline('---\nname: x\nallowed_tools: [glob]\n---\n').allowedTools,
      ['glob'],
    )
    assert.deepEqual(skillHeadline('---\nname: x\n---\n').allowedTools, [])
  })

  it('survives a real SKILL.md', () => {
    const headline = skillHeadline(REAL_SKILL, 'fallback')
    assert.equal(headline.name, 'self-improving-agent')
    assert.ok(headline.summary !== undefined && headline.summary.startsWith('Captures and maintains'))
  })
})

describe('summary clipping', () => {
  it('collapses whitespace and keeps short text intact', () => {
    assert.equal(toSummary('  a\n\n  b  '), 'a b')
  })

  it('clips long text on a word boundary with an ellipsis', () => {
    const long = 'word '.repeat(120).trim()
    const summary = toSummary(long, 50)
    assert.ok(summary.length <= 51, `unexpected length ${summary.length}`)
    assert.ok(summary.endsWith('…'))
    assert.ok(!summary.includes('  '))
  })
})

/**
 * Whether the harness will actually accept the document.
 *
 * This is the check that makes "the harness can read it" part of a successful
 * install. Its whole value is agreeing with a *different* parser, so the cases
 * below are written as the two halves of that agreement: what the harness drops,
 * and — just as important — what it does not.
 *
 * The false-positive half matters more than it looks. A wrong refusal blocks an
 * install that would have worked, which is a regression the reader cannot work
 * around; a wrong acceptance merely reproduces the bug being fixed.
 */
describe('install readiness', () => {
  /** The exact frontmatter that broke a real install, trimmed to its essentials. */
  const BROKEN_REAL_WORLD = [
    '---',
    'name: a-stock-analysis',
    'description: A股实时行情与分时量能分析。获取沪深股票实时价格、涨跌、成交量。Use when: (1) 查询A股实时行情, (2) 分析主力资金动向。',
    '---',
    '',
    '# 股票分析',
  ].join('\n')

  it('accepts a real ClawHub SKILL.md', () => {
    assert.equal(skillReadinessIssue(REAL_SKILL), undefined)
  })

  it('refuses the unquoted ": " that a registry actually published', () => {
    // `description: … Use when: (1) …` — YAML reads the second colon as the start
    // of a nested mapping and throws. The harness then drops the whole skill with
    // a log line, which is how a "successful" install became an invisible one.
    const issue = skillReadinessIssue(BROKEN_REAL_WORLD)
    assert.ok(issue !== undefined, 'this document must be refused')
    assert.match(issue, /description/)
    assert.match(issue, /": "/)
  })

  it('refuses a document the harness cannot find a name or description in', () => {
    assert.match(skillReadinessIssue('---\nname: x\n---\n') ?? '', /description/)
    assert.match(skillReadinessIssue('---\ndescription: x\n---\n') ?? '', /`name`/)
  })

  it('refuses a document with no frontmatter or an unclosed fence', () => {
    assert.match(skillReadinessIssue('# Just a body\n') ?? '', /fence/)
    assert.match(skillReadinessIssue('---\nname: x\ndescription: y\n') ?? '', /never closed/)
  })

  it('refuses a name the slash menu could not address', () => {
    // The harness's own grammar; `/My Skill` is not a command.
    assert.match(skillReadinessIssue('---\nname: My Skill\ndescription: y\n---\n') ?? '', /lowercase hyphenated/)
    assert.match(skillReadinessIssue('---\nname: Demo\ndescription: y\n---\n') ?? '', /lowercase hyphenated/)
  })

  it('accepts the legal places a colon may appear', () => {
    // Each of these is a construct where ": " is not a plain scalar, and a check
    // that refused them would block perfectly good skills.
    const cases = {
      'double-quoted value': '---\nname: demo\ndescription: "a: b"\n---\n',
      'single-quoted value': "---\nname: demo\ndescription: 'a: b'\n---\n",
      'flow mapping': '---\nname: demo\ndescription: y\nmetadata: {a: 1, b: 2}\n---\n',
      'flow sequence': '---\nname: demo\ndescription: y\nkeywords: [a: 1]\n---\n',
      'a URL, where the colon has no space after it': '---\nname: demo\ndescription: y\nhomepage: https://example.com/a\n---\n',
      'a time, where the colon has no space after it': '---\nname: demo\ndescription: y\ntime: 12:30\n---\n',
      'a quoted key that itself contains a colon': '---\nname: demo\ndescription: y\n"a: b": c\n---\n',
      'a block scalar whose content is full of colons': [
        '---', 'name: demo', 'description: |', '  Step one: do it.', '  Step two: done.', '---', '',
      ].join('\n'),
      'a folded block scalar': [
        '---', 'name: demo', 'description: >', '  Note: folded.', '---', '',
      ].join('\n'),
    }
    for (const [label, content] of Object.entries(cases)) {
      assert.equal(skillReadinessIssue(content), undefined, `${label} must be accepted`)
    }
  })

  it('still scans past a block scalar to the mapping that follows it', () => {
    // The skip must be scoped: a bad line *after* a block scalar is still bad.
    const content = [
      '---',
      'name: demo',
      'description: |',
      '  Fine: this is content.',
      'summary: Bad: this is not.',
      '---',
      '',
    ].join('\n')
    assert.match(skillReadinessIssue(content) ?? '', /summary/)
  })

  it('reads the same document the permissive preview reader reads', () => {
    // Agreement check: the splitter is happy with the broken document — which is
    // exactly why the readiness check has to exist separately from it.
    const parsed = splitFrontmatter(BROKEN_REAL_WORLD)
    assert.equal(parsed.meta.name, 'a-stock-analysis')
    assert.ok(typeof parsed.meta.description === 'string')
    assert.ok(skillReadinessIssue(BROKEN_REAL_WORLD) !== undefined)
  })
})
