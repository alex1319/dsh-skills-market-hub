/**
 * The registries' classification vocabulary, and the labels for it.
 *
 * A skill only carries classification *keys*; the human names live in a separate
 * vocabulary endpoint. Without it, a card can only print `design-media` — which
 * is why classifications were unreadable rather than absent on the first release:
 * the keys arrived and there was nothing to turn them into words.
 *
 * Two properties shape this module:
 *
 *  - **The vocabulary is shared, so it is fetched once, not per skill.** One list
 *    page can hold two dozen skills in a dozen categories; resolving each card
 *    independently would multiply one request into twenty-four.
 *  - **It is read synchronously, primed asynchronously.** `ensureCategoryVocabulary`
 *    is awaited by the market layer before it calls a provider, and the provider
 *    then reads the map without awaiting anything. That keeps the provider
 *    interface free of cache plumbing while still letting the data come from a
 *    cached HTTP read.
 *
 * The vocabulary is a *display* concern: an empty map degrades cards to their raw
 * keys, never to a wrong label, so a registry outage costs nothing but polish.
 */

import { providerFetchJson, providerUrl } from './provider-fetch.ts'
import type { MarketCategory } from './types.ts'

/** The vocabulary this plugin consumes. Only SkillHub publishes one. */
const VOCABULARY_SOURCE = 'skillhub'

/**
 * Route of the vocabulary endpoint, under the source's base URL.
 *
 * The **v1 prefix is required and the version-less spelling is a trap**: 
 * `/api/categories` answers `405` with an empty body while `/api/v1/categories`
 * answers the payload, so a wrong guess here fails as "no vocabulary" rather than
 * as an error — which is exactly the silent degradation the live suite exists to
 * catch. It did: the first version of this module fetched `/api/categories`, the
 * unit tests passed (they prime the vocabulary by hand), and the live test failed.
 */
export const CATEGORY_VOCABULARY_PATH = '/api/v1/categories'

/** How long a fetched vocabulary is trusted before it is re-read. */
export const CATEGORY_VOCABULARY_TTL_MS = 60 * 60 * 1000

/** `{count, items:[…]}` — the whole response, with no `{code, data, message}` envelope. */
interface CategoryEnvelope {
  count?: unknown
  items?: unknown
}

function asString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed === '' ? undefined : trimmed
  }
  return undefined
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return undefined
}

/**
 * Parse the vocabulary payload.
 *
 * Shape rules, all of them observed rather than assumed: `items` is present, an
 * entry is keyed by `key`, carries `name` (Chinese) and `nameEn` (English), and
 * may nest under `children` with a sibling `level`. A key this plugin cannot read
 * is dropped rather than guessed at — a category the panel cannot name is better
 * absent than invented.
 *
 * `name` is required: an entry whose only label is English still parses, because
 * an English label is a label, but an entry with no label at all is not part of a
 * vocabulary.
 */
export function parseCategoryVocabulary(value: unknown): MarketCategory[] {
  const root = asRecord(value)
  const items = Array.isArray(root?.items) ? root.items : []
  const out: MarketCategory[] = []

  const visit = (entries: unknown[], parent: string | undefined, level: number): void => {
    for (const entry of entries) {
      const record = asRecord(entry)
      if (record === undefined) continue
      const key = asString(record.key)
      if (key === undefined) continue
      if (asBoolean(record.active) === false) continue

      const nameEn = asString(record.nameEn)
      const name = asString(record.name) ?? nameEn
      if (name === undefined) continue

      out.push({
        key,
        name,
        ...(nameEn === undefined ? {} : { nameEn }),
        sortOrder: asNumber(record.sortOrder) ?? out.length,
        ...(parent === undefined ? {} : { parent }),
        level: asNumber(record.level) ?? level,
      })

      if (Array.isArray(record.children)) visit(record.children, key, level + 1)
    }
  }

  visit(items, undefined, 1)
  return out
}

// ── Resolution ──────────────────────────────────────────────────────────────

let vocabulary = new Map<string, MarketCategory>()
let fetchedAt = 0
/**
 * How many times the vocabulary has been replaced.
 *
 * Read by {@link ensureCategoryVocabulary} to decide whether the answer it is
 * holding is still the one that should win — see the write there for why "whoever
 * finishes last" is the wrong rule.
 */
