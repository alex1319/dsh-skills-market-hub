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

import { createHash, randomUUID } from 'node:crypto'
// Named `nodeFs`/`nodePath` so the local `fs`/`path` identifiers stay free for this
// module's own values — the publish path takes a filesystem seam, and a global
// namespace shadowed by accident is a mistake that only surfaces at runtime.
import * as nodeFs from 'node:fs/promises'
import * as nodePath from 'node:path'
import { skillHeadline, skillReadinessIssue } from '../market/frontmatter.ts'
import { getMarketSkillDetail, installedLookup, provider, applyFileLimits } from '../market/market-service.ts'
import {
  MARKET_LIMITS,
  detectMarketLanguage,
  sanitizeDirName,
  skillId,
  type MarketFileContent,
  type MarketFileMeta,
  type MarketSource,
  type NormalizedSkill,
  type NormalizedSkillDetail,
} from '../market/types.ts'
import { isInside, resolveInside } from './root.ts'
import {
  INSTALL_META_FILE,
  findInstalledEntry,
  listEntryFiles,
  publishInstalledRecord,
  rawFrontmatterText,
  readInstalledMeta,
  scanInstalledSkills,
  serializeInstalledMeta,
  type InstalledMeta,
  type InstalledSkillRecord,
} from './installed.ts'

/** Prefix of the staging directory a partial install lives in. */
const STAGING_PREFIX = '.skills-market-hub-install-'
/** Prefix of the directory a removal is renamed into before deletion. */
const TRASH_PREFIX = '.skills-market-hub-trash-'
/**
 * Name of the plugin's own working directory, created **beside** the skills root.
 *
 * It used to be unnecessary: staging and trash were dot-prefixed directories
 * *inside* the skills root, on the reasoning that the harness's own scanner skips
 * dot-prefixed entries. That reasoning was wrong, and the cost was severe.
 *
 * DSH discovers skills by listing the skills root and, for every **directory**
 * entry, resolving `<entry>/SKILL.md`. It tolerates only `ENOENT`/`ENOTDIR` when
 * that resolution fails. A staging directory whose cleanup failed — which is
 * exactly what a held handle produces, the same `EPERM` the publish retry exists
 * for — therefore makes the whole load throw:
 *
 *     dsh: fatal load failure: [Error: EPERM: operation not permitted,
 *       realpath '…\.dsh\skills\.skills-market-hub-install-w4aJou']
 *
 * Not "one skill is missing": the harness refuses to start, and every installed
 * skill disappears from the slash menu. A dot prefix hides an entry from a scan
 * that reads names; it does not hide it from one that resolves paths.
 *
 * So the plugin no longer puts directories in the skills root at all. The work
 * directory is a sibling of the root, which keeps the publish `rename` on one
 * volume (still atomic) while leaving the scanned directory holding nothing but
 * skills.
 */
const WORK_DIR_NAME = '.skills-market-hub-work'
/** Longest accepted relative file path inside a skill. */
const MAX_FILE_PATH_LENGTH = 512
/** Longest `SKILL.md` accepted by the installed-detail reader. */
const MAX_SKILL_FILE_BYTES = 2 * 1024 * 1024

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
export const RENAME_ATTEMPTS = 6
export const RENAME_BACKOFF_MS = 60

/**
 * One install/uninstall failure, carrying the HTTP status the route layer reports.
 *
 * The status travels with the error rather than being re-derived from the code,
 * so there is exactly one place that can get the mapping wrong.
 */
export class SkillOperationError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'SkillOperationError'
  }
}

/** Error codes this module raises. */
export const OPERATION_CODES = {
  installInProgress: 'MARKET_INSTALL_IN_PROGRESS',
  alreadyInstalled: 'MARKET_ALREADY_INSTALLED',
  notInstallable: 'MARKET_NOT_INSTALLABLE',
  checksumMismatch: 'MARKET_CHECKSUM_MISMATCH',
  diskError: 'MARKET_DISK_ERROR',
  notInstalled: 'MARKET_NOT_INSTALLED',
  notManaged: 'MARKET_NOT_MANAGED',
  uninstallDisabled: 'MARKET_NOT_MANAGED',
  fileTooLarge: 'FILE_TOO_LARGE',
} as const

