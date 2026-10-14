/**
 * Minimal YAML subset reader for skill frontmatter.
 *
 * Why not a YAML library: this plugin publishes with **zero runtime
 * dependencies** (the host installs it unbuilt-but-installed, so a dependency
 * that is not hoisted into the profile would make the plugin fail to load). A
 * skill's frontmatter is also a deliberately tiny dialect — `name`, `description`,
 * `whenToUse`, `license`, maybe `allowed-tools` and a few `metadata` keys — so a
 * full YAML parser would be a large dependency bought for a small job.
 *
 * Supported (everything observed SKILL.md files actually use):
 *   - `key: value` scalars, quoted with `'…'` / `"…"` (escape by doubling)
 *   - block mappings and block sequences (indentation based)
 *   - literal (`|`) and folded (`>`) block scalars with `-`/`+` chomping
 *   - flow sequences (`[a, b]`) and flow mappings (`{a: 1}`)
 *   - booleans, integers, floats, `null`/`~`, and comment lines
 *
 * Not supported, and how it fails: anchors/aliases, tags, multi-document streams,
 * complex keys, and merge keys. None appear in an observed SKILL.md, and an
 * unsupported construct degrades to a plain scalar instead of throwing, so one
 * exotic key can never make a whole skill unreadable.
 */
/**
 * Parse a YAML subset document.
 *
 * @param source - raw YAML text (a frontmatter block, without the `---` fences).
 * @returns the parsed mapping; an empty object when the document carries no keys.
 */
export function parseYamlSubset(source) {
    const lines = prepare(source);
    const result = {};
    parseMapping(lines, 0, lines.length > 0 ? lines[0].indent : 0, result);
    return result;
}
/** Drop blank and comment-only lines, measuring indentation. */
function prepare(source) {
    const out = [];
    for (const raw of source.split(/\r?\n/)) {
        const trimmed = raw.trim();
        if (trimmed === '' || trimmed.startsWith('#'))
            continue;
        out.push({ indent: raw.length - raw.trimStart().length, text: trimmed });
    }
    return out;
}
/** Consume a block mapping at `indent`; returns the first index past it. */
function parseMapping(lines, start, indent, target) {
    let index = start;
    while (index < lines.length) {
        const line = lines[index];
        if (line.indent < indent)
            break;
        if (line.indent > indent) {
            index += 1;
            continue;
        } // stray deeper line
        if (line.text === '-' || line.text.startsWith('- '))
            break; // sequence belongs to the caller
        const separator = findKeySeparator(line.text);
        if (separator === -1) {
            index += 1;
            continue;
        }
        const key = unquote(line.text.slice(0, separator).trim());
        const rest = line.text.slice(separator + 1).trim();
        if (isBlockScalarHeader(rest)) {
            const block = readBlockScalar(lines, index + 1, indent, rest);
            target[key] = block.value;
            index = block.next;
            continue;
        }
        if (rest !== '') {
            target[key] = parseScalarOrFlow(rest);
            index += 1;
            continue;
        }
        const next = lines[index + 1];
        if (next === undefined || next.indent <= indent) {
            target[key] = null;
            index += 1;
            continue;
        }
        if (next.text === '-' || next.text.startsWith('- ')) {
            const sequence = [];
            index = parseSequence(lines, index + 1, next.indent, sequence);
            target[key] = sequence;
            continue;
        }
        const nested = {};
        index = parseMapping(lines, index + 1, next.indent, nested);
        target[key] = nested;
    }
    return index;
}
/** Consume a block sequence at `indent`. */
function parseSequence(lines, start, indent, target) {
    let index = start;
    while (index < lines.length) {
        const line = lines[index];
        if (line.indent !== indent || !(line.text === '-' || line.text.startsWith('- ')))
            break;
        const rest = line.text === '-' ? '' : line.text.slice(2).trim();
        if (isBlockScalarHeader(rest)) {
            const block = readBlockScalar(lines, index + 1, indent, rest);
            target.push(block.value);
            index = block.next;
            continue;
        }
        if (rest === '') {
            const next = lines[index + 1];
            if (next === undefined || next.indent <= indent) {
                target.push(null);
                index += 1;
                continue;
            }
            if (next.text === '-' || next.text.startsWith('- ')) {
                const nested = [];
                index = parseSequence(lines, index + 1, next.indent, nested);
                target.push(nested);
                continue;
            }
            const nested = {};
            index = parseMapping(lines, index + 1, next.indent, nested);
            target.push(nested);
            continue;
        }
        // `- key: value` opens a mapping whose remaining keys are indented past the dash.
        const separator = findKeySeparator(rest);
        if (separator !== -1) {
            const item = {};
            const key = unquote(rest.slice(0, separator).trim());
            const value = rest.slice(separator + 1).trim();
            const next = lines[index + 1];
            if (isBlockScalarHeader(value)) {
                const block = readBlockScalar(lines, index + 1, indent, value);
                item[key] = block.value;
                index = block.next;
            }
            else {
                item[key] = value === '' ? null : parseScalarOrFlow(value);
                if (next !== undefined && next.indent > indent && !(next.text === '-' || next.text.startsWith('- '))) {
                    index = parseMapping(lines, index + 1, next.indent, item);
                }
                else {
                    index += 1;
                }
            }
            target.push(item);
            continue;
        }
        target.push(parseScalarOrFlow(rest));
        index += 1;
    }
    return index;
}
/** Whether an inline value is a block-scalar header (`|`, `|-`, `>`, `>+2`, …). */
function isBlockScalarHeader(text) {
    return /^[|>][+-]?\d*$/.test(text) || /^[|>]\d*[+-]?$/.test(text);
}
/**
 * Read a literal (`|`) or folded (`>`) block scalar.
 *
 * The block is every following line indented deeper than the owning key. Literal
 * style keeps newlines; folded style joins adjacent non-empty lines with a space,
 * which is what long `description:` values in SKILL.md rely on. Chomping follows
 * the indicator: `-` strips the trailing newline, `+` keeps every one, and the
 * default clips to exactly one.
 */
