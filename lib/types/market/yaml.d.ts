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
export type YamlValue = string | number | boolean | null | YamlValue[] | {
    [key: string]: YamlValue;
};
/**
 * Parse a YAML subset document.
 *
 * @param source - raw YAML text (a frontmatter block, without the `---` fences).
 * @returns the parsed mapping; an empty object when the document carries no keys.
 */
export declare function parseYamlSubset(source: string): Record<string, YamlValue>;
//# sourceMappingURL=yaml.d.ts.map