// ──── Path safety ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

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
export function isSafeRelativeFilePath(filePath: string): boolean {
  if (typeof filePath !== 'string') return false
  if (filePath === '' || filePath.length > MAX_FILE_PATH_LENGTH) return false
  if (filePath.includes('\0') || filePath.includes('\\')) return false
  if (filePath.startsWith('/')) return false
  const normalized = nodePath.posix.normalize(filePath)
  if (normalized !== filePath) return false
  if (normalized.startsWith('..') || normalized.startsWith('/')) return false
  if (normalized === '.') return false
  return normalized.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..')
}

/** SHA-256 of a string's UTF-8 bytes. */
export function sha256Hex(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

// ──── Install ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Install coordination, keyed by the *normalized directory* a skill would occupy. */
const inFlight = new Map<string, Promise<unknown>>()

/**
 * Staging directories an attempt is using right now.
 *
 * The orphan sweep below removes leftovers from *previous* attempts; without this
 * set it would happily delete the staging directory of a concurrent install that
 * has not published yet.
 */
const activeStaging = new Set<string>()

/** Drop the in-flight table (tests; a reload must not inherit another instance's locks). */
export function resetInstallLocks(): void {
  inFlight.clear()
  activeStaging.clear()
}

/** One `Error`, optionally carrying the operating system's own error code. */
function isErrorCode(error: unknown, ...codes: string[]): boolean {
  const code = (error as { code?: unknown } | null)?.code
  return typeof code === 'string' && codes.includes(code)
}

/**
 * Whether this is the filesystem's way of saying "not right now".
 *
 * `EPERM` is the one that matters and the one that misleads: on Windows it is what
 * a scanner holding a handle produces, not an authorization problem. `EBUSY` is
 * the same story told by a different layer.
 */
export function isTransientLock(error: unknown): boolean {
  return isErrorCode(error, 'EPERM', 'EACCES', 'EBUSY')
}

/** Default sleep, injectable so a test can assert the retry without waiting for it. */
function defaultDelay(ms: number): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, ms) })
}

/**
 * Run an operation that a filesystem filter may veto for a moment.
 *
 * @returns the operation's value, or the last failure when every attempt failed.
 */
async function withLockRetry<T>(
  attempt: () => Promise<T>,
  attempts: number,
  delay: (ms: number) => Promise<void>,
): Promise<T> {
  let last: unknown
  for (let index = 0; index < attempts; index += 1) {
    try {
      return await attempt()
    } catch (error) {
      last = error
      // Anything that is not a held handle is a real answer: retrying an `ENOENT`
      // or an `ENOTEMPTY` would only make the caller wait for the same failure.
      if (!isTransientLock(error)) throw error
      if (index < attempts - 1) await delay(RENAME_BACKOFF_MS * (index + 1))
    }
  }
  throw last
}

/** `EPERM: operation not permitted, rename 'a' -> 'b'` — the OS text, without a stack. */
function errorDetail(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  return text.split('\n')[0]?.trim() ?? 'unknown error'
}

async function removeBestEffort(fs: PublishFs, target: string, delay: (ms: number) => Promise<void>): Promise<boolean> {
  try {
    await withLockRetry(async () => { await fs.rm(target) }, RENAME_ATTEMPTS, delay)
    return true
  } catch {
    return false
  }
}

/**
 * Publish the staged tree with the one atomic rename.
 *
 * @throws {@link SkillOperationError} naming the *actual* cause. Getting this
 *   classification wrong is expensive: `EPERM` (the destination is occupied) was
 *   reported as a generic disk error, so the reader staring at "publishing the
 *   skill failed" had no way to learn that a directory was in the way.
 */
async function publishStaging(
  fs: PublishFs,
  staging: string,
  destination: string,
  id: string,
  source: MarketSource,
  slug: string,
  delay: (ms: number) => Promise<void>,
): Promise<void> {
  try {
    await withLockRetry(async () => { await fs.rename(staging, destination) }, RENAME_ATTEMPTS, delay)
    return
  } catch (error) {
    // The rename result alone does not say which of these happened, and the
    // answers are different problems for the reader. Asking the disk settles it.
    if (await fs.exists(destination)) {
      const meta = await readInstalledMeta(destination, source, slug).catch(() => null)
      if (meta !== null && meta.id === id) {
        throw new SkillOperationError(409, OPERATION_CODES.alreadyInstalled, 'this skill is already installed')
      }
      throw new SkillOperationError(
        409,
        OPERATION_CODES.notInstallable,
        `something already occupies ${nodePath.basename(destination)} and this plugin did not put it there; move it aside by hand and retry`,
      )
    }

    if (!await fs.exists(staging)) {
      throw new SkillOperationError(500, OPERATION_CODES.diskError, 'the staged files disappeared before they could be published')
    }

    throw new SkillOperationError(
      500,
      OPERATION_CODES.diskError,
      isTransientLock(error)
        ? `the operating system refused to publish the skill after ${RENAME_ATTEMPTS} attempts (${errorDetail(error)}); a scanner, indexer, or sync tool may be holding the directory — retry, and remove ${nodePath.basename(staging)} by hand if it stays behind`
        : `publishing the skill failed (${errorDetail(error)})`,
    )
  }
}

