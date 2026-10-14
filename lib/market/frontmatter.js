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
import { parseYamlSubset } from "./yaml.js";
/** Longest summary a list row keeps; longer text is clipped on a word boundary. */
const SUMMARY_LIMIT = 280;
/**
 * Split a skill document into its header and body.
 *
 * A document that opens with `---` but never closes the fence is treated as
 * having no frontmatter at all: the alternative — swallowing the whole file as a
 * broken header — would hide the entire skill behind one missing line.
 */
export function splitFrontmatter(content) {
    const lines = content.split(/\r?\n/);
    if (lines.length === 0 || lines[0].trim() !== '---') {
        return { meta: {}, raw: null, body: content };
    }
    let closer = -1;
    for (let index = 1; index < lines.length; index += 1) {
        const trimmed = lines[index].trim();
        if (trimmed === '---' || trimmed === '...') {
            closer = index;
            break;
        }
    }
    if (closer === -1)
        return { meta: {}, raw: null, body: content };
    const raw = lines.slice(1, closer).join('\n');
    let meta = {};
    try {
        meta = parseYamlSubset(raw);
    }
    catch {
        // A header this reader cannot parse must not cost the reader the body: the
        // body is the skill, the header is metadata.
        meta = {};
    }
    const body = lines.slice(closer + 1).join('\n').replace(/^\r?\n/, '');
    return { meta, raw, body };
}
/** The raw header text (for source view), or `null` when the file has none. */
export function frontmatterText(content) {
    return splitFrontmatter(content).raw;
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
export function stripFrontmatter(content) {
    const lines = content.split(/\r?\n/);
    if (lines[0]?.trim() !== '---')
        return content;
    for (let index = 1; index < lines.length; index += 1) {
        const trimmed = lines[index].trim();
        if (trimmed === '---' || trimmed === '...') {
            return lines.slice(index + 1).join('\n').replace(/^\r?\n/, '');
        }
    }
    return content;
}
/** Read one frontmatter string field, trimmed; `undefined` when absent or not a string. */
export function metaString(meta, key) {
    const value = meta[key];
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed === '' ? undefined : trimmed;
    }
    if (typeof value === 'number' || typeof value === 'boolean')
        return String(value);
    return undefined;
}
/** Read one frontmatter string-list field, ignoring non-string members. */
export function metaStringList(meta, key) {
    const value = meta[key];
    if (Array.isArray(value)) {
        return value.filter((item) => typeof item === 'string' && item.trim() !== '')
            .map((item) => item.trim());
    }
    const single = metaString(meta, key);
    return single === undefined ? [] : [single];
}
/**
 * Collapse text to one line and clip it to a row-sized summary.
 *
 * Markdown headings and list markers are kept: a summary that silently dropped
 * them would misquote the author's text, and the row shows them as literal
 * characters anyway.
 */
export function toSummary(text, limit = SUMMARY_LIMIT) {
    const collapsed = text.replace(/\s+/g, ' ').trim();
    if (collapsed.length <= limit)
        return collapsed;
    const clipped = collapsed.slice(0, limit);
    const lastSpace = clipped.lastIndexOf(' ');
    return `${(lastSpace > limit * 0.6 ? clipped.slice(0, lastSpace) : clipped).trimEnd()}…`;
}
/**
 * Extract the fields a list row or detail header needs.
 *
 * `name` falls back to the directory name and `summary` to the first paragraph
 * of the body: a skill with no frontmatter is still a skill, and showing an
 * untitled empty row would make it look broken.
 */
export function skillHeadline(content, fallbackName) {
    const { meta, body } = splitFrontmatter(content);
    const name = metaString(meta, 'name') ?? fallbackName;
    const declared = metaString(meta, 'description') ?? metaString(meta, 'summary');
    const summary = declared ?? firstParagraph(body);
    const whenToUse = metaString(meta, 'whenToUse') ?? metaString(meta, 'when_to_use');
    const license = metaString(meta, 'license');
    return {
        ...(name === undefined ? {} : { name }),
        ...(summary === undefined ? {} : { summary: toSummary(summary) }),
        ...(whenToUse === undefined ? {} : { whenToUse: toSummary(whenToUse) }),
        ...(license === undefined ? {} : { license }),
        allowedTools: metaStringList(meta, 'allowed-tools').length > 0
            ? metaStringList(meta, 'allowed-tools')
            : metaStringList(meta, 'allowed_tools'),
    };
}
/** First non-empty, non-heading paragraph of a markdown body. */
function firstParagraph(body) {
    const blocks = body.split(/\r?\n\s*\r?\n/);
    for (const block of blocks) {
        const text = block.trim();
        if (text === '' || text.startsWith('#') || text.startsWith('---'))
            continue;
        return text;
    }
    return undefined;
}
//# sourceMappingURL=frontmatter.js.map