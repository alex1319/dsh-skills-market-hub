/**
 * SKILL.md frontmatter handling.
 *
 * A skill file is a YAML header fenced by `---` lines followed by the markdown
 * body. Three different consumers need three different views of it, and mixing
 * them up is the usual source of "the preview shows YAML in the text" bugs:
 *
 *   - {@link splitFrontmatter} — both halves, for a file preview that shows the
 *     header as structured metadata and the body as markdown;
 *   - {@link frontmatterText} — the raw header, for a read-only YAML panel;
 *   - {@link skillHeadline} — `name` + a one-line `description`, for a list row
 *     that must render something even when the file is truncated or malformed.
 */

import { parseYamlSubset, type YamlValue } from './yaml.ts'

/** Longest summary a list row keeps; longer text is clipped on a word boundary. */
const SUMMARY_LIMIT = 280

export interface FrontmatterSplit {
  /** Parsed header; an empty object when the file carries no frontmatter. */
  meta: Record<string, YamlValue>
  /** Raw header text without the fences, or `null` when there is none. */
  raw: string | null
  /** Markdown body with the header removed. */
  body: string
}

/**
 * Split a skill document into its header and body.
 *
 * A document that opens with `---` but never closes the fence is treated as
 * having no frontmatter at all: the alternative — swallowing the whole file as a
 * broken header — would hide the entire skill behind one missing line.
 */
export function splitFrontmatter(content: string): FrontmatterSplit {
  const lines = content.split(/\r?\n/)
  if (lines.length === 0 || lines[0]!.trim() !== '---') {
    return { meta: {}, raw: null, body: content }
  }

  let closer = -1
  for (let index = 1; index < lines.length; index += 1) {
    const trimmed = lines[index]!.trim()
    if (trimmed === '---' || trimmed === '...') { closer = index; break }
  }
  if (closer === -1) return { meta: {}, raw: null, body: content }

  const raw = lines.slice(1, closer).join('\n')
  let meta: Record<string, YamlValue> = {}
  try {
    meta = parseYamlSubset(raw)
  } catch {
    // A header this reader cannot parse must not cost the reader the body: the
    // body is the skill, the header is metadata.
    meta = {}
  }
  const body = lines.slice(closer + 1).join('\n').replace(/^\r?\n/, '')
  return { meta, raw, body }
}

/** The raw header text (for source view), or `null` when the file has none. */
export function frontmatterText(content: string): string | null {
  return splitFrontmatter(content).raw
}

/**
 * Drop a YAML frontmatter block, keeping the prose.
 *
 * A detail view renders a skill document as markdown, so leaving the header in
 * would print the skill's own `name:`/`description:` lines above its body. The
 * full document — header included — stays available through the file view.
 *
 * Unlike {@link splitFrontmatter} this never treats an unclosed fence as "no
 * frontmatter": here the input is already known to have one, and the caller wants
 * the most readable rendering available.
 */
export function stripFrontmatter(content: string): string {
  const lines = content.split(/\r?\n/)
  if (lines[0]?.trim() !== '---') return content
  for (let index = 1; index < lines.length; index += 1) {
    const trimmed = lines[index]!.trim()
    if (trimmed === '---' || trimmed === '...') {
      return lines.slice(index + 1).join('\n').replace(/^\r?\n/, '')
    }
  }
  return content
}

/** Read one frontmatter string field, trimmed; `undefined` when absent or not a string. */
export function metaString(meta: Record<string, YamlValue>, key: string): string | undefined {
  const value = meta[key]
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed === '' ? undefined : trimmed
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return undefined
}

/** Read one frontmatter string-list field, ignoring non-string members. */
export function metaStringList(meta: Record<string, YamlValue>, key: string): string[] {
  const value = meta[key]
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
      .map((item) => item.trim())
  }
  const single = metaString(meta, key)
  return single === undefined ? [] : [single]
}

/**
 * Collapse text to one line and clip it to a row-sized summary.
 *
 * Markdown headings and list markers are kept: a summary that silently dropped
 * them would misquote the author's text, and the row shows them as literal
 * characters anyway.
 */
export function toSummary(text: string, limit = SUMMARY_LIMIT): string {
  const collapsed = text.replace(/\s+/g, ' ').trim()
  if (collapsed.length <= limit) return collapsed
  const clipped = collapsed.slice(0, limit)
  const lastSpace = clipped.lastIndexOf(' ')
  return `${(lastSpace > limit * 0.6 ? clipped.slice(0, lastSpace) : clipped).trimEnd()}…`
}

export interface SkillHeadline {
  name?: string
  summary?: string
  whenToUse?: string
  license?: string
  /** Frontmatter `allowed-tools`, when the skill declares a tool scope. */
  allowedTools: string[]
}

/**
 * Extract the fields a list row or detail header needs.
 *
 * `name` falls back to the directory name and `summary` to the first paragraph
 * of the body: a skill with no frontmatter is still a skill, and showing an
 * untitled empty row would make it look broken.
 */
export function skillHeadline(content: string, fallbackName?: string): SkillHeadline {
  const { meta, body } = splitFrontmatter(content)
  const name = metaString(meta, 'name') ?? fallbackName
  const declared = metaString(meta, 'description') ?? metaString(meta, 'summary')
  const summary = declared ?? firstParagraph(body)
  const whenToUse = metaString(meta, 'whenToUse') ?? metaString(meta, 'when_to_use')
  const license = metaString(meta, 'license')
  return {
    ...(name === undefined ? {} : { name }),
    ...(summary === undefined ? {} : { summary: toSummary(summary) }),
    ...(whenToUse === undefined ? {} : { whenToUse: toSummary(whenToUse) }),
    ...(license === undefined ? {} : { license }),
    allowedTools: metaStringList(meta, 'allowed-tools').length > 0
      ? metaStringList(meta, 'allowed-tools')
      : metaStringList(meta, 'allowed_tools'),
  }
}