function readBlockScalar(lines, start, ownerIndent, header) {
    const folded = header.startsWith('>');
    const chomp = header.includes('-') ? 'strip' : header.includes('+') ? 'keep' : 'clip';
    // Explicit indentation indicator, when present, is relative to the owner.
    const explicit = header.match(/\d/)?.[0];
    const bodyIndent = explicit !== undefined ? ownerIndent + Number.parseInt(explicit, 10) : undefined;
    const collected = [];
    let index = start;
    let indent = bodyIndent;
    while (index < lines.length) {
        const line = lines[index];
        if (line.indent <= ownerIndent)
            break;
        if (indent === undefined)
            indent = line.indent;
        collected.push(line.text);
        index += 1;
    }
    let text;
    if (folded) {
        // Fold: consecutive content lines join with a space; a blank input line would
        // have been dropped by `prepare`, so a folded paragraph arrives as one run.
        text = collected.join(' ');
    }
    else {
        text = collected.join('\n');
    }
    if (chomp === 'strip')
        text = text.replace(/\n+$/, '');
    else if (chomp === 'clip')
        text = `${text.replace(/\n+$/, '')}\n`;
    // `keep` leaves the joined text as-is.
    return { value: text, next: index };
}
/**
 * Find the `:` separating a key from its value.
 *
 * A colon inside a quoted key or inside a URL (`https://…`) must not split the
 * line — the one place a hand-written parser usually goes wrong.
 */
function findKeySeparator(text) {
    let quote = null;
    for (let i = 0; i < text.length; i += 1) {
        const char = text[i];
        if (quote !== null) {
            if (char === quote)
                quote = null;
            continue;
        }
        if (char === "'" || char === '"') {
            quote = char;
            continue;
        }
        if (char === ':' && (i + 1 === text.length || text[i + 1] === ' '))
            return i;
    }
    return -1;
}
/** Parse an inline value: a flow collection, a quoted string, or a typed scalar. */
function parseScalarOrFlow(text) {
    if (text.startsWith('[') && text.endsWith(']')) {
        return splitFlow(text.slice(1, -1)).map((part) => parseScalarOrFlow(part));
    }
    if (text.startsWith('{') && text.endsWith('}')) {
        const out = {};
        for (const part of splitFlow(text.slice(1, -1))) {
            const separator = findKeySeparator(part);
            if (separator === -1)
                continue;
            out[unquote(part.slice(0, separator).trim())] = parseScalarOrFlow(part.slice(separator + 1).trim());
        }
        return out;
    }
    return parseScalar(text);
}
/** Split a flow collection body on commas outside quotes and nested brackets. */
function splitFlow(body) {
    const parts = [];
    let depth = 0;
    let quote = null;
    let current = '';
    for (const char of body) {
        if (quote !== null) {
            current += char;
            if (char === quote)
                quote = null;
            continue;
        }
        if (char === "'" || char === '"') {
            quote = char;
            current += char;
            continue;
        }
        if (char === '[' || char === '{')
            depth += 1;
        if (char === ']' || char === '}')
            depth -= 1;
        if (char === ',' && depth === 0) {
            parts.push(current.trim());
            current = '';
            continue;
        }
        current += char;
    }
    if (current.trim() !== '')
        parts.push(current.trim());
    return parts;
}
/** Remove a matching pair of surrounding quotes, undoubling the inner escape. */
function unquote(text) {
    if (text.length >= 2) {
        const first = text[0];
        const last = text[text.length - 1];
        if ((first === "'" || first === '"') && first === last) {
            return text.slice(1, -1).split(first + first).join(first);
        }
    }
    return text;
}
/** Type an unquoted scalar the way the YAML core schema would. */
function parseScalar(text) {
    if (text.length >= 2 && (text[0] === "'" || text[0] === '"'))
        return unquote(text);
    const lowered = text.toLowerCase();
    if (lowered === 'null' || lowered === '~' || text === '')
        return null;
    if (lowered === 'true' || lowered === 'yes')
        return true;
    if (lowered === 'false' || lowered === 'no')
        return false;
    if (/^[+-]?\d+$/.test(text))
        return Number.parseInt(text, 10);
    if (/^[+-]?\d*\.\d+$/.test(text))
        return Number.parseFloat(text);
    return text;
}
//# sourceMappingURL=yaml.js.map