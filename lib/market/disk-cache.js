/**
 * Persistent snapshot store for market reads.
 *
 * Only *upstream* data is cached here — list pages, search pages, details, file
 * contents. Installed state is never cached: it is a filesystem fact that the
 * market layer recomputes on every request (`annotateInstallState`), because a
 * stale "installable" is how a user ends up re-downloading a skill they already
 * have, and a stale "installed" hides a skill they deleted by hand.
 *
 * Design notes:
 *
 *  - **Atomic writes.** Each record is written to a temporary file in the store
 *    directory and then `rename`d into place, so a crash mid-write can never
 *    leave a half-parsed record for the next boot to trip over.
 *  - **Bounded.** Record count, per-record size, and total size all have caps;
 *    the eviction pass runs on write and also clears temporary files left behind
 *    by a process that died mid-write.
 *  - **Provenance is preserved.** A record keeps the moment upstream was actually
 *    read (`fetchedAt`); serving a hit must not restamp it, or the panel's "as of
 *    when" line becomes a lie that grows fresher the longer you leave it open.
 *  - **Failure is never fatal.** Every operation here is best-effort: a read-only
 *    home, a full disk, or a corrupt record degrades to "no snapshot" and the
 *    caller goes to upstream.
 */
import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
const DEFAULT_LIMITS = {
    maxRecords: 500,
    maxRecordBytes: 5 * 1024 * 1024,
    maxTotalBytes: 64 * 1024 * 1024,
    orphanTtlMs: 60 * 60 * 1000,
};
export class DiskCache {
    directory;
    limits;
    onError;
    /** Serializes writes so two concurrent publishes cannot interleave their eviction pass. */
    queue = Promise.resolve();
    constructor(options) {
        this.directory = options.directory;
        this.limits = { ...DEFAULT_LIMITS, ...options.limits };
        this.onError = options.onError;
    }
    /** Record file name for a key: a hash, so no key shape can escape the directory. */
    fileFor(key) {
        const digest = createHash('sha256').update(key, 'utf8').digest('hex');
        return path.join(this.directory, `${digest}.json`);
    }
    report(error) {
        this.onError?.(error);
    }
    /**
     * Read one record.
     *
     * @returns the record, or `null` when it is absent, unreadable, or does not
     *   belong to this key. An expired record is still returned, flagged: the
     *   market layer decides whether stale data may be served (only as a fallback
     *   when upstream is unreachable) or must be refreshed.
     */
    async read(key, now = Date.now()) {
        try {
            const raw = await fs.readFile(this.fileFor(key), 'utf8');
            const record = JSON.parse(raw);
            if (record.key !== key) {
                // The file belongs to a different key: a hash collision or a leftover
                // from a key that was renamed. Treat it as absent and let it be replaced.
                return null;
            }
            return { value: record.value, fetchedAt: record.fetchedAt, expired: record.expiresAt <= now };
        }
        catch (error) {
            if (!isMissing(error)) {
                // A corrupt record is dropped rather than reported forever: the next
                // write replaces it, and a read must not fail because of it.
                this.report(error);
                await fs.rm(this.fileFor(key), { force: true }).catch(() => undefined);
            }
            return null;
        }
    }
    /**
     * Write one record, then run the eviction pass.
     *
     * @param key - the cache key.
     * @param value - the JSON-serializable value.
     * @param ttlMs - how long the record stays fresh.
     * @param fetchedAt - when upstream was read; defaults to now.
     * @returns whether the record was stored.
     */
    async write(key, value, ttlMs, fetchedAt = Date.now()) {
        const task = this.queue.then(async () => {
            let serialized;
            try {
                serialized = JSON.stringify({
                    key,
                    fetchedAt,
                    expiresAt: fetchedAt + ttlMs,
                    value,
                });
            }
            catch (error) {
                this.report(error);
                return false;
            }
            if (Buffer.byteLength(serialized, 'utf8') > this.limits.maxRecordBytes) {
                // Too large to keep: storing a truncated record would be worse than
                // storing nothing, because it would parse and then lie.
                return false;
            }
            const target = this.fileFor(key);
            const temporary = path.join(this.directory, `.tmp-${randomUUID()}`);
            try {
                await fs.mkdir(this.directory, { recursive: true });
                await fs.writeFile(temporary, serialized, { encoding: 'utf8', mode: 0o600 });
                await fs.rename(temporary, target);
            }
            catch (error) {
                this.report(error);
                await fs.rm(temporary, { force: true }).catch(() => undefined);
                return false;
            }
            await this.evict().catch((error) => { this.report(error); });
            return true;
        });
        // Keep the chain alive even when one write fails, so a single error cannot
        // stall every later write.
        this.queue = task.then(() => undefined, () => undefined);
        return task;
    }
    /** Remove one record. */
    async remove(key) {
        await fs.rm(this.fileFor(key), { force: true }).catch(() => undefined);
    }
    /** Remove every record (used when the provider configuration changes). */
    async clear() {
        await fs.rm(this.directory, { recursive: true, force: true }).catch((error) => { this.report(error); });
    }
    /**
     * Enforce the store's bounds.
     *
     * Runs oldest-first, which is the right order here: the oldest record is the
     * one closest to expiry, so eviction costs the least useful data. Temporary
     * files past their grace period are removed in the same pass — a process that
     * died mid-write leaves them behind, and nothing else ever looks at them.
     */
    async evict() {
        let entries;
        try {
            entries = await fs.readdir(this.directory);
        }
        catch (error) {
            if (!isMissing(error))
                this.report(error);
            return;
        }
        const now = Date.now();
        const records = [];
        let totalBytes = 0;
        for (const entry of entries) {
            const file = path.join(this.directory, entry);
            let stats;
            try {
                stats = await fs.stat(file);
            }
            catch {
                continue;
            }
            if (!stats.isFile())
                continue;
            if (entry.startsWith('.tmp-')) {
                if (now - stats.mtimeMs > this.limits.orphanTtlMs)
                    await fs.rm(file, { force: true }).catch(() => undefined);
                continue;
            }
            if (!entry.endsWith('.json'))
                continue;
            records.push({ file, size: stats.size, mtime: stats.mtimeMs });
            totalBytes += stats.size;
        }
        records.sort((a, b) => a.mtime - b.mtime);
        // Decide how many of the oldest records must go: enough to satisfy both the
        // count cap and the byte cap. Computing the prefix once keeps the two bounds
        // from fighting over the same loop variable.
        let excessCount = Math.max(0, records.length - this.limits.maxRecords);
        let excessBytes = Math.max(0, totalBytes - this.limits.maxTotalBytes);
        let index = 0;
        while (index < records.length && (excessCount > 0 || excessBytes > 0)) {
            const record = records[index];
            excessCount -= 1;
            excessBytes -= record.size;
            await fs.rm(record.file, { force: true }).catch(() => undefined);
            index += 1;
        }
    }
}
/** Whether an error is "the file is not there", which is not a failure. */
function isMissing(error) {
    return typeof error === 'object' && error !== null && error.code === 'ENOENT';
}
//# sourceMappingURL=disk-cache.js.map