/**
 * The plugin's working directory for one skills root.
 *
 * A sibling of the root, never inside it — see {@link WORK_DIR_NAME}. Derived
 * rather than configured so an existing profile needs no migration: the path is
 * a pure function of the root it belongs to.
 */
export function workDirectoryFor(skillsRoot: string): string {
  return nodePath.join(nodePath.dirname(nodePath.resolve(skillsRoot)), WORK_DIR_NAME)
}

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
export async function sweepStagingDirectories(
  skillsRoot: string,
  options: { delay?: (ms: number) => Promise<void>; fs?: PublishFs } = {},
): Promise<string[]> {
  const delay = options.delay ?? defaultDelay
  const fs = publishFs(options.fs)
  const stuck: string[] = []

  // The legacy location first: a directory here is the shape that can stop the
  // harness from starting, so it is the one worth clearing before anything else.
  for (const root of [skillsRoot, workDirectoryFor(skillsRoot)]) {
    let entries
    try {
      entries = await nodeFs.readdir(root, { withFileTypes: true })
    } catch {
      // A root that does not exist yet is not a problem to report: the first
      // install creates it, and an absent work directory is the normal state.
      continue
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      // In the work directory every entry is ours, so anything there is a
      // leftover. In the skills root only the two known prefixes are, and nothing
      // else may be touched — that directory belongs to the user.
      const ours = root === skillsRoot
        ? entry.name.startsWith(STAGING_PREFIX) || entry.name.startsWith(TRASH_PREFIX)
        : true
      if (!ours) continue

      const target = nodePath.join(root, entry.name)
      if (activeStaging.has(target)) continue
      if (!await removeBestEffort(fs, target, delay)) stuck.push(target)
    }
  }

  return stuck
}

export interface InstallOptions {
  skillsRoot: string
  /** The author the caller pinned, when the registry's slugs are shared. */
  owner?: string
  /**
   * Called with the absolute path of a staging directory that could not be
   * removed — an earlier attempt's leftover, or this attempt's own.
   *
   * The host logs it. It is not an error the caller can act on (the install it
   * asked for may have succeeded), which is exactly why it must not be silent.
   */
  onStuckStaging?: (stagingPath: string) => void
  /** Sleep between publish attempts; injectable so a test does not wait for real. */
  delay?: (ms: number) => Promise<void>
  /** The three filesystem calls the publish path makes; see {@link PublishFs}. */
  fs?: PublishFs
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
  rename(from: string, to: string): Promise<void>
  rm(target: string): Promise<void>
  exists(target: string): Promise<boolean>
}

const realFs: PublishFs = {
  rename: (from, to) => nodeFs.rename(from, to),
  rm: async (target) => { await nodeFs.rm(target, { recursive: true, force: true }) },
  exists: async (target) => await nodeFs.lstat(target).then(() => true, () => false),
}

function publishFs(override: PublishFs | undefined): PublishFs {
  return override ?? realFs
}

export interface InstallResult {
  installedPath: string
  skill: NormalizedSkill
}

/**
 * Validate a file inventory against every install limit.
 *
 * @throws {@link SkillOperationError} describing the first limit that fails.
 */
