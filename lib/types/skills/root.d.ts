/**
 * Skills-directory resolution.
 *
 * Two different questions are answered here, and they must not be conflated:
 *
 *  - {@link resolveSkillsRoot} — *where do we install?* Exactly one directory:
 *    the configured override, or the user skills directory of the harness home.
 *  - {@link resolveSkillsScanRoots} — *what does "already installed" mean?*
 *    Every directory DSH itself scans for user-level skills, most specific first,
 *    so a skill that is already present anywhere the harness looks is reported as
 *    installed instead of being downloaded again.
 *
 * `$DSH_HOME` is resolved here rather than through `@deepseek-ai/dsh-home-paths`
 * on purpose: that package is a host-provided dependency this plugin does not
 * declare, so a runtime value import would make the plugin fail to load in a
 * profile where it is not hoisted. The resolution rules below are the documented
 * ones: explicit path → `DSH_HOME` (blank treated as unset) → `~/.dsh`, plus the
 * `~`, `~/`, `~\` expansion the harness accepts.
 */
/**
 * Expand the tilde prefixes the harness accepts (`~`, `~/`, `~\`) against the OS
 * home; every other value is returned unchanged.
 */
export declare function expandHomePath(value: string): string;
/**
 * Resolve the harness home.
 *
 * Precedence, highest first: an explicit path, `$DSH_HOME`, then `~/.dsh`. A
 * blank environment value is treated as unset so a stray empty variable can never
 * resolve the harness home to the current working directory.
 */
export declare function resolveDshHome(configured?: string | null): string;
/** The harness home's shared user skills directory (`$DSH_HOME/skills`). */
export declare function dshUserSkillsDir(): string;
/** The cross-agent user skills directory (`$DSH_AGENTS_HOME/skills`, else `~/.agents/skills`). */
export declare function agentsUserSkillsDir(): string;
/**
 * Absolute skills directory this plugin installs into, created on demand.
 *
 * A relative configured path is resolved against the host process's working
 * directory: a skills root must be absolute before any containment check can mean
 * anything, and refusing relative input outright would break the common
 * `./tmp-skills` test setup.
 */
export declare function resolveSkillsRoot(configured: string | null): Promise<string>;
/**
 * Every directory DSH scans for user-level skills, most specific first.
 *
 * Order is the install root, then the two user roots the local filesystem skill
 * provider mounts by default. Project roots (`.dsh/skills`, `.agents/skills` under
 * a session's cwd) are deliberately absent: this plugin runs at host scope, has no
 * session, and must not claim that a skill in whichever directory the server
 * happened to start in is "installed" for every session.
 */
export declare function resolveSkillsScanRoots(configured: string | null): Promise<string[]>;
/**
 * Whether `child` is strictly inside `parent`.
 *
 * Compared with the platform's own case sensitivity folded in on Windows, where
 * two spellings of the same path are the same file. A trailing separator is
 * appended before comparison so `/skills` does not appear to contain `/skills-evil`.
 */
export declare function isInside(parent: string, child: string): boolean;
/**
 * Join path segments onto a parent, refusing anything that would escape it.
 *
 * @throws when the result is not strictly inside `parent`.
 */
export declare function resolveInside(parent: string, ...segments: string[]): string;
//# sourceMappingURL=root.d.ts.map