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
import { type YamlValue } from './yaml.ts';
export interface FrontmatterSplit {
    /** Parsed header; an empty object when the file carries no frontmatter. */
    meta: Record<string, YamlValue>;
    /** Raw header text without the fences, or `null` when there is none. */
    raw: string | null;
    /** Markdown body with the header removed. */
    body: string;
}
/**
 * Split a skill document into its header and body.
 *
 * A document that opens with `---` but never closes the fence is treated as
 * having no frontmatter at all: the alternative — swallowing the whole file as a
 * broken header — would hide the entire skill behind one missing line.
 */
export declare function splitFrontmatter(content: string): FrontmatterSplit;
/** The raw header text (for source view), or `null` when the file has none. */
export declare function frontmatterText(content: string): string | null;
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
export declare function stripFrontmatter(content: string): string;
/** Read one frontmatter string field, trimmed; `undefined` when absent or not a string. */
export declare function metaString(meta: Record<string, YamlValue>, key: string): string | undefined;
/** Read one frontmatter string-list field, ignoring non-string members. */
export declare function metaStringList(meta: Record<string, YamlValue>, key: string): string[];
/**
 * Collapse text to one line and clip it to a row-sized summary.
 *
 * Markdown headings and list markers are kept: a summary that silently dropped
 * them would misquote the author's text, and the row shows them as literal
 * characters anyway.
 */
export declare function toSummary(text: string, limit?: number): string;
export interface SkillHeadline {
    name?: string;
    summary?: string;
    whenToUse?: string;
    license?: string;
    /** Frontmatter `allowed-tools`, when the skill declares a tool scope. */
    allowedTools: string[];
}
/**
 * Extract the fields a list row or detail header needs.
 *
 * `name` falls back to the directory name and `summary` to the first paragraph
 * of the body: a skill with no frontmatter is still a skill, and showing an
 * untitled empty row would make it look broken.
 */
export declare function skillHeadline(content: string, fallbackName?: string): SkillHeadline;
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
export declare function skillReadinessIssue(content: string): string | undefined;
//# sourceMappingURL=frontmatter.d.ts.map