export function assertInstallableInventory(files: readonly MarketFileMeta[]): void {
  if (files.length === 0 || !files.some((file) => file.path.toLowerCase() === 'skill.md')) {
    throw new SkillOperationError(400, OPERATION_CODES.notInstallable, 'this skill has no SKILL.md')
  }
  if (files.length > MARKET_LIMITS.maxFileCount) {
    throw new SkillOperationError(400, OPERATION_CODES.notInstallable, `this skill has ${files.length} files, over the ${MARKET_LIMITS.maxFileCount} limit`)
  }
  const oversized = files.find((file) => file.size > MARKET_LIMITS.maxFileSize)
  if (oversized !== undefined) {
    throw new SkillOperationError(400, OPERATION_CODES.notInstallable, `the file ${oversized.path} is larger than the per-file limit`)
  }
  const total = files.reduce((sum, file) => sum + file.size, 0)
  if (total > MARKET_LIMITS.maxTotalSize) {
    throw new SkillOperationError(400, OPERATION_CODES.notInstallable, 'this skill is larger than the total install limit')
  }
  const unsafe = files.find((file) => !isSafeRelativeFilePath(file.path))
  if (unsafe !== undefined) {
    throw new SkillOperationError(400, OPERATION_CODES.notInstallable, `the file path ${unsafe.path} is not a safe relative path`)
  }
}

/**
 * Whether the destination is free.
 *
 * @throws {@link SkillOperationError} when something is already there. A directory
 *   this plugin installed is reported as "already installed"; anything else is a
 *   name conflict, because replacing it would destroy a skill the user wrote.
 */
async function assertInstallTargetFree(target: string, id: string, source: MarketSource, slug: string): Promise<void> {
  let stats
  try {
    stats = await nodeFs.lstat(target)
  } catch {
    return
  }
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new SkillOperationError(409, OPERATION_CODES.notInstallable, 'something that is not a skill directory already occupies that name')
  }
  const meta = await readInstalledMeta(target, source, slug)
  if (meta !== null && meta.id === id) {
    throw new SkillOperationError(409, OPERATION_CODES.alreadyInstalled, 'this skill is already installed')
  }
  throw new SkillOperationError(409, OPERATION_CODES.notInstallable, 'a different skill already occupies that directory; remove it by hand first')
}

/**
 * Read the exact inventory an install will write.
 *
 * This is a **forced** read: a cached file list or a cached security verdict must
 * never authorize writing bytes to disk, because the cache can be an hour old and
 * the registry can withdraw a version in that hour.
 */
async function loadInstallPlan(
  source: MarketSource,
  slug: string,
  options: InstallOptions,
): Promise<{ detail: NormalizedSkillDetail; files: MarketFileMeta[] }> {
  const target = provider(source)
  if (target === undefined) {
    throw new SkillOperationError(400, OPERATION_CODES.notInstallable, `no provider is configured for source ${source}`)
  }

  // The author argument is forwarded only to a registry that pins on it. Passing
  // it to one that ignores it would not change the answer, but it would make the
  // log and the cache key record a pin that has no effect.
  const pinnedOwner = target.pinsOwner ? options.owner : undefined

  const detail = await getMarketSkillDetail(source, slug, {
    force: true,
    allowStale: false,
    ...(pinnedOwner === undefined ? {} : { owner: pinnedOwner }),
  })

  // Only a registry that treats `owner` as a *pin* can disagree with us here.
  //
  // Where it does (ClawHub, where one slug is shared across authors), a resolved
  // author that is not the one the reader picked means the registry answered about
  // a different skill, and writing it would install a stranger's bytes under the
  // name on the card.
  //
  // Where it does not (SkillHub, whose detail route already fixes the account),
  // the argument is ignored upstream and the two handles are different fields of
  // the same account — the listing's account handle versus the detail's user
  // handle. Comparing them refuses a skill that was installable all along.
  if (target.pinsOwner && options.owner !== undefined && detail.author.handle !== options.owner) {
    throw new SkillOperationError(
      409,
      OPERATION_CODES.notInstallable,
      `the registry resolved this skill to the author "${detail.author.handle}", not "${options.owner}"; open it from the market list to install that author's version`,
    )
  }

  const annotated = applyFileLimits(detail, detail.files)
  if (annotated.installState === 'installed') {
    throw new SkillOperationError(409, OPERATION_CODES.alreadyInstalled, 'this skill is already installed')
  }
  if (annotated.installState === 'not-installable') {
    throw new SkillOperationError(400, OPERATION_CODES.notInstallable, 'this skill cannot be installed as published')
  }

  const files = detail.version === undefined
    ? detail.files
    : await target.listFiles(slug, {
        version: detail.version,
        ...(options.owner === undefined ? {} : { owner: options.owner }),
      })

  assertInstallableInventory(files)
  return { detail, files }
}

/**
 * Install one market skill.
 *
 * @throws {@link SkillOperationError} with the status the route layer reports.
 */
