/**
 * Skills Market HTTP client (browser half).
 *
 * Every request goes to the host surface documented in `docs/CONTRACT.md`: one
 * prefix route under `/api/skills-market-hub`, JSON in and JSON out, errors
 * always shaped `{ error: { code, message } }`.
 *
 * Client purity: this module imports *types only* from the shared wire layer —
 * never a value from the host's `src/market/*`, which would drag Node code into
 * the browser bundle. The route prefix is likewise restated as a literal rather
 * than imported; `scripts/verify.mjs` asserts the two spellings agree.
 */
/** Host route prefix. Restated on purpose: the host module is Node code. */
export declare const API_BASE = "/api/skills-market-hub";
/** Registry identifiers, mirroring the host's `MarketSource`. */
export type MarketSource = 'clawhub' | 'skillhub';
export type SecurityStatus = 'verified' | 'benign' | 'unknown' | 'flagged';
export type InstallState = 'installed' | 'installable' | 'not-installable';
export type SourceHealthStatus = 'ok' | 'degraded' | 'failed' | 'cached';
export interface SecurityReport {
    vendor: string;
    status: string;
    statusText: string;
    reportUrl?: string;
    summary?: string;
}
/**
 * One classification chip.
 *
 * Both labels travel rather than one pre-chosen string, so the panel renders in
 * whichever language the shell is using without the host cache having to know
 * which one that is. `key` is the registry's stable identifier and is the last
 * resort for display — see `categoryLabelText` in `ui.tsx`.
 */
export interface CategoryRef {
    key: string;
    labelZh?: string;
    labelEn?: string;
}
export interface NormalizedSkill {
    id: string;
    source: MarketSource;
    slug: string;
    name: string;
    summary: string;
    author: {
        handle: string;
        displayName?: string;
        avatarUrl?: string;
    };
    stats: {
        downloads: number;
        installs?: number;
        stars?: number;
    };
    tags: string[];
    categories?: CategoryRef[];
    version?: string;
    updatedAt?: number;
    iconUrl?: string;
    securityStatus: SecurityStatus;
    securityReports?: SecurityReport[];
    requiresApiKey?: boolean;
    verified?: boolean;
    upstream?: {
        source: MarketSource;
        slug: string;
        owner?: string;
    };
    mirrors?: string[];
    installState: InstallState;
    notInstallableReason?: string;
    installedInfo?: {
        version?: string;
        installedAt?: string;
        dirName: string;
    };
}
export interface MarketFileMeta {
    path: string;
    size: number;
    sha256?: string;
    contentType?: string;
    language: string;
    tooBig: boolean;
}
export interface NormalizedSkillDetail extends NormalizedSkill {
    description: string;
    descriptionFrontmatter?: Record<string, unknown>;
    license?: string;
    files: MarketFileMeta[];
    totalSize: number;
    changelog?: {
        version?: string;
        text: string;
        publishedAt?: number;
    };
    pageUrl?: string;
}
export interface MarketFileContent {
    path: string;
    content: string;
    language: string;
    size: number;
    truncated: boolean;
}
export interface SourceStatusInfo {
    status: SourceHealthStatus;
    fetchedAt?: number;
    fromCache?: boolean;
    error?: string;
}
export interface MarketListResult {
    items: NormalizedSkill[];
    nextCursor: string | null;
    total?: number;
    sources: Record<MarketSource, SourceStatusInfo>;
}
/** One classification in a registry's published vocabulary. */
export interface MarketCategory {
    key: string;
    /** Chinese label; empty when the registry publishes none. */
    name: string;
    /** English label, when the registry publishes one. */
    nameEn?: string;
    sortOrder: number;
    parent?: string;
    level: number;
}
/**
 * One installed entry.
 *
 * Declared here rather than imported from the host: that module reads the
 * filesystem through `node:fs`, so importing it would drag Node code into the
 * browser program. The client only ever *reads* this shape out of JSON.
 */
