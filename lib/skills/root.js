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
import * as fs from 'node:fs/promises';
import { homedir } from 'node:os';
import * as path from 'node:path';
/** Environment variable that overrides the default harness home. */
const DSH_HOME_ENV = 'DSH_HOME';
/** Directory name of the default harness home under the OS home. */
const DSH_HOME_DIR_NAME = '.dsh';
/** Environment variable that overrides the shared agents home. */
const DSH_AGENTS_HOME_ENV = 'DSH_AGENTS_HOME';
/** Directory name of the default shared agents home under the OS home. */
const AGENTS_HOME_DIR_NAME = '.agents';
/**
 * Expand the tilde prefixes the harness accepts (`~`, `~/`, `~\`) against the OS
 * home; every other value is returned unchanged.
 */
export function expandHomePath(value) {
    if (value === '~')
        return homedir();
    if (value.startsWith('~/') || value.startsWith('~\\'))
        return path.join(homedir(), value.slice(2));
    return value;
}
/**
 * Resolve the harness home.
 *
 * Precedence, highest first: an explicit path, `$DSH_HOME`, then `~/.dsh`. A
 * blank environment value is treated as unset so a stray empty variable can never
 * resolve the harness home to the current working directory.
 */
export function resolveDshHome(configured) {
    if (typeof configured === 'string' && configured.trim() !== '') {
        return path.resolve(expandHomePath(configured.trim()));
    }
    const fromEnv = process.env[DSH_HOME_ENV];
    if (typeof fromEnv === 'string' && fromEnv.trim() !== '') {
        return path.resolve(expandHomePath(fromEnv.trim()));
    }
    return path.join(homedir(), DSH_HOME_DIR_NAME);
}
/** The harness home's shared user skills directory (`$DSH_HOME/skills`). */
export function dshUserSkillsDir() {
    return path.join(resolveDshHome(), 'skills');
}
/** The cross-agent user skills directory (`$DSH_AGENTS_HOME/skills`, else `~/.agents/skills`). */
export function agentsUserSkillsDir() {
    const fromEnv = process.env[DSH_AGENTS_HOME_ENV];
    const home = typeof fromEnv === 'string' && fromEnv.trim() !== ''
        ? path.resolve(expandHomePath(fromEnv.trim()))
        : path.join(homedir(), AGENTS_HOME_DIR_NAME);
    return path.join(home, 'skills');
}
/**
 * Absolute skills directory this plugin installs into, created on demand.
 *
 * A relative configured path is resolved against the host process's working
 * directory: a skills root must be absolute before any containment check can mean
 * anything, and refusing relative input outright would break the common
 * `./tmp-skills` test setup.
 */
export async function resolveSkillsRoot(configured) {
    const root = typeof configured === 'string' && configured.trim() !== ''
        ? path.resolve(expandHomePath(configured.trim()))
        : dshUserSkillsDir();
    await fs.mkdir(root, { recursive: true });
    return root;
}
/**
 * Every directory DSH scans for user-level skills, most specific first.
 *
 * Order is the install root, then the two user roots the local filesystem skill
 * provider mounts by default. Project roots (`.dsh/skills`, `.agents/skills` under
 * a session's cwd) are deliberately absent: this plugin runs at host scope, has no
 * session, and must not claim that a skill in whichever directory the server
 * happened to start in is "installed" for every session.
 */
export async function resolveSkillsScanRoots(configured) {
    const roots = [await resolveSkillsRoot(configured)];
    for (const candidate of [dshUserSkillsDir(), agentsUserSkillsDir()]) {
        if (!roots.includes(candidate))
            roots.push(candidate);
    }
    return roots;
}
/**
 * Whether `child` is strictly inside `parent`.
 *
 * Compared with the platform's own case sensitivity folded in on Windows, where
 * two spellings of the same path are the same file. A trailing separator is
 * appended before comparison so `/skills` does not appear to contain `/skills-evil`.
 */
export function isInside(parent, child) {
    const normalize = (value) => {
        const resolved = path.resolve(value);
        return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
    };
    const from = normalize(parent);
    const to = normalize(child);
    if (to === from)
        return false;
    return to.startsWith(from.endsWith(path.sep) ? from : from + path.sep);
}
/**
 * Join path segments onto a parent, refusing anything that would escape it.
 *
 * @throws when the result is not strictly inside `parent`.
 */
export function resolveInside(parent, ...segments) {
    const target = path.resolve(parent, ...segments);
    if (!isInside(parent, target)) {
        throw new Error('refusing a path outside its parent directory');
    }
    return target;
}
//# sourceMappingURL=root.js.map