export async function installMarketSkill(
  source: MarketSource,
  slug: string,
  options: InstallOptions,
): Promise<InstallResult> {
  const dirName = sanitizeDirName(slug)
  if (dirName === null) {
    throw new SkillOperationError(400, OPERATION_CODES.notInstallable, 'this skill name cannot be used as a directory name')
  }

  const id = skillId(source, slug)
  // Keyed by the normalized directory name, so `clawhub:Demo` and `clawhub:demo`
  // — which would land in the same directory — cannot install concurrently.
  const lockKey = `${source}:${dirName}`
  const running = inFlight.get(lockKey)
  if (running !== undefined) {
    throw new SkillOperationError(409, OPERATION_CODES.installInProgress, 'this skill is already being installed')
  }

  const task = performInstall(source, slug, dirName, id, options)
  // Stored with a rejection handler so a failed install cannot surface as an
  // unhandled rejection and take the host process with it.
  inFlight.set(lockKey, task.catch(() => undefined))
  try {
    return await task
  } finally {
    inFlight.delete(lockKey)
  }
}

async function performInstall(
  source: MarketSource,
  slug: string,
  dirName: string,
  id: string,
  options: InstallOptions,
): Promise<InstallResult> {
  const target = provider(source)
  if (target === undefined) {
    throw new SkillOperationError(400, OPERATION_CODES.notInstallable, `no provider is configured for source ${source}`)
  }

  const { detail, files } = await loadInstallPlan(source, slug, options)
  const destination = resolveInside(options.skillsRoot, dirName)
  await assertInstallTargetFree(destination, id, source, slug)

  const fs = publishFs(options.fs)
  const delay = options.delay ?? defaultDelay

  await nodeFs.mkdir(options.skillsRoot, { recursive: true })
  // Clear anything an earlier attempt could not remove before adding to it: the
  // alternative is a skills root that accumulates one dead directory per failure.
  const leftovers = await sweepStagingDirectories(options.skillsRoot, { delay, ...(options.fs === undefined ? {} : { fs: options.fs }) })
  for (const leftover of leftovers) {
    options.onStuckStaging?.(leftover)
  }

  // Staged in the plugin's own work directory, which is a *sibling* of the skills
  // root: same volume, so the publishing `rename` is still atomic, but the scanned
  // directory never holds a non-skill entry. See `WORK_DIR_NAME` for what putting
  // it inside the root cost.
  const work = workDirectoryFor(options.skillsRoot)
  await nodeFs.mkdir(work, { recursive: true })
  const staging = await nodeFs.mkdtemp(nodePath.join(work, STAGING_PREFIX))
  activeStaging.add(staging)

  try {
    const ledger: Array<{ path: string; sha256: string }> = []
    let written = 0

    for (const file of files) {
      const fetched = await target.fetchFile(slug, {
        path: file.path,
        ...(options.owner === undefined ? {} : { owner: options.owner }),
      })

      const bytes = Buffer.byteLength(fetched.content, 'utf8')
      if (bytes > MARKET_LIMITS.maxFileSize) {
        throw new SkillOperationError(400, OPERATION_CODES.notInstallable, `the file ${file.path} grew past the per-file limit while downloading`)
      }
      written += bytes
      if (written > MARKET_LIMITS.maxTotalSize) {
        throw new SkillOperationError(400, OPERATION_CODES.notInstallable, 'this skill grew past the total limit while downloading')
      }

      const digest = sha256Hex(fetched.content)
      if (file.sha256 !== undefined && file.sha256 !== digest) {
        throw new SkillOperationError(502, OPERATION_CODES.checksumMismatch, `the file ${file.path} does not match the checksum the registry published`)
      }

      // Checked before anything is written, and only for the root document: this
      // is the file the harness reads to decide whether the directory is a skill
      // at all. Installing a skill the harness will silently drop is the one
      // outcome worse than refusing it — the reader gets a success, and then an
      // empty slash menu with nothing to explain it.
      if (file.path.toLowerCase() === 'skill.md') {
        const issue = skillReadinessIssue(fetched.content)
        if (issue !== undefined) {
          throw new SkillOperationError(
            400,
            OPERATION_CODES.notInstallable,
            `the skill's SKILL.md would be ignored by the harness, so it would never appear in the slash menu: ${issue}`,
          )
        }
      }

      const filePath = resolveInside(staging, ...file.path.split('/'))
      try {
        await nodeFs.mkdir(nodePath.dirname(filePath), { recursive: true })
        await nodeFs.writeFile(filePath, fetched.content, { encoding: 'utf8', mode: 0o644 })
      } catch {
        // Node's filesystem errors carry absolute paths; the reader gets a
        // sentence instead of a machine nodePath.
        throw new SkillOperationError(500, OPERATION_CODES.diskError, 'writing the skill to disk failed')
      }
      ledger.push({ path: file.path, sha256: digest })
    }

    const meta: InstalledMeta = {
      id,
      source,
      slug,
      installedAt: new Date().toISOString(),
      files: ledger,
      ...(detail.author.handle === undefined || detail.author.handle === '' ? {} : { owner: detail.author.handle }),
      ...(detail.version === undefined ? {} : { version: detail.version }),
    }
    await nodeFs.writeFile(nodePath.join(staging, INSTALL_META_FILE), serializeInstalledMeta(meta), { encoding: 'utf8', mode: 0o644 })

    // Re-check immediately before publishing: a manual install can land in the
    // window between the first check and this rename.
    await assertInstallTargetFree(destination, id, source, slug)
    await publishStaging(fs, staging, destination, id, source, slug, delay)

    const installedAt = meta.installedAt
    return {
      installedPath: destination,
      // Reported from what was actually written, without a second upstream read:
      // the files are on disk, and a failed re-read must not turn a successful
      // install into an error the caller sees.
      skill: {
        ...detail,
        installState: 'installed',
        installedInfo: { dirName, installedAt, ...(detail.version === undefined ? {} : { version: detail.version }) },
      },
    }
  } finally {
    activeStaging.delete(staging)
    // A no-op once the rename succeeded (the staging path no longer exists). The
    // result is *reported* rather than swallowed: a staging directory that cannot
    // be removed is the marker of a held handle on this machine, and a silent
    // failure here is what turns one failed install into an unexplained mess in
    // the user's skills directory.
    if (!await removeBestEffort(fs, staging, delay)) {
      options.onStuckStaging?.(staging)
    }
  }
}

