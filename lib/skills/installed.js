/**
 * The local skill inventory: what is on this disk, and which of it this plugin
 * installed.
 *
 * The provenance sidecar (`INSTALL_META_FILE`) is the whole ownership story. A
 * directory is *managed* only when that file exists **and** its `id` matches the
 * skill the caller names. Nothing else proves ownership — not the directory name,
 * not the presence of a `SKILL.md` — and the uninstall path refuses anything it
 * cannot prove it wrote, because deleting a hand-written skill would be
 * unrecoverable and is never what the user asked for.
 *
 * Identity is checked before integrity: the `files` ledger in the sidecar is a
 * record of what was written, not a credential. A sidecar whose ledger is damaged
 * still proves ownership; a sidecar with the wrong `id` proves nothing.
 */
import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { skillHeadline } from "../market/frontmatter.js";
import { MARKET_SOURCES, detectMarketLanguage, skillId, } from "../market/types.js";
/** Sidecar file name: the only proof that this plugin installed a directory. */
export const INSTALL_META_FILE = '.skills-market-hub.json';
/**
 * Attach the deployment's removal policy to one scanned record.
 *
 * **The only producer of {@link InstalledSkillRecord}.** Two routes publish an
 * installed record and a third returns one after a removal; every one of them
 * goes through here, so "publish a record without the policy" is not a mistake
 * that can be made — the type it would produce does not exist.
 *
 * Ownership is *not* part of this: a hand-written skill is removable here and is
 * still refused by the uninstall endpoint, which is where ownership is judged.
 */
export function publishInstalledRecord(record, allowUninstall) {
    return { ...record, removable: allowUninstall };
}
/** {@link publishInstalledRecord} over a page of the inventory. */
export function publishInstalled(records, allowUninstall) {
    return records.map((record) => publishInstalledRecord(record, allowUninstall));
}
/** Longest `SKILL.md` read for a headline; a larger file is read only in part. */
const HEADLINE_READ_BYTES = 32 * 1024;
/** Owner handle shape recorded at install time. */
const OWNER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
/** Upper bound on filesystem entries visited while measuring one skill. */
const MAX_WALK_ENTRIES = 5_000;
/**
 * Parse and validate a sidecar.
 *
 * @returns the metadata, or `null` when the file is absent, unreadable, or does
 *   not describe the skill it is supposed to belong to. Every rejection here
 *   means "not managed by this plugin", which is the safe reading.
 */
export function parseInstalledMeta(raw, source, slug) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
        return null;
    const record = raw;
    const id = record.id;
    if (typeof id !== 'string' || id !== skillId(source, slug))
        return null;
    const installedAt = record.installedAt;
    if (typeof installedAt !== 'string' || installedAt.trim() === '')
        return null;
    const owner = record.owner;
    if (owner !== undefined && (typeof owner !== 'string' || !OWNER_PATTERN.test(owner)))
        return null;
    const files = Array.isArray(record.files)
        ? record.files
            .map((entry) => (typeof entry === 'object' && entry !== null ? entry : null))
            .filter((entry) => entry !== null)
            .map((entry) => ({
            path: typeof entry.path === 'string' ? entry.path : '',
            sha256: typeof entry.sha256 === 'string' ? entry.sha256 : '',
        }))
            .filter((entry) => entry.path !== '')
        : [];
    const version = record.version;
    return {
        id,
        source,
        slug,
        installedAt,
        files,
        ...(typeof owner === 'string' ? { owner } : {}),
        ...(typeof version === 'string' && version !== '' ? { version } : {}),
    };
}
/** Read a sidecar from a skill directory. */
export async function readInstalledMeta(dir, source, slug) {
    try {
        const text = await fs.readFile(path.join(dir, INSTALL_META_FILE), 'utf8');
        return parseInstalledMeta(JSON.parse(text), source, slug);
    }
    catch {
        return null;
    }
}
/**
 * Read a sidecar and validate it against **its own** claim.
 *
 * The sidecar names the skill it belongs to; the check is that the claim is
 * internally consistent (a known source, a slug that matches the `id`), not that
 * it matches the directory name. An installed skill's directory can legitimately
 * differ from its slug — a rename, a manual move, a slug that is not a legal
 * directory name — and requiring them to agree would report those as unmanaged,
 * which is the one answer that makes the uninstall path refuse to work.
 */
async function readOwnSidecar(dir) {
    let raw;
    try {
        raw = JSON.parse(await fs.readFile(path.join(dir, INSTALL_META_FILE), 'utf8'));
    }
    catch {
        return null;
    }
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
        return null;
    const record = raw;
    const source = record.source;
    const slug = record.slug;
    if (typeof source !== 'string' || !MARKET_SOURCES.includes(source))
        return null;
    if (typeof slug !== 'string' || slug === '')
        return null;
    return parseInstalledMeta(record, source, slug);
}
/** Serialize a sidecar, ending with a newline so the file is diff-friendly. */
export function serializeInstalledMeta(meta) {
    return `${JSON.stringify(meta, null, 2)}\n`;
}
/**
 * Stable opaque key for one installed entry.
 *
 * The browser half never handles a real path: it holds this hash and asks the
 * host to act on it, and the host re-resolves the key against a fresh scan. A
 * caller-supplied path would be an arbitrary-file primitive.
 */
