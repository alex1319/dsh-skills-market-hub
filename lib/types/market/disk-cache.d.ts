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
/** Store limits. */
export interface DiskCacheLimits {
    /** Maximum number of records kept. */
    maxRecords: number;
    /** Maximum size of one serialized record. */
    maxRecordBytes: number;
    /** Maximum total size of the store. */
    maxTotalBytes: number;
    /** Temporary files older than this are orphans from a crashed write. */
    orphanTtlMs: number;
}
export interface DiskCacheOptions {
    directory: string;
    limits?: Partial<DiskCacheLimits>;
    /** Reports a degraded store; called at most once per operation. */
    onError?: (error: unknown) => void;
}
/** What a read found. */
export interface DiskCacheRead<T> {
    /** The stored value, when the record existed and parsed. */
    value: T;
    /** When upstream was read for this value. */
    fetchedAt: number;
    /** Whether the record is past its expiry (a caller may still serve it as stale). */
    expired: boolean;
}
export declare class DiskCache {
    readonly directory: string;
    private readonly limits;
    private readonly onError;
    /** Serializes writes so two concurrent publishes cannot interleave their eviction pass. */
    private queue;
    constructor(options: DiskCacheOptions);
    /** Record file name for a key: a hash, so no key shape can escape the directory. */
    private fileFor;
    private report;
    /**
     * Read one record.
     *
     * @returns the record, or `null` when it is absent, unreadable, or does not
     *   belong to this key. An expired record is still returned, flagged: the
     *   market layer decides whether stale data may be served (only as a fallback
     *   when upstream is unreachable) or must be refreshed.
     */
    read<T>(key: string, now?: number): Promise<DiskCacheRead<T> | null>;
    /**
     * Write one record, then run the eviction pass.
     *
     * @param key - the cache key.
     * @param value - the JSON-serializable value.
     * @param ttlMs - how long the record stays fresh.
     * @param fetchedAt - when upstream was read; defaults to now.
     * @returns whether the record was stored.
     */
    write<T>(key: string, value: T, ttlMs: number, fetchedAt?: number): Promise<boolean>;
    /** Remove one record. */
    remove(key: string): Promise<void>;
    /** Remove every record (used when the provider configuration changes). */
    clear(): Promise<void>;
    /**
     * Enforce the store's bounds.
     *
     * Runs oldest-first, which is the right order here: the oldest record is the
     * one closest to expiry, so eviction costs the least useful data. Temporary
     * files past their grace period are removed in the same pass — a process that
     * died mid-write leaves them behind, and nothing else ever looks at them.
     */
    private evict;
}
//# sourceMappingURL=disk-cache.d.ts.map