// ──── Uninstall ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface UninstallOptions {
  skillsRoot: string
  /** Whether removal is permitted at all. */
  allowUninstall: boolean
}

/**
 * Remove a skill this plugin installed.
 *
 * @throws {@link SkillOperationError} when removal is disabled, when nothing is
 *   there, or when the directory cannot be proved to be this plugin's work.
 */
export async function uninstallMarketSkill(
  source: MarketSource,
  slug: string,
  options: UninstallOptions,
): Promise<{ removedPath: string; skill: NormalizedSkill }> {
  if (!options.allowUninstall) {
    throw new SkillOperationError(405, 'METHOD_NOT_ALLOWED', 'removing skills is disabled by configuration')
  }
  const dirName = sanitizeDirName(slug)
  if (dirName === null) {
    throw new SkillOperationError(404, OPERATION_CODES.notInstalled, 'no installed skill by that name')
  }

  const removed = await removeManagedDirectory(options.skillsRoot, dirName, source, slug)
  return {
    removedPath: removed.dir,
    // Removal already succeeded: reporting it must not depend on a later upstream
    // read, so the headline comes from what was on disk.
    skill: {
      id: skillId(source, slug),
      source,
      slug,
      name: removed.headline.name,
      summary: removed.headline.summary ?? '',
      author: { handle: removed.meta.owner ?? 'unknown' },
      stats: { downloads: 0 },
      tags: [],
      securityStatus: 'unknown',
      installState: 'installable',
      ...(removed.headline.summary === undefined ? {} : {}),
      ...(removed.meta.version === undefined ? {} : { version: removed.meta.version }),
    },
  }
}

/**
 * Remove one installed entry addressed by its opaque key.
 *
 * The key is resolved against a **fresh** scan, so a caller can only ever act on
 * an entry the current disk state actually describes.
 */
