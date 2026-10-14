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
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { skillHeadline } from '../market/frontmatter.ts'
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
/** Longest accepted relative file path inside a skill. */
const MAX_FILE_PATH_LENGTH = 512
/** Longest `SKILL.md` accepted by the installed-detail reader. */
const MAX_SKILL_FILE_BYTES = 2 * 1024 * 1024

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

// ── Path safety ─────────────────────────────────────────────────────────────

/**
 * Whether a registry-supplied path is safe to join onto a destination.
 *
 * The rules are deliberately strict, because this is the one place where an
 * untrusted string becomes a filesystem write: no absolute paths, no backslashes
 * (a Windows path separator that `path.posix` would treat as a filename
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
  const normalized = path.posix.normalize(filePath)
  if (normalized !== filePath) return false
  if (normalized.startsWith('..') || normalized.startsWith('/')) return false
  if (normalized === '.') return false
  return normalized.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..')
}

/** SHA-256 of a string's UTF-8 bytes. */
export function sha256Hex(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

// ── Install ─────────────────────────────────────────────────────────────────

/** Install coordination, keyed by the *normalized directory* a skill would occupy. */
const inFlight = new Map<string, Promise<unknown>>()

/** Drop the in-flight table (tests; a reload must not inherit another instance's locks). */
export function resetInstallLocks(): void {
  inFlight.clear()
}

export interface InstallOptions {
  skillsRoot: string
  /** The author the caller pinned, when the registry's slugs are shared. */
  owner?: string
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
    stats = await fs.lstat(target)
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

  await fs.mkdir(options.skillsRoot, { recursive: true })
  // Staging inside the destination's own parent makes the publishing `rename` a
  // same-filesystem operation, which is what makes it atomic.
  const staging = await fs.mkdtemp(path.join(options.skillsRoot, STAGING_PREFIX))

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

      const filePath = resolveInside(staging, ...file.path.split('/'))
      try {
        await fs.mkdir(path.dirname(filePath), { recursive: true })
        await fs.writeFile(filePath, fetched.content, { encoding: 'utf8', mode: 0o644 })
      } catch {
        // Node's filesystem errors carry absolute paths; the reader gets a
        // sentence instead of a machine path.
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
    await fs.writeFile(path.join(staging, INSTALL_META_FILE), serializeInstalledMeta(meta), { encoding: 'utf8', mode: 0o644 })

    // Re-check immediately before publishing: a manual install can land in the
    // window between the first check and this rename.
    await assertInstallTargetFree(destination, id, source, slug)
    try {
      await fs.rename(staging, destination)
    } catch (error) {
      const code = (error as { code?: unknown }).code
      if (code === 'ENOTEMPTY' || code === 'EEXIST' || code === 'ENOTDIR') {
        throw new SkillOperationError(409, OPERATION_CODES.notInstallable, 'a different skill already occupies that directory')
      }
      throw new SkillOperationError(500, OPERATION_CODES.diskError, 'publishing the skill failed')
    }

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
    // A no-op once the rename succeeded (the staging path no longer exists).
    await fs.rm(staging, { recursive: true, force: true }).catch(() => undefined)
  }
}

// ── Uninstall ───────────────────────────────────────────────────────────────

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
  const item = (await scanInstalledSkills(roots)).find((entry) => entry.key === key)
  if (item === undefined) {
    throw new SkillOperationError(404, OPERATION_CODES.notInstalled, 'no installed skill matches that key')
  }

  if (item.linked) {
    // A link is someone else's skill reachable from here: removing it means
    // unlinking, never following the link and deleting the target.
    await fs.unlink(item.dirPath).catch(() => {
      throw new SkillOperationError(500, OPERATION_CODES.diskError, 'removing the link failed')
    })
    return { removedPath: item.dirPath, item }
  }

  if (!item.dirPath.toLowerCase().endsWith('.md')) {
    // A directory only leaves when this plugin can prove it wrote it.
    if (!item.managed) {
      throw new SkillOperationError(409, OPERATION_CODES.notManaged, 'this skill was not installed by the market and will not be removed')
    }
    await removeManagedDirectory(path.dirname(item.dirPath), item.dirName, item.source as MarketSource, item.slug)
    return { removedPath: item.dirPath, item }
  }

  // A flat `.md` skill has no sidecar and no directory; removing it is a single
  // unlink, and it is only offered for entries the caller explicitly selected.
  await fs.unlink(item.dirPath).catch(() => {
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
    stats = await fs.lstat(target)
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
  const headline = await fs.readFile(path.join(target, 'SKILL.md'), 'utf8')
    .then((content) => {
      const parsed = skillHeadline(content, dirName)
      return { name: parsed.name ?? dirName, ...(parsed.summary === undefined ? {} : { summary: parsed.summary }) }
    })
    .catch(() => ({ name: dirName }))

  const trash = resolveInside(skillsRoot, `${TRASH_PREFIX}${dirName}-${randomUUID()}`)
  try {
    await fs.rename(target, trash)
  } catch {
    throw new SkillOperationError(500, OPERATION_CODES.diskError, 'removing the skill failed')
  }
  await fs.rm(trash, { recursive: true, force: true }).catch(() => undefined)

  return { dir: target, meta, headline }
}

// ── Installed reads ─────────────────────────────────────────────────────────

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
 * @throws {@link SkillOperationError} when the key matches nothing, or the
 *   document is over the reader's size limit.
 */
export async function readInstalledSkill(roots: readonly string[], key: string): Promise<InstalledDetail> {
  const item = await findInstalledEntry(roots, key)
  if (item === undefined) {
    throw new SkillOperationError(404, OPERATION_CODES.notInstalled, 'no installed skill matches that key')
  }

  const isFlat = item.dirPath.toLowerCase().endsWith('.md')
  const skillFile = isFlat ? item.dirPath : path.join(item.dirPath, 'SKILL.md')
  let stats
  try {
    stats = await fs.stat(skillFile)
  } catch {
    throw new SkillOperationError(404, OPERATION_CODES.notInstalled, 'this skill has no readable SKILL.md')
  }
  if (stats.size > MAX_SKILL_FILE_BYTES) {
    throw new SkillOperationError(413, OPERATION_CODES.fileTooLarge, 'this skill document is too large to preview')
  }

  const markdown = await fs.readFile(skillFile, 'utf8')
  const files = item.linked || isFlat
    ? [{ path: path.basename(skillFile), size: stats.size, language: 'markdown' }]
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

  const base = item.dirPath.toLowerCase().endsWith('.md') ? path.dirname(item.dirPath) : item.dirPath
  const target = path.resolve(base, ...filePath.split('/'))
  if (!isInside(base, target)) {
    throw new SkillOperationError(400, 'BAD_REQUEST', 'that file is outside the skill directory')
  }

  let real: string
  try {
    real = await fs.realpath(target)
  } catch {
    throw new SkillOperationError(404, OPERATION_CODES.notInstalled, 'no such file in this skill')
  }
  if (!isInside(await fs.realpath(base), real)) {
    throw new SkillOperationError(400, 'BAD_REQUEST', 'that file escapes the skill directory')
  }

  let stats
  try {
    stats = await fs.stat(real)
  } catch {
    throw new SkillOperationError(404, OPERATION_CODES.notInstalled, 'no such file in this skill')
  }
  if (!stats.isFile()) {
    throw new SkillOperationError(400, 'BAD_REQUEST', 'that path is not a regular file')
  }

  const limit = MARKET_LIMITS.previewTruncateBytes
  const handle = await fs.open(real, 'r')
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