let generation = 0

/**
 * Replace the vocabulary in force (tests, and the read below).
 *
 * Stamping the time here rather than only in the fetch path is what makes "we
 * already have a vocabulary" mean *one* thing: whatever put entries in the map
 * counts as the moment they were current, so a caller that primed them does not
 * have the next request go to the network just because the clock started at zero.
 */
export function setCategoryVocabulary(entries: readonly MarketCategory[]): void {
  vocabulary = new Map(entries.map((entry) => [entry.key, entry]))
  fetchedAt = Date.now()
  generation += 1
}

/** The vocabulary in force. */
export function categoryVocabulary(): ReadonlyMap<string, MarketCategory> {
  return vocabulary
}

/** The published labels for one key, or nothing when the vocabulary is silent. */
export function categoryNames(key: string): { labelZh?: string; labelEn?: string } {
  return labelsFor(vocabulary.get(key))
}

/** Turn a vocabulary entry into the labels a skill should carry. */
function labelsFor(entry: MarketCategory | undefined): { labelZh?: string; labelEn?: string } {
  if (entry === undefined) return {}
  // `name` is either the Chinese label or an English fallback; `nameEn` is only
  // ever English. Splitting them here is what keeps a card from showing the same
  // word under two alphabets.
  const isLatin = /[A-Za-z]/.test(entry.name) && !/[\u3400-\u9fff]/.test(entry.name)
  return {
    ...(isLatin ? {} : { labelZh: entry.name }),
    ...(entry.nameEn === undefined ? (isLatin ? { labelEn: entry.name } : {}) : { labelEn: entry.nameEn }),
  }
}

// ── Fetch ───────────────────────────────────────────────────────────────────

let inFlight: Promise<readonly MarketCategory[]> | null = null

/** Reset the fetch memo (unload, and tests). */
export function resetCategoryVocabulary(): void {
  vocabulary = new Map()
  fetchedAt = 0
  inFlight = null
  generation += 1
}

/**
 * Read the published vocabulary, at most once per TTL.
 *
 * Never throws: the vocabulary is decoration, and a market that refuses to list
 * skills because a label lookup failed would be trading the feature for the
 * garnish.
 *
 * A loaded vocabulary is never *replaced* by a failed read, so an outage costs
 * polish rather than labels. When nothing is loaded the read is attempted
 * regardless of the clock — "we have nothing" is the condition that matters, not
 * how long ago the last attempt was.
 */
export async function ensureCategoryVocabulary(options: { force?: boolean } = {}): Promise<void> {
  const loaded = vocabulary.size > 0
  const fresh = loaded && Date.now() - fetchedAt < CATEGORY_VOCABULARY_TTL_MS
  if (fresh && options.force !== true) return

  if (inFlight === null) {
    inFlight = providerFetchJson<CategoryEnvelope>(VOCABULARY_SOURCE, providerUrl(VOCABULARY_SOURCE, CATEGORY_VOCABULARY_PATH))
      .then(({ value }) => parseCategoryVocabulary(value))
      // Cleared in `finally` so a failure does not leave a rejected promise
      // memoized: the next request has to be able to try again.
      .finally(() => { inFlight = null })
  }

  // Which vocabulary was in force when this read *started*.
  const startedAt = generation

  try {
    const entries = await inFlight
    // An empty parse is not a vocabulary either: priming with it would replace a
    // usable map (from an earlier read or a test) with nothing.
    if (entries.length === 0) return
    // **Write only if this read is still the current one.** A read that began when
    // nothing was loaded can still be in the air when something else fills the map
    // — the warm-up at activation overlapping a forced refresh, or a test priming
    // it by hand. Writing unconditionally makes the winner "whoever finished last",
    // which is the wrong rule: the fresher vocabulary is the one that should
    // survive, and a slow network answer is by definition the less fresh of the two.
    //
    // A forced read is the exception, and the whole point of the flag: the caller
    // explicitly asked for this answer to replace what is there.
    if (options.force === true || generation === startedAt) setCategoryVocabulary(entries)
  } catch {
    // Leave whatever was already loaded in place; the cards fall back to keys.
  }
}