/** First non-empty, non-heading paragraph of a markdown body. */
function firstParagraph(body: string): string | undefined {
  const blocks = body.split(/\r?\n\s*\r?\n/)
  for (const block of blocks) {
    const text = block.trim()
    if (text === '' || text.startsWith('#') || text.startsWith('---')) continue
    return text
  }
  return undefined
}

// ── Install-time readiness ──────────────────────────────────────────────────

/**
 * Skill-name grammar the harness accepts, so `/name` can address the skill.
 *
 * Mirrors `SKILL_NAME` in `@deepseek-ai/dsh-skill`. A name outside it makes the
 * harness drop the skill at discovery time.
 */
const HARNESS_SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Why the harness would refuse this document, or `undefined` when it would accept it.
 *
 * The plugin's own reader ({@link splitFrontmatter}) is **deliberately permissive**:
 * an exotic construct degrades to a plain scalar, because one unusual key must not
 * hide a whole skill from the preview. The harness's reader is the opposite — a full
 * YAML parser that drops the entire skill on any error, leaving only a log line.
 *
 * That asymmetry has a concrete cost. A skill was installed from SkillHub whose
 * frontmatter read:
 *
 *     description: A股实时行情… Use when: (1) 查询A股实时行情, …
 *
 * A plain YAML scalar may not contain `": "`. The harness's parse threw, the skill
 * was skipped with a warning nobody reads, and the slash menu simply never showed
 * it. The install had reported success, because by the plugin's own definition it
 * was one: every file was written and every checksum matched.
 *
 * So this check makes "the harness can read it" part of what a successful install
 * means. It refuses rather than repairs: the plugin's contract is to install the
 * bytes the registry published, and quietly rewriting an author's `description` to
 * work around a registry defect would break exactly that promise.
 *
 * @param content - the whole `SKILL.md`.
 * @returns a short reason, phrased to follow "…would be ignored by the harness:".
 */
export function skillReadinessIssue(content: string): string | undefined {
  const lines = content.split(/\r?\n/)
  if (lines[0]?.trim() !== '---') {
    return 'it does not open with a `---` frontmatter fence'
  }

  let closer = -1
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index]!.trim() === '---') { closer = index; break }
  }
  if (closer === -1) return 'its `---` frontmatter fence is never closed'

  const plainScalar = findUnquotedPlainScalarColon(lines.slice(1, closer))
  if (plainScalar !== undefined) return plainScalar

  // Parsed with this plugin's own reader purely to read the two fields back: the
  // strict-YAML question was settled line by line above, and a construct this
  // reader cannot represent is a *permissive* outcome, never a rejection.
  const { meta } = splitFrontmatter(content)
  const name = metaString(meta, 'name')
  const description = metaString(meta, 'description')
  if (name === undefined) return 'its frontmatter has no `name`'
  if (description === undefined) return 'its frontmatter has no `description`'
  if (!HARNESS_SKILL_NAME.test(name)) {
    return `its name "${name}" is not a lowercase hyphenated skill name`
  }
  return undefined
}

/**
 * Find a plain (unquoted) scalar containing `": "`, which YAML forbids.
 *
 * Line-based on purpose. A real parser is what this plugin cannot ship — see the
 * zero-dependency note in `yaml.ts` — and the restriction is a property of one
 * line, so a scan is both sufficient and honest about its scope.
 *
 * The single way this could report a false positive is a continuation line, and
 * block scalars are the only construct that produces one. They are skipped by
 * indentation: everything more indented than the `|`/`>` marker is content, not a
 * mapping. Quoted scalars and flow collections are skipped by their opening
 * character, because a `": "` inside them is legal.
 */
function findUnquotedPlainScalarColon(frontmatter: readonly string[]): string | undefined {
  let blockScalarIndent: number | undefined

  for (let index = 0; index < frontmatter.length; index += 1) {
    const line = frontmatter[index]!
    const text = line.trim()
    if (text === '' || text.startsWith('#')) continue

    const indent = line.length - line.trimStart().length
    if (blockScalarIndent !== undefined) {
      if (indent > blockScalarIndent) continue
      blockScalarIndent = undefined
    }

    const colon = text.indexOf(':')
    if (colon < 0) continue

    const head = text.slice(0, colon).replace(/^-\s*/, '').trimStart()
    // A quoted key (`"a: b": value`) puts a legal colon before the real separator,
    // so the first colon found is not the mapping one. Rare enough that skipping is
    // cheaper than parsing, and skipping errs toward acceptance — refusing a skill
    // the harness would have read is worse than missing one it would not.
    if (head.startsWith('"') || head.startsWith("'")) continue

    const value = text.slice(colon + 1).trim()
    // An empty value is a nested mapping or a sequence; the lines beneath it are
    // scanned on their own terms.
    if (value === '') continue

    const first = value[0]!
    if (first === '|' || first === '>') {
      blockScalarIndent = indent
      continue
    }
    if (first === '"' || first === "'" || first === '[' || first === '{') continue

    if (value.includes(': ')) {
      const key = head.trim()
      return `the value of \`${key}\` contains ": " unquoted, which YAML refuses in a plain scalar (file line ${index + 2})`
    }
  }
  return undefined
}
