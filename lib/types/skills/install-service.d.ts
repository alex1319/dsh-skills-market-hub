/**
 * Install and uninstall skills.
 *
 * Every guarantee here exists because the alternative is a broken skills
 * directory that the user cannot easily repair:
 *
 *  - **Nothing is written into the skills root until it is complete.** Files are
 *    fetched and verified in a sibling staging directory (dot-prefixed, so the
 *    inventory scan ignores it) and the whole tree is published with one `rename`.
 *    A crash, a cancelled request, or a failed checksum therefore leaves either no
 *    skill or a whole skill — never half of one that the harness would then try to
 *    load.
 *  - **Every byte is checksummed when the registry offers a hash.** A mismatch
 *    aborts the install rather than publishing a file the registry did not
 *    describe.
 *  - **Ownership is proved before anything is deleted.** The sidecar's `id` must
 *    name the exact skill; a directory this plugin did not write is never removed,
 *    however much it looks like the one the caller meant.
 *  - **Removal renames out of the namespace first.** An interrupted uninstall
 *    leaves a dot-prefixed directory rather than a partially deleted skill.
 */
import { installedLookup } from '../market/market-service.ts';
import { type MarketFileContent, type MarketFileMeta, type MarketSource, type NormalizedSkill } from '../market/types.ts';
import { type InstalledSkillRecord } from './installed.ts';
/**
 * Attempts and backoff for the one operation a filesystem filter can veto.
 *
 * `rename` onto a free name is the atomic publish, and on Windows it is the step
 * an antivirus scanner, the search indexer, or a cloud-sync agent can refuse with
 * `EPERM` while it holds a handle on the directory that was just created. That is
 * a transient veto with a confusing name: the same call succeeds milliseconds
 * later. Before this loop existed, one such veto failed the whole install *and*
 * left the staging directory behind, because the cleanup could not remove a
 * directory that was still held either.
 */
export declare const RENAME_ATTEMPTS = 6;
export declare const RENAME_BACKOFF_MS = 60;
/**
 * One install/uninstall failure, carrying the HTTP status the route layer reports.
 *
 * The status travels with the error rather than being re-derived from the code,
 * so there is exactly one place that can get the mapping wrong.
 */
export declare class SkillOperationError extends Error {
    readonly status: number;
    readonly code: string;
    constructor(status: number, code: string, message: string);
}
/** Error codes this module raises. */
export declare const OPERATION_CODES: {
    readonly installInProgress: "MARKET_INSTALL_IN_PROGRESS";
    readonly alreadyInstalled: "MARKET_ALREADY_INSTALLED";
    readonly notInstallable: "MARKET_NOT_INSTALLABLE";
    readonly checksumMismatch: "MARKET_CHECKSUM_MISMATCH";
    readonly diskError: "MARKET_DISK_ERROR";
    readonly notInstalled: "MARKET_NOT_INSTALLED";
    readonly notManaged: "MARKET_NOT_MANAGED";
    readonly uninstallDisabled: "MARKET_NOT_MANAGED";
    readonly fileTooLarge: "FILE_TOO_LARGE";
};
/**
 * Whether a registry-supplied path is safe to join onto a destination.
 *
 * The rules are deliberately strict, because this is the one place where an
 * untrusted string becomes a filesystem write: no absolute paths, no backslashes
 * (a Windows path separator that `nodePath.posix` would treat as a filename
 * character), no NUL, no `..` after normalization, and no empty or dot segments.
 *
 * The path must also **already be canonical** (`./a`, `a//b`, and `a/./b` are
 * refused rather than normalized). Two spellings of one destination would let an
 * inventory list the same file twice, write it twice, and record two ledger
 * entries for one document — and a reader could not address the file back,
 * because only one spelling can round-trip.
 */
export declare function isSafeRelativeFilePath(filePath: string): boolean;
/** SHA-256 of a string's UTF-8 bytes. */
export declare function sha256Hex(content: string): string;
/** Drop the in-flight table (tests; a reload must not inherit another instance's locks). */
export declare function resetInstallLocks(): void;
/**
 * Whether this is the filesystem's way of saying "not right now".
 *
 * `EPERM` is the one that matters and the one that misleads: on Windows it is what
 * a scanner holding a handle produces, not an authorization problem. `EBUSY` is
 * the same story told by a different layer.
 */
export declare function isTransientLock(error: unknown): boolean;
/**
 * The plugin's working directory for one skills root.
 *
 * A sibling of the root, never inside it — see {@link WORK_DIR_NAME}. Derived
 * rather than configured so an existing profile needs no migration: the path is
 * a pure function of the root it belongs to.
 */