export interface InstalledSkillRecord {
    key: string;
    linked: boolean;
    removable: boolean;
    id: string;
    source: MarketSource | 'local';
    slug: string;
    owner?: string;
    name: string;
    dirName: string;
    dirPath: string;
    version?: string;
    summary?: string;
    installedAt?: string;
    managed: boolean;
    bytes: number;
    fileCount: number;
}
export interface InstalledFileEntry {
    path: string;
    size: number;
    language: string;
}
export interface InstalledSkillDetail {
    item: InstalledSkillRecord;
    markdown: string;
    frontmatter: string | null;
    files: InstalledFileEntry[];
}
/** List query accepted by `GET /skills`. */
export interface MarketQuery {
    q?: string;
    source: 'all' | MarketSource;
    security: 'all' | SecurityStatus;
    installed: 'all' | 'installed' | 'installable';
    limit?: number;
    cursor?: string;
}
/** One failure from the Skills Market surface (transport, HTTP, or malformed body). */
export declare class SkillsMarketHubApiError extends Error {
    /** Host error code (`MARKET_*`, `BAD_REQUEST`, …) or a client-side code. */
    readonly code: string;
    /** HTTP status; `0` when the request never reached the host. */
    readonly status: number;
    constructor(code: string, status: number, message: string);
}
/**
 * Whether a rejection is an aborted request.
 *
 * `AbortError` is control flow, not a failure: the controller aborts superseded
 * requests on purpose, and surfacing one as a user-facing error would put a
 * spurious banner in front of a perfectly healthy panel. Checked by `name` (not
 * `instanceof`) because an abort may cross realms (iframes, workers).
 */
export declare function isAbortError(error: unknown): boolean;
/** Search the registries — the market list page. */
export declare function fetchMarketList(query: MarketQuery, signal?: AbortSignal, options?: {
    refresh?: boolean;
}): Promise<MarketListResult>;
/** One skill's full detail plus the health of the source that served it. */
export declare function fetchSkillDetail(id: string, signal?: AbortSignal, options?: {
    refresh?: boolean;
    owner?: string;
}): Promise<{
    skill: NormalizedSkillDetail;
    sourceStatus: SourceStatusInfo;
}>;
/** One file of a market skill, for the Files tab. */
export declare function fetchSkillFile(id: string, path: string, signal?: AbortSignal, owner?: string): Promise<MarketFileContent>;
/** Health of every market source, refreshed independently of the list. */
export declare function fetchSourceStatus(signal?: AbortSignal): Promise<Record<MarketSource, SourceStatusInfo>>;
/** The registries' classification vocabulary, for labelling cards and the filter bar. */
export declare function fetchCategories(signal?: AbortSignal): Promise<MarketCategory[]>;
/**
 * Every skill DSH can currently see, including directories this plugin did not
 * install (`managed: false`). This is the local index behind the "installed"
 * filter — no upstream request is involved.
 */
export declare function fetchInstalled(signal?: AbortSignal): Promise<InstalledSkillRecord[]>;
/** Install a market skill into the local skills directory. */
export declare function installSkill(id: string, owner?: string): Promise<{
    installedPath: string;
    skill: NormalizedSkill;
}>;
/** Remove a skill this plugin installed (the host refuses unmanaged directories). */
export declare function uninstallSkill(id: string): Promise<{
    removedPath: string;
    skill: NormalizedSkill;
}>;
/** Preview one installed skill: its document, its header, and its file list. */
export declare function fetchInstalledDetail(key: string, signal?: AbortSignal): Promise<InstalledSkillDetail>;
/** One file of an installed skill; the host validates the key and contains the path. */
export declare function fetchInstalledFile(key: string, path: string, signal?: AbortSignal): Promise<MarketFileContent>;
/** Remove a specifically selected local entry after the management UI confirmation. */
export declare function removeInstalled(key: string): Promise<{
    item: InstalledSkillRecord;
    removedPath: string;
}>;
//# sourceMappingURL=api.d.ts.map