export async function uninstallInstalledEntry(
  roots: readonly string[],
  key: string,
  options: { skillsRoot: string; allowUninstall: boolean },
): Promise<{ removedPath: string; item: InstalledSkillRecord }> {
  if (!options.allowUninstall) {
    throw new SkillOperationError(405, 'METHOD_NOT_ALLOWED', 'removing skills is disabled by configuration')
  }
  const scanned = (await scanInstalledSkills(roots)).find((entry) => entry.key === key)
  if (scanned === undefined) {
    throw new SkillOperationError(404, OPERATION_CODES.notInstalled, 'no installed skill matches that key')
  }
  // Published from here on, so every return below carries the policy. The check at
  // the top of this function already proved it is `true`: a `false` one threw.
  const item = publishInstalledRecord(scanned, options.allowUninstall)

  if (item.linked) {
    // A link is someone else's skill reachable from here: removing it means
    // unlinking, never following the link and deleting the target.
    await nodeFs.unlink(item.dirPath).catch(() => {
      throw new SkillOperationError(500, OPERATION_CODES.diskError, 'removing the link failed')
    })
    return { removedPath: item.dirPath, item }
  }

  if (!item.dirPath.toLowerCase().endsWith('.md')) {
    // A directory only leaves when this plugin can prove it wrote it.
    if (!item.managed) {
      throw new SkillOperationError(409, OPERATION_CODES.notManaged, 'this skill was not installed by the market and will not be removed')
    }
    await removeManagedDirectory(nodePath.dirname(item.dirPath), item.dirName, item.source as MarketSource, item.slug)
    return { removedPath: item.dirPath, item }
  }

  // A flat `.md` skill has no sidecar and no directory; removing it is a single
  // unlink, and it is only offered for entries the caller explicitly selected.
  await nodeFs.unlink(item.dirPath).catch(() => {
    throw new SkillOperationError(500, OPERATION_CODES.diskError, 'removing the skill file failed')
  })
  return { removedPath: item.dirPath, item }
}

/**
 * Rename a managed directory out of the skills namespace, then delete it.
 *
 * The rename is the atomic step: an interruption between the two leaves a
 * dot-prefixed directory that the inventory ignores, rather than a half-deleted
 * skill the harness would try to load.
 */
async function removeManagedDirectory(
  skillsRoot: string,
  dirName: string,
  source: MarketSource,
  slug: string,
): Promise<{ dir: string; meta: InstalledMeta; headline: { name: string; summary?: string } }> {
  const target = resolveInside(skillsRoot, dirName)

  let stats
  try {
    stats = await nodeFs.lstat(target)
  } catch {
    throw new SkillOperationError(404, OPERATION_CODES.notInstalled, 'no installed skill by that name')
  }
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new SkillOperationError(409, OPERATION_CODES.notManaged, 'that entry is not a skill directory this market installed')
  }

  const meta = await readInstalledMeta(target, source, slug)
  if (meta === null) {
    throw new SkillOperationError(409, OPERATION_CODES.notManaged, 'this skill was not installed by the market and will not be removed')
  }

  // Read the headline before the directory goes away, so a removal that is
  // confirmed to the user can still name what was removed.
  const headline = await nodeFs.readFile(nodePath.join(target, 'SKILL.md'), 'utf8')
    .then((content) => {
      const parsed = skillHeadline(content, dirName)
      return { name: parsed.name ?? dirName, ...(parsed.summary === undefined ? {} : { summary: parsed.summary }) }
    })
    .catch(() => ({ name: dirName }))

  // Renamed into the work directory, not into the skills root: a removal that is
  // interrupted here must not leave a directory the harness will try to resolve
  // as a skill. Same volume, so the rename stays atomic.
  const work = workDirectoryFor(skillsRoot)
  await nodeFs.mkdir(work, { recursive: true })
  const trash = nodePath.join(work, `${TRASH_PREFIX}${dirName}-${randomUUID()}`)
  try {
    // The same veto the publish faces: a handle held on the skill directory makes
    // the rename fail with `EPERM` even though nothing is wrong with the request.
    await withLockRetry(async () => { await nodeFs.rename(target, trash) }, RENAME_ATTEMPTS, defaultDelay)
  } catch (error) {
    throw new SkillOperationError(
      500,
      OPERATION_CODES.diskError,
      isTransientLock(error)
        ? `the operating system refused to remove the skill (${errorDetail(error)}); something is holding a file inside this skill directory — retry, or close whatever has it open`
        : `removing the skill failed (${errorDetail(error)})`,
    )
  }
  await removeBestEffort(realFs, trash, defaultDelay)

  return { dir: target, meta, headline }
}

// ──── Installed reads ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface InstalledDetail {
  item: InstalledSkillRecord
  markdown: string
  frontmatter: string | null
  files: Array<{ path: string; size: number; language: string }>
}

