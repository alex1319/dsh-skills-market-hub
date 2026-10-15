/**
 * The Discover page's ranking, as pure functions.
 *
 * The market list answers "what is out there, in one order I can page through".
 * Discover answers a different question — "what is worth looking at right now" —
 * and the honest answer differs by shelf: what the registry calls *trending* is
 * not what it calls *newest*, and neither is what a reader means by *most
 * installed*. So there is no single ordering here, and the file exists to hold
 * five of them in one readable place.
 *
 * Three rules shape it:
 *
 *  - **Every shelf is a real signal or it is not shipped.** The rankings are built
 *    only from fields the registries actually publish on their list endpoints, and
 *    each one's meaning is stated where it is computed. Where a shelf would need a
 *    signal no endpoint exposes — an editorial "featured" flag, a list of official
 *    publishers — the shelf is defined by what *is* observable and says so, rather
 *    than being filled with a plausible-looking guess.
 *  - **Two registries, two orderings, one list.** ClawHub publishes real ranking
 *    indices; SkillHub publishes a page with no sort parameter at all. Merging
 *    them by a score this plugin invented would silently privilege whichever
 *    registry happens to publish bigger numbers, so the merge keeps each
 *    registry's own order and alternates.
 *  - **Nothing here touches the network, the disk, or the clock.** Given pools, it
 *    returns shelves; that is what makes it testable against captured fixtures
 *    without a DOM, a server, or a live registry.
 *
 * The one thing this module deliberately does *not* claim is editorial judgement.
 * "精选" is a computed consensus, not a curator, and the panel's tooltip says so.
 */
import { dedupeSkills } from "./dedupe.js";
import { DISCOVER_COLLECTION_IDS, } from "./types.js";
/** How many rows one shelf shows. */
export const DISCOVER_COLLECTION_SIZE = 10;
/** How many entries one source contributes to the shared pool. */
export const DISCOVER_POOL_SIZE = 60;
/**
 * How many entries the "newest" read asks for.
 *
 * Smaller than the shared pool on purpose: that read exists to fill one shelf of
 * ten, and the registry's newest page is dominated by skills with no downloads at
 * all, so a wider read buys nothing but bytes.
 */
