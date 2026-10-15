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
import { type DiscoverCollection, type NormalizedSkill } from './types.ts';
/** How many rows one shelf shows. */
export declare const DISCOVER_COLLECTION_SIZE = 10;
/** How many entries one source contributes to the shared pool. */
export declare const DISCOVER_POOL_SIZE = 60;
/**
 * How many entries the "newest" read asks for.
 *
 * Smaller than the shared pool on purpose: that read exists to fill one shelf of
 * ten, and the registry's newest page is dominated by skills with no downloads at
 * all, so a wider read buys nothing but bytes.
 */
export declare const DISCOVER_NEWEST_POOL_SIZE = 30;
/** How deep into one ranking a skill has to reach to earn a vote. */
export declare const FEATURED_AXIS_DEPTH = 20;
/** How many of the three axes a skill must place in to be featured. */
export declare const FEATURED_MIN_AXES = 2;
/**
 * The upstream pages one Discover read is built from.
 *
 * Named by where they came from rather than by what they will become: `trending`
 * is "ClawHub's trending index", not "the trending shelf", because the trending
 * shelf also draws on `skillhub`.
 */
export interface DiscoverPools {
    /** ClawHub's own trending index, in the registry's order. */
    trending: readonly NormalizedSkill[];
    /** ClawHub's own newest index, in the registry's order. */
    newest: readonly NormalizedSkill[];
    /** SkillHub's list page, in the registry's order. */
    skillhub: readonly NormalizedSkill[];
}
/** Every shelf, in the order the panel reads them. */
export declare function buildDiscoverCollections(pools: DiscoverPools): DiscoverCollection[];
//# sourceMappingURL=discover.d.ts.map