/**
 * Read one installed skill's document and file list.
 *
 * The key is resolved against a **fresh** scan, so the reader sees the disk as it
 * is now. A cached inventory would hide a skill the user just copied in and keep
 * offering one they just deleted.
 *
 * `allowUninstall` is required rather than defaulted: this function publishes an
 * installed record to the browser, and a record published without the policy is
 * the defect that shipped in 0.1.10 — the detail view's uninstall button was
 * disabled for every skill, blaming a configuration that forbade nothing. Making
 * the parameter mandatory means a caller cannot omit it by not thinking about it.
 *
 * @throws {@link SkillOperationError} when the key matches nothing, or the
 *   document is over the reader's size limit.
 */
export async function readInstalledSkill(
  roots: readonly string[],
  key: string,
  options: { allowUninstall: boolean },
): Promise<InstalledDetail> {
  const scanned = await findInstalledEntry(roots, key)
  if (scanned === undefined) {
    throw new SkillOperationError(404, OPERATION_CODES.notInstalled, 'no installed skill matches that key')
  }
  const item = publishInstalledRecord(scanned, options.allowUninstall)

  const isFlat = item.dirPath.toLowerCase().endsWith('.md')
  const skillFile = isFlat ? item.dirPath : nodePath.join(item.dirPath, 'SKILL.md')
  let stats
  try {
    stats = await nodeFs.stat(skillFile)
  } catch {
    throw new SkillOperationError(404, OPERATION_CODES.notInstalled, 'this skill has no readable SKILL.md')
  }
  if (stats.size > MAX_SKILL_FILE_BYTES) {
    throw new SkillOperationError(413, OPERATION_CODES.fileTooLarge, 'this skill document is too large to preview')
  }

  const markdown = await nodeFs.readFile(skillFile, 'utf8')
  const files = item.linked || isFlat
    ? [{ path: nodePath.basename(skillFile), size: stats.size, language: 'markdown' }]
    : await listEntryFiles(item.dirPath)

  return { item, markdown, frontmatter: rawFrontmatterText(markdown), files }
}

/**
 * Read one file of an installed skill.
 *
 * Containment is checked twice: once against the entry's directory and once
 * against the resolved real path, so a symbolic link inside the skill cannot be
 * used to read a file outside it.
 */
export async function readInstalledEntryFile(
  roots: readonly string[],
  key: string,
  filePath: string,
): Promise<MarketFileContent> {
  const item = await findInstalledEntry(roots, key)
  if (item === undefined) {
    throw new SkillOperationError(404, OPERATION_CODES.notInstalled, 'no installed skill matches that key')
  }
  if (!isSafeRelativeFilePath(filePath)) {
    throw new SkillOperationError(400, 'BAD_REQUEST', 'that file path is not a safe relative path')
  }

  const base = item.dirPath.toLowerCase().endsWith('.md') ? nodePath.dirname(item.dirPath) : item.dirPath
  const target = nodePath.resolve(base, ...filePath.split('/'))
  if (!isInside(base, target)) {
    throw new SkillOperationError(400, 'BAD_REQUEST', 'that file is outside the skill directory')
  }

  let real: string
  try {
    real = await nodeFs.realpath(target)
  } catch {
    throw new SkillOperationError(404, OPERATION_CODES.notInstalled, 'no such file in this skill')
  }
  if (!isInside(await nodeFs.realpath(base), real)) {
    throw new SkillOperationError(400, 'BAD_REQUEST', 'that file escapes the skill directory')
  }

  let stats
  try {
    stats = await nodeFs.stat(real)
  } catch {
    throw new SkillOperationError(404, OPERATION_CODES.notInstalled, 'no such file in this skill')
  }
  if (!stats.isFile()) {
    throw new SkillOperationError(400, 'BAD_REQUEST', 'that path is not a regular file')
  }

  const limit = MARKET_LIMITS.previewTruncateBytes
  const handle = await nodeFs.open(real, 'r')
  try {
    const buffer = Buffer.alloc(Math.min(limit, stats.size))
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
    return {
      path: filePath,
      content: buffer.subarray(0, bytesRead).toString('utf8'),
      language: detectMarketLanguage(filePath),
      size: stats.size,
      truncated: stats.size > limit,
    }
  } finally {
    await handle.close()
  }
}

/** The installed lookup the market layer annotates with; refreshed after a change. */
export { installedLookup }