export const DISCOVER_NEWEST_POOL_SIZE = 30;
/** How deep into one ranking a skill has to reach to earn a vote. */
export const FEATURED_AXIS_DEPTH = 20;
/** How many of the three axes a skill must place in to be featured. */
export const FEATURED_MIN_AXES = 2;
// ── Small readers ───────────────────────────────────────────────────────────
/** One stat, with "the registry did not say" sorted last rather than treated as zero. */
function stat(skill, key) {
    const value = skill.stats[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : -1;
}
function updatedAt(skill) {
    return typeof skill.updatedAt === 'number' && Number.isFinite(skill.updatedAt) ? skill.updatedAt : -1;
}
/** Descending by one numeric reading, with the skill id as a stable tie-break. */
function descending(pick) {
    return (a, b) => pick(b) - pick(a) || a.id.localeCompare(b.id);
}
/**
 * Merge ordered groups by alternation, dropping repeats.
 *
 * Round-robin rather than concatenation, and that is the whole point: appending
 * one registry's page after the other's would mean the second registry only ever
 * appears once the first is exhausted — which, with a shelf of ten and a page of
 * sixty, is never. Alternating guarantees both registries are represented while
 * each keeps its own internal order, and it needs no cross-registry score to
 * decide who is "first".
 */
function interleave(groups) {
    const out = [];
    const seen = new Set();
    const depth = groups.reduce((max, group) => Math.max(max, group.length), 0);
    for (let position = 0; position < depth; position += 1) {
        for (const group of groups) {
            const entry = group[position];
            if (entry === undefined || seen.has(entry.id))
                continue;
            seen.add(entry.id);
            out.push(entry);
        }
    }
    return out;
}
function assemble(pools) {
    // ClawHub first, always: `dedupeSkills` keeps whichever entry it sees first as
    // the original, and the original is the one whose bytes an install would take.
    const byId = new Map();
    for (const skill of [...pools.trending, ...pools.newest, ...pools.skillhub]) {
        // A skill can appear on more than one page (trending and newest overlap), and
        // the first page to mention it wins — later copies are the same record.
        if (!byId.has(skill.id))
            byId.set(skill.id, skill);
    }
    const merged = dedupeSkills([...byId.values()]);
    const mergedById = new Map(merged.map((skill) => [skill.id, skill]));
    const folded = new Set();
    for (const skill of merged) {
        for (const mirror of skill.mirrors ?? [])
            folded.add(mirror);
    }
    return {
        pool: merged,
        keep: (page) => page.flatMap((skill) => {
            if (folded.has(skill.id))
                return [];
            const record = mergedById.get(skill.id);
            return record === undefined ? [] : [record];
        }),
    };
}
// ── Shelves ─────────────────────────────────────────────────────────────────
/**
 * Skills that place near the top of *several* independent readings at once.
 *
 * The formula, stated so it can be argued with: rank the pool three times — by
 * downloads, by installs, by stars — and give a skill one vote for each ranking it
 * reaches the top {@link FEATURED_AXIS_DEPTH} of. Keep the ones with at least
 * {@link FEATURED_MIN_AXES} votes, best average placement first.
 *
 * The minimum is what makes this a shelf rather than a duplicate of "most
 * downloaded": one vote is something every popular skill has, so requiring two
 * means a skill has to be broadly strong — taken *and* kept — rather than merely
 * first on the axis its registry happens to publish best. Downloads count
 * everyone who took a copy, installs count those who put it to work, and stars
 * count those who kept it; a skill that leads two of the three has earned the
 * row.
 *
 * This is a consensus reading of published numbers. It is *not* an editor's
 * pick, and nothing in the panel calls it one.
 */
function featured(pool) {
    const axes = [
        (skill) => stat(skill, 'downloads'),
        (skill) => stat(skill, 'installs'),
        (skill) => stat(skill, 'stars'),
    ];
    /** `id` → how many axes it placed in, and the sum of those placements. */
    const placement = new Map();
    for (const axis of axes) {
        const ranked = [...pool].sort(descending(axis)).slice(0, FEATURED_AXIS_DEPTH);
        ranked.forEach((skill, index) => {
            // A skill with no reading on this axis cannot place in it: `-1` sorts last,
            // so it only lands here when the pool is too small to fill the depth, and a
            // vote bought by an absent number is not a vote.
            if (axis(skill) < 0)
                return;
            const entry = placement.get(skill.id) ?? { votes: 0, total: 0, best: 0 };
            entry.votes += 1;
            entry.total += index;
            entry.best = entry.votes === 1 ? index : Math.min(entry.best, index);
            placement.set(skill.id, entry);
        });
    }
    return pool
        .filter((skill) => (placement.get(skill.id)?.votes ?? 0) >= FEATURED_MIN_AXES)
        .sort((a, b) => {
        const left = placement.get(a.id);
        const right = placement.get(b.id);
        return right.votes - left.votes
            || left.best - right.best
            || left.total - right.total
            || a.id.localeCompare(b.id);
    });
}
/** Every shelf, in the order the panel reads them. */
export function buildDiscoverCollections(pools) {
    const { pool, keep } = assemble(pools);
    // SkillHub's page carries no ranking the plugin can name, so its entries are
    // ordered by the two readings that are comparable across registries: installs
    // for "hot", last update for "new". ClawHub's side of those two shelves keeps
    // the registry's own index, in the registry's own order.
    const skillhubByInstalls = [...keep(pools.skillhub)].sort(descending((skill) => stat(skill, 'installs')));
    const skillhubByRecency = [...keep(pools.skillhub)].sort(descending(updatedAt));
    const shelves = {
        featured: featured(pool),
        trending: interleave([keep(pools.trending), skillhubByInstalls]),
        // Only the registries' own verification is observable, and both publish it
        // rarely — SkillHub flags roughly one entry in a hundred of its top page, and
        // ClawHub states the flag only on search results, never on the list endpoint
        // this plugin browses. So this shelf is often short, and the panel says why
        // rather than padding it with near-matches.
        official: pool.filter((skill) => skill.verified === true).sort(descending((skill) => stat(skill, 'downloads'))),
        newest: interleave([keep(pools.newest), skillhubByRecency]),
        installs: [...pool].sort(descending((skill) => stat(skill, 'installs'))),
    };
    const metrics = {
        featured: 'downloads',
        trending: 'installs',
        official: 'downloads',
        newest: 'updatedAt',
        installs: 'installs',
    };
    return DISCOVER_COLLECTION_IDS.map((id) => ({
        id,
        metric: metrics[id],
        items: shelves[id].slice(0, DISCOVER_COLLECTION_SIZE),
    }));
}
//# sourceMappingURL=discover.js.map