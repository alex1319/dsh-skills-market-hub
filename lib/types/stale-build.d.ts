/**
 * Stale-build detection.
 *
 * The failure this exists for: a `file:` dependency is materialised as a **copy**,
 * so a profile that points at a working directory keeps whatever `lib/` existed at
 * install time. Edit, rebuild, restart — and the profile loads the previous build
 * while looking perfectly installed. That is not hypothetical: it is how a fix
 * that had been written, tested, and committed failed to reach the GUI during
 * this project's own 0.1.1 verification, and the symptom (an already-fixed error
 * message) points anywhere but at the build.
 *
 * Two ways to handle that, and only one of them is good:
 *
 *  - **Refuse to install.** Tried, and rejected. A `postinstall` hook that
 *    rebuilds makes the *install itself* fail under a package manager that
 *    sandboxes dependency scripts (`ERR_PNPM_IGNORED_BUILDS` on pnpm 11+). Trading
 *    a stale build for a broken install is a worse deal, and it breaks the one
 *    path a user is most likely to take.
 *  - **Notice and say so.** The shipped code carries {@link PLUGIN_VERSION}; the
 *    tree carries `package.json`. When they disagree, the code that is running was
 *    not built from the tree beside it. That is a cheap, exact signal, and it
 *    turns a silent wrong-version run into one line in the host log.
 *
 * The check is deliberately narrow. Version mismatch is the *only* thing it
 * claims: it cannot detect a rebuild that changed behaviour without changing the
 * version, and it should not pretend to. A partial signal that is always right
 * beats a broad one that sometimes cries wolf.
 */
/** What the check found, for callers that want to assert on it. */
export interface StaleBuildReport {
    /** Version compiled into the code that is running. */
    builtVersion: string;
    /** Version declared by the `package.json` beside that code, when readable. */
    manifestVersion?: string;
    /** Absolute path of the manifest that was read, when one was. */
    manifestPath?: string;
    /** Whether the two disagree. */
    stale: boolean;
}
/**
 * Compare the running build's version against the manifest of the package it was
 * loaded from.
 *
 * @param builtVersion - the version compiled into the running code.
 * @param moduleUrl - `import.meta.url` of the module asking; used to locate the
 *   package the code was loaded from.
 * @param packageName - the manifest's `name` must be this, so an unrelated
 *   `package.json` further up the tree cannot be mistaken for the plugin's own.
 * @returns the comparison, with `stale: false` whenever no matching manifest could
 *   be read — a missing manifest is not evidence of a stale build.
 */
export declare function detectStaleBuild(builtVersion: string, moduleUrl: string, packageName: string): StaleBuildReport;
/**
 * The sentence an operator sees when the loaded build is not the one beside it.
 *
 * Exported so the wording is asserted rather than re-typed: the whole value of
 * this check is that the message says what to do.
 */
export declare function staleBuildWarning(report: StaleBuildReport): string;
//# sourceMappingURL=stale-build.d.ts.map