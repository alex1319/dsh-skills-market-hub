/**
 * Skills Market — shared wire types.
 *
 * Upstream sources:
 *  - ClawHub  (https://clawhub.ai)      — cursor pagination, no security audits
 *  - SkillHub (https://api.skillhub.cn) — page/pageSize pagination, security reports
 *
 * This module is the single source of truth for the shapes that cross the HTTP
 * boundary. The browser half may `import type` from it (types are erased at
 * build time); it must never import a *value* from here, because every other
 * module in `src/market/` touches `node:*` and would drag Node code into the
 * browser bundle.
 */
export const MARKET_SOURCES = ['clawhub', 'skillhub'];
/** Limits applied to one installable skill. */
export const MARKET_LIMITS = {
    /** Max bytes for a single skill file (install + preview). */
    maxFileSize: 5 * 1024 * 1024,
    /** Max total bytes for an installable skill. */
    maxTotalSize: 20 * 1024 * 1024,
    /** Max file count for an installable skill. */
    maxFileCount: 200,
    /** File preview content is truncated beyond this many bytes. */
    previewTruncateBytes: 300 * 1024,
    /** ClawHub search has no pagination — cap merged search results. */
    searchResultCap: 50,
};
export function skillId(source, slug) {
    return `${source}:${slug}`;
}
export function parseSkillId(id) {
    const idx = id.indexOf(':');
    if (idx <= 0)
        return null;
    const source = id.slice(0, idx);
    const slug = id.slice(idx + 1);
    if (!MARKET_SOURCES.includes(source) || slug === '')
        return null;
    return { source: source, slug };
}
/**
 * Turn a classification key into something readable.
 *
 * Used only when the registry publishes no label for a key it put on a skill: an
 * English-keyed classification with no vocabulary entry renders as
 * "Business Ops" instead of "business-ops". It is a fallback, not a translation —
 * a key the vocabulary does define always wins, because only the registry knows
 * what its own key means.
 */
export function humanizeCategoryKey(key) {
    const spaced = key.replace(/[-_]+/g, ' ').trim();
    if (spaced === '')
        return key;
    return spaced.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}
/**
 * Spread helper for an optional classification list.
 *
 * An entry with no classification omits the field rather than carrying `[]`. The
 * difference is not cosmetic: "this registry publishes no classifications for this
 * skill" and "this skill has none" are different facts, and a cache full of empty
 * arrays would also make every equality assertion in the suite spell the field out.
 */
export function categoriesField(categories) {
    return categories.length === 0 ? {} : { categories };
}
/** Directory-name whitelist: lowercase alnum, dash, underscore, dot (no leading dot). */
export function sanitizeDirName(slug) {
    // Upstream payloads are untrusted: a non-string slug is simply not a usable
    // directory name, and must degrade to "not installable" instead of throwing.
    if (typeof slug !== 'string')
        return null;
    const name = slug.toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]*$/.test(name))
        return null;
    if (name.includes('..'))
        return null;
    return name;
}
const LANG_MAP = {
    md: 'markdown', markdown: 'markdown', mdx: 'markdown',
    ts: 'typescript', tsx: 'typescript',
    js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
    json: 'json', yaml: 'yaml', yml: 'yaml', sh: 'bash', bash: 'bash', zsh: 'bash',
    py: 'python', toml: 'toml', css: 'css', html: 'html',
    txt: 'text', xml: 'xml', sql: 'sql', rs: 'rust', go: 'go', rb: 'ruby',
};
export function detectMarketLanguage(filename) {
    const ext = filename.split('.').pop()?.toLowerCase() ?? '';
    return LANG_MAP[ext] ?? 'text';
}
//# sourceMappingURL=types.js.map