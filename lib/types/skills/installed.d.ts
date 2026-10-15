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
import { type InstalledSkillRecord, type MarketSource, type ScannedSkillRecord } from '../market/types.ts';
/** Sidecar file name: the only proof that this plugin installed a directory. */
export declare const INSTALL_META_FILE = ".skills-market-hub.json";
/**
 * One installed entry, as a **scan** reports it: the disk facts, no policy.
 *
 * Re-exported from the wire types rather than declared here: the browser half
 * reads the published shape, and a second declaration would be a second thing to
 * keep in step with the JSON the routes actually send.
 */
export type { InstalledSkillRecord, ScannedSkillRecord };
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
export declare function publishInstalledRecord(record: ScannedSkillRecord, allowUninstall: boolean): InstalledSkillRecord;
/** {@link publishInstalledRecord} over a page of the inventory. */
export declare function publishInstalled(records: readonly ScannedSkillRecord[], allowUninstall: boolean): InstalledSkillRecord[];
/** What the sidecar records. */
export interface InstalledMeta {
    id: string;
    source: MarketSource;
    slug: string;
    owner?: string;
    version?: string;
    installedAt: string;
    /** Content ledger: what was written, for later verification. */
    files: Array<{
        path: string;
        sha256: string;
    }>;
}
/**
 * Parse and validate a sidecar.
 *
 * @returns the metadata, or `null` when the file is absent, unreadable, or does
 *   not describe the skill it is supposed to belong to. Every rejection here
 *   means "not managed by this plugin", which is the safe reading.
 */
export declare function parseInstalledMeta(raw: unknown, source: MarketSource, slug: string): InstalledMeta | null;
/** Read a sidecar from a skill directory. */
export declare function readInstalledMeta(dir: string, source: MarketSource, slug: string): Promise<InstalledMeta | null>;
/** Serialize a sidecar, ending with a newline so the file is diff-friendly. */
export declare function serializeInstalledMeta(meta: InstalledMeta): string;
/**
 * Stable opaque key for one installed entry.
 *
 * The browser half never handles a real path: it holds this hash and asks the
 * host to act on it, and the host re-resolves the key against a fresh scan. A
 * caller-supplied path would be an arbitrary-file primitive.
 */
export declare function installedEntryKey(dir: string): string;
/**
 * Scan every root and return the inventory, first occurrence of a directory
 * winning.
 *
 * Roots are ordered most specific first, so the install root's record is the one
 * kept when the same directory is reachable through two of them (a configured
 * root that happens to *be* the harness home, or a symlinked root).
 */
export declare function scanInstalledSkills(roots: readonly string[]): Promise<ScannedSkillRecord[]>;
/** A lookup over one scan, as the market layer consumes it. */
export declare function installedLookupFrom(records: readonly ScannedSkillRecord[]): {
    has: (id: string) => boolean;
    info: (id: string) => {
        version?: string;
        installedAt?: string;
        dirName: string;
    } | undefined;
};
/** Resolve one opaque key against a fresh scan. */
export declare function findInstalledEntry(roots: readonly string[], key: string): Promise<ScannedSkillRecord | undefined>;
/** One file of an installed skill, as the file tab lists it. */
export interface InstalledFileEntry {
    path: string;
    size: number;
    language: string;
}
/**
 * List the files of one installed skill directory.
 *
 * Dot-prefixed entries are skipped, which keeps this plugin's own sidecar out of
 * the file list — a reader should see the skill, not its bookkeeping. Symbolic
 * links are listed but not traversed.
 */
export declare function listEntryFiles(dir: string): Promise<InstalledFileEntry[]>;
/**
 * Raw frontmatter text of a document, or `null`.
 *
 * Reported verbatim rather than re-serialized from the parsed mapping: a reader
 * comparing the panel against the file must see the author's own formatting.
 */
export declare function rawFrontmatterText(content: string): string | null;
//# sourceMappingURL=installed.d.ts.map