export function installedEntryKey(dir) {
    const normalized = process.platform === 'win32' ? path.resolve(dir).toLowerCase() : path.resolve(dir);
    return createHash('sha256').update(normalized, 'utf8').digest('hex');
}
/** Read a bounded prefix of a skill document and pull a headline out of it. */
async function readHeadline(file, fallbackName) {
    try {
        const handle = await fs.open(file, 'r');
        try {
            const buffer = Buffer.alloc(HEADLINE_READ_BYTES);
            const { bytesRead } = await handle.read(buffer, 0, HEADLINE_READ_BYTES, 0);
            const headline = skillHeadline(buffer.subarray(0, bytesRead).toString('utf8'), fallbackName);
            return { name: headline.name ?? fallbackName, ...(headline.summary === undefined ? {} : { summary: headline.summary }) };
        }
        finally {
            await handle.close();
        }
    }
    catch {
        return { name: fallbackName };
    }
}
/**
 * Measure one skill directory.
 *
 * Symbolic links and special files are counted but never traversed, so a link
 * pointing outside the skills root cannot make the walk read the whole disk.
 */
async function measureDirectory(dir, exclude) {
    let bytes = 0;
    let fileCount = 0;
    let visited = 0;
    const queue = [dir];
    while (queue.length > 0 && visited < MAX_WALK_ENTRIES) {
        const current = queue.shift();
        let entries;
        try {
            entries = await fs.readdir(current, { withFileTypes: true });
        }
        catch {
            continue;
        }
        for (const entry of entries) {
            visited += 1;
            if (visited > MAX_WALK_ENTRIES)
                break;
            const full = path.join(current, entry.name);
            if (entry.isDirectory()) {
                if (exclude.has(entry.name))
                    continue;
                queue.push(full);
                continue;
            }
            if (!entry.isFile())
                continue;
            if (exclude.has(entry.name))
                continue;
            try {
                const stats = await fs.stat(full);
                bytes += stats.size;
                fileCount += 1;
            }
            catch {
                // A file that vanished mid-walk is not counted; the scan is a snapshot,
                // not a transaction.
            }
        }
    }
    return { bytes, fileCount };
}
/**
 * Scan one root for skill entries.
 *
 * Three layouts are recognised, because all three exist in the wild:
 *   - a directory bundle containing `SKILL.md`;
 *   - a flat `<name>.md` file;
 *   - a symbolic link to either (reported as `linked`).
 *
 * Dot-prefixed entries are skipped, which is what keeps this plugin's own
 * staging and trash directories out of the inventory.
 */
async function scanRoot(root) {
    let entries;
    try {
        entries = await fs.readdir(root, { withFileTypes: true });
    }
    catch {
        return [];
    }
    const out = [];
    for (const entry of entries) {
        if (entry.name.startsWith('.'))
            continue;
        const full = path.join(root, entry.name);
        const linked = entry.isSymbolicLink();
        let isDirectory = entry.isDirectory();
        if (!isDirectory && linked) {
            try {
                isDirectory = (await fs.stat(full)).isDirectory();
            }
            catch {
                continue;
            }
        }
        if (isDirectory) {
            const skillFile = path.join(full, 'SKILL.md');
            try {
                const stats = await fs.stat(skillFile);
                if (stats.isFile())
                    out.push({ dir: full, dirName: entry.name, skillFile, linked });
            }
            catch {
                // A directory without SKILL.md is not a skill bundle.
            }
            continue;
        }
        const isFile = entry.isFile() || (linked && (await fs.stat(full).catch(() => null))?.isFile() === true);
        if (isFile && entry.name.toLowerCase().endsWith('.md') && entry.name.toLowerCase() !== 'skill.md') {
            out.push({ dir: full, dirName: entry.name.replace(/\.md$/i, ''), skillFile: full, linked });
        }
    }
    return out;
}
/** Build one inventory record. */
async function toRecord(entry) {
    const fallbackName = entry.dirName;
    const headline = entry.skillFile === undefined
        ? { name: fallbackName }
        : await readHeadline(entry.skillFile, fallbackName);
    // Ownership is decided by the sidecar alone, and only a directory bundle can
    // carry one: a flat `.md` file has nowhere to record provenance.
    const isFlatFile = entry.skillFile !== undefined && entry.skillFile === entry.dir;
    const meta = entry.linked || isFlatFile ? null : await readOwnSidecar(entry.dir);
    const measured = entry.linked
        ? { bytes: 0, fileCount: 0 }
        : await measureDirectory(entry.dir, new Set([INSTALL_META_FILE]));
    // A flat file is its own single-file skill.
    const size = entry.linked
        ? 0
        : isFlatFile
            ? (await fs.stat(entry.dir).catch(() => ({ size: 0 }))).size
            : measured.bytes;
    const fileCount = isFlatFile ? 1 : measured.fileCount;
    const source = meta?.source ?? 'local';
    const slug = meta?.slug ?? fallbackName;
    return {
        key: installedEntryKey(entry.dir),
        linked: entry.linked,
        id: meta?.id ?? `local:${fallbackName}`,
        source,
        slug,
        name: headline.name,
        dirName: entry.dirName,
        dirPath: entry.dir,
        managed: meta !== null,
        bytes: size,
        fileCount,
        ...(meta?.owner === undefined ? {} : { owner: meta.owner }),
        ...(meta?.version === undefined ? {} : { version: meta.version }),
        ...(meta?.installedAt === undefined ? {} : { installedAt: meta.installedAt }),
        ...(headline.summary === undefined ? {} : { summary: headline.summary }),
    };
}
/**
 * Scan every root and return the inventory, first occurrence of a directory
 * winning.
 *
 * Roots are ordered most specific first, so the install root's record is the one
 * kept when the same directory is reachable through two of them (a configured
 * root that happens to *be* the harness home, or a symlinked root).
 */
export async function scanInstalledSkills(roots) {
    const seen = new Set();
    const out = [];
    for (const root of roots) {
        for (const entry of await scanRoot(root)) {
            const key = installedEntryKey(entry.dir);
            if (seen.has(key))
                continue;
            seen.add(key);
            out.push(await toRecord(entry));
        }
    }
    // Stable order for a stable UI: managed skills first, then by name.
    return out.sort((a, b) => {
        if (a.managed !== b.managed)
            return a.managed ? -1 : 1;
        return a.name.localeCompare(b.name);
    });
}
/** A lookup over one scan, as the market layer consumes it. */
export function installedLookupFrom(records) {
    const byId = new Map(records.filter((record) => record.managed).map((record) => [record.id, record]));
    return {
        has: (id) => byId.has(id),
        info: (id) => {
            const record = byId.get(id);
            if (record === undefined)
                return undefined;
            return {
                dirName: record.dirName,
                ...(record.version === undefined ? {} : { version: record.version }),
                ...(record.installedAt === undefined ? {} : { installedAt: record.installedAt }),
            };
        },
    };
}
/** Resolve one opaque key against a fresh scan. */
export async function findInstalledEntry(roots, key) {
    return (await scanInstalledSkills(roots)).find((record) => record.key === key);
}
/** Upper bound on entries listed for one installed skill. */
const MAX_FILE_LIST_ENTRIES = 500;
/**
 * List the files of one installed skill directory.
 *
 * Dot-prefixed entries are skipped, which keeps this plugin's own sidecar out of
 * the file list — a reader should see the skill, not its bookkeeping. Symbolic
 * links are listed but not traversed.
 */
export async function listEntryFiles(dir) {
    const out = [];
    const queue = [{ absolute: dir, relative: '' }];
    let visited = 0;
    while (queue.length > 0 && visited < MAX_FILE_LIST_ENTRIES) {
        const current = queue.shift();
        let entries;
        try {
            entries = await fs.readdir(current.absolute, { withFileTypes: true });
        }
        catch {
            continue;
        }
        for (const entry of entries) {
            visited += 1;
            if (visited > MAX_FILE_LIST_ENTRIES)
                break;
            if (entry.name.startsWith('.'))
                continue;
            const absolute = path.join(current.absolute, entry.name);
            const relative = current.relative === '' ? entry.name : `${current.relative}/${entry.name}`;
            if (entry.isDirectory()) {
                queue.push({ absolute, relative });
                continue;
            }
            if (!entry.isFile())
                continue;
            const stats = await fs.stat(absolute).catch(() => null);
            if (stats === null)
                continue;
            out.push({ path: relative, size: stats.size, language: detectMarketLanguage(relative) });
        }
    }
    return out.sort((a, b) => a.path.localeCompare(b.path));
}
/**
 * Raw frontmatter text of a document, or `null`.
 *
 * Reported verbatim rather than re-serialized from the parsed mapping: a reader
 * comparing the panel against the file must see the author's own formatting.
 */
export function rawFrontmatterText(content) {
    const lines = content.split(/\r?\n/);
    if (lines[0]?.trim() !== '---')
        return null;
    for (let index = 1; index < lines.length; index += 1) {
        const trimmed = lines[index].trim();
        if (trimmed === '---' || trimmed === '...')
            return lines.slice(1, index).join('\n');
    }
    return null;
}
//# sourceMappingURL=installed.js.map