export declare function workDirectoryFor(skillsRoot: string): string;
/**
 * Remove staging directories left behind by earlier attempts.
 *
 * A leftover is not just clutter: it is a directory that the attempt which created
 * it could not delete, which means something on this machine is holding a handle
 * on it. In the old layout that was also enough to stop the harness from loading
 * at all, which is why this sweeps the work directory *and* the legacy location.
 *
 * @returns the paths that are still there, so the caller can log them.
 */
export declare function sweepStagingDirectories(skillsRoot: string, options?: {
    delay?: (ms: number) => Promise<void>;
    fs?: PublishFs;
}): Promise<string[]>;
export interface InstallOptions {
    skillsRoot: string;
    /** The author the caller pinned, when the registry's slugs are shared. */
    owner?: string;
    /**
     * Called with the absolute path of a staging directory that could not be
     * removed — an earlier attempt's leftover, or this attempt's own.
     *
     * The host logs it. It is not an error the caller can act on (the install it
     * asked for may have succeeded), which is exactly why it must not be silent.
     */
    onStuckStaging?: (stagingPath: string) => void;
    /** Sleep between publish attempts; injectable so a test does not wait for real. */
    delay?: (ms: number) => Promise<void>;
    /** The three filesystem calls the publish path makes; see {@link PublishFs}. */
    fs?: PublishFs;
}
/**
 * The filesystem calls the publish path makes, behind one seam.
 *
 * The failures this path has to survive are races — a Windows scanner holding a
 * handle on a directory that was just created — and a race cannot be arranged on
 * demand. Two ways to test the response to one: patch `node:fs/promises`
 * globally, which an ES module namespace refuses, or hand the operation in. This
 * is the second, and it is also the honest description of what the code needs.
 */
export interface PublishFs {
    rename(from: string, to: string): Promise<void>;
    rm(target: string): Promise<void>;
    exists(target: string): Promise<boolean>;
}
export interface InstallResult {
    installedPath: string;
    skill: NormalizedSkill;
}
/**
 * Validate a file inventory against every install limit.
 *
 * @throws {@link SkillOperationError} describing the first limit that fails.
 */
export declare function assertInstallableInventory(files: readonly MarketFileMeta[]): void;
/**
 * Install one market skill.
 *
 * @throws {@link SkillOperationError} with the status the route layer reports.
 */
export declare function installMarketSkill(source: MarketSource, slug: string, options: InstallOptions): Promise<InstallResult>;
export interface UninstallOptions {
    skillsRoot: string;
    /** Whether removal is permitted at all. */
    allowUninstall: boolean;
}
/**
 * Remove a skill this plugin installed.
 *
 * @throws {@link SkillOperationError} when removal is disabled, when nothing is
 *   there, or when the directory cannot be proved to be this plugin's work.
 */
export declare function uninstallMarketSkill(source: MarketSource, slug: string, options: UninstallOptions): Promise<{
    removedPath: string;
    skill: NormalizedSkill;
}>;
/**
 * Remove one installed entry addressed by its opaque key.
 *
 * The key is resolved against a **fresh** scan, so a caller can only ever act on
 * an entry the current disk state actually describes.
 */
export declare function uninstallInstalledEntry(roots: readonly string[], key: string, options: {
    skillsRoot: string;
    allowUninstall: boolean;
}): Promise<{
    removedPath: string;
    item: InstalledSkillRecord;
}>;
export interface InstalledDetail {
    item: InstalledSkillRecord;
    markdown: string;
    frontmatter: string | null;
    files: Array<{
        path: string;
        size: number;
        language: string;
    }>;
}
/**
 * Read one installed skill's document and file list.
 *
 * The key is resolved against a **fresh** scan, so the reader sees the disk as it
 * is now. A cached inventory would hide a skill the user just copied in and keep
 * offering one they just deleted.
 *
 * @throws {@link SkillOperationError} when the key matches nothing, or the
 *   document is over the reader's size limit.
 */
export declare function readInstalledSkill(roots: readonly string[], key: string): Promise<InstalledDetail>;
/**
 * Read one file of an installed skill.
 *
 * Containment is checked twice: once against the entry's directory and once
 * against the resolved real path, so a symbolic link inside the skill cannot be
 * used to read a file outside it.
 */
export declare function readInstalledEntryFile(roots: readonly string[], key: string, filePath: string): Promise<MarketFileContent>;
/** The installed lookup the market layer annotates with; refreshed after a change. */
export { installedLookup };
//# sourceMappingURL=install-service.d.ts.map