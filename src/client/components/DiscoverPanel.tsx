/**
 * The Discover section: a shelf of ranked skills, and the shelves beside it.
 *
 * This view is deliberately the *opposite* of the market list. The market list is
 * a grid of cards with filters, a search box, and paging, because its question —
 * "find me this one thing" — needs all three. Discover answers "what is worth
 * looking at", which is a browsing question: one column of names, one number per
 * row, and five shelves to switch between. A search box here would be a second
 * copy of the market tab's, and the categories would be a second copy of its
 * filter bar.
 *
 * Three decisions are worth stating, because each one is visible:
 *
 *  - **The number on the right is the number the shelf ranked by.** The host sends
 *    the metric with the collection, so "新发布" prints a date and "装机最多"
 *    prints an install count. Printing downloads everywhere would be tidier and
 *    would also be false.
 *  - **A row opens the detail; the button installs.** The row itself is the link,
 *    so the whole line is a target rather than just the name — but install stays a
 *    separate control, because it writes to the reader's disk and must not be
 *    something a mis-aimed click on a list row can do.
 *  - **An empty shelf explains itself.** "官方" is sourced from the registries' own
 *    verification flag, which both publish rarely. A short shelf is a fact about
 *    the registries, and saying so is better than padding it with near-matches or
 *    hiding the shelf.
 */

import { useLocale, useT } from '../translate.tsx'
import {
  Button,
  LoadingLine,
  Notice,
  Pill,
  SPACE,
  categoryLabelText,
  countText,
  radius,
  shortDate,
  surfaceStyle,
  token,
} from '../ui.tsx'
import type {
  DiscoverCollection,
  DiscoverCollectionId,
  DiscoverMetric,
  NormalizedSkill,
  SourceStatusInfo,
  MarketSource,
} from '../api.ts'

/** How many classification chips a row shows. One: a row is a line, not a card. */
const ROW_CATEGORY_LIMIT = 1

/**
 * The row's fixed columns, in pixels.
 *
 * Named constants rather than inline numbers because the heading row has to
 * reproduce them exactly: two copies of `62` that drift apart is a heading sitting
 * slightly off its own column, which reads as a rendering bug rather than as a
 * design choice.
 */
const RANK_WIDTH = 18
const METRIC_MIN_WIDTH = 64
const ACTION_MIN_WIDTH = 62

/** How many placeholder rows the first paint draws. One more than a full shelf. */
const DISCOVER_SKELETON_ROWS = 7

/** Shelf id → dictionary key holding its label. */
const LABEL_KEY: Record<DiscoverCollectionId, string> = {
  featured: 'discoverFeatured',
  trending: 'discoverTrending',
  official: 'discoverOfficial',
  newest: 'discoverNewest',
  installs: 'discoverInstalls',
}

/**
 * Shelf id → dictionary key holding the one-line signpost under the tabs.
 *
 * The signpost is deliberately short. It answers "what am I looking at" in a
 * glance, and the *rule* behind the ranking — which is longer, and which only
 * matters to a reader who doubts the shelf — lives in {@link RULE_KEY} on the
 * tab's tooltip and in the empty state.
 */
const HINT_KEY: Record<DiscoverCollectionId, string> = {
  featured: 'discoverFeaturedHint',
  trending: 'discoverTrendingHint',
  official: 'discoverOfficialHint',
  newest: 'discoverNewestHint',
  installs: 'discoverInstallsHint',
}

/** Shelf id → dictionary key holding the full rule, shown where someone asks why. */
const RULE_KEY: Record<DiscoverCollectionId, string> = {
  featured: 'discoverFeaturedRule',
  trending: 'discoverTrendingRule',
  official: 'discoverOfficialRule',
  newest: 'discoverNewestRule',
  installs: 'discoverInstallsRule',
}

/** Metric → dictionary key holding the column heading. */
const METRIC_KEY: Record<DiscoverMetric, string> = {
  downloads: 'discoverColumnDownloads',
  installs: 'discoverColumnInstalls',
  stars: 'discoverColumnStars',
  updatedAt: 'discoverColumnUpdated',
}

/**
 * The right-hand figure for one row.
 *
 * Three fallbacks, each for a different kind of "nothing":
 *
 *  - a recency shelf prints a date, and a registry that published no timestamp
 *    gets an em dash rather than an epoch;
 *  - a count the registry never published gets an em dash too, because a published
 *    zero and a missing figure are different facts — the ranking already treats
 *    them differently (an absent count sorts last), and printing `0` would make a
 *    silent registry look like an unpopular skill;
 *  - everything else is the registry's own number, compacted the way the market
 *    cards compact it, so one skill reads the same on both screens.
 */
function metricText(skill: NormalizedSkill, metric: DiscoverMetric): string {
  if (metric === 'updatedAt') return shortDate(skill.updatedAt) ?? '—'
  const value = metric === 'installs' ? skill.stats.installs : metric === 'stars' ? skill.stats.stars : skill.stats.downloads
  return value === undefined ? '—' : countText(value)
}

export interface DiscoverPanelProps {
  collections: DiscoverCollection[]
  active: DiscoverCollectionId
  loading: boolean
  error: string | null
  installingIds: string[]
  sources: Record<MarketSource, SourceStatusInfo> | null
  onSelect: (id: DiscoverCollectionId) => void
  onOpen: (skill: NormalizedSkill) => void
  onInstall: (skill: NormalizedSkill) => void
  onRefresh: () => void
  onFindMore: () => void
}

/**
 * The first-paint placeholder.
 *
 * It is drawn as the layout the reader is about to get — a shelf strip, a hint
 * line, a column heading, ten rows — rather than as a generic grid of blocks. A
 * placeholder with a different shape than its content is a second layout the page
 * visibly jumps out of, and the jump is what reads as "slow": the numbers here are
 * the same either way, so the only thing a mismatched skeleton buys is a worse
 * first second.
 *
 * Every block is `aria-hidden`; the sentence above them carries the state for
 * assistive technology (see {@link LoadingLine}).
 */
function DiscoverSkeleton({ label }: { label: string }) {
  const bar = (width: number | string, height = 10) => (
    <span
      style={{
        display: 'block',
        width,
        height,
        borderRadius: radius.xs,
        // The theme's placeholder wash, not a surface colour: the light theme's
        // surfaces are white, so a placeholder painted with one is invisible.
        background: token.skeleton,
      }}
    />
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.lg }}>
      <LoadingLine label={label} />

      <div aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', gap: SPACE.lg }}>
        {/* The shelf strip. */}
        <div style={{ display: 'flex', gap: SPACE.lg, borderBottom: `1px solid ${token.borderL1}`, paddingBottom: SPACE.sm + 2 }}>
          {[34, 34, 34, 46, 58].map((width, index) => (
            <span key={index}>{bar(width, 12)}</span>
          ))}
        </div>

        {bar('55%', 10)}

        <div style={surfaceStyle({ overflow: 'hidden' })}>
          <div style={{ padding: `${SPACE.sm}px ${SPACE.md}px`, borderBottom: `1px solid ${token.borderL1}` }}>
            {bar(48, 9)}
          </div>
          {Array.from({ length: DISCOVER_SKELETON_ROWS }, (_, index) => (
            <div
              key={index}
              style={{
                display: 'flex',
                gap: SPACE.md,
                alignItems: 'center',
                padding: `${SPACE.sm + 2}px ${SPACE.md}px`,
                borderBottom: index === DISCOVER_SKELETON_ROWS - 1 ? 'none' : `1px solid ${token.borderL1}`,
              }}
            >
              <span style={{ width: RANK_WIDTH, flex: 'none' }}>{bar('100%', 9)}</span>
              <span style={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {bar(`${58 - index * 4}%`, 11)}
                {bar('30%', 8)}
              </span>
              <span style={{ flex: 'none', minWidth: METRIC_MIN_WIDTH, display: 'flex', justifyContent: 'flex-end' }}>
                {bar(38, 10)}
              </span>
              <span style={{ flex: 'none', minWidth: ACTION_MIN_WIDTH }}>{bar('100%', 24)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function DiscoverPanel(props: DiscoverPanelProps) {
  const t = useT()
  const collection = props.collections.find((entry) => entry.id === props.active) ?? props.collections[0]

  // First paint: nothing to show yet, so the placeholder stands in for the whole
  // view — including the shelf strip, which would otherwise be empty and make the
  // page look broken rather than busy.
  if (props.loading && props.collections.length === 0) return <DiscoverSkeleton label={t('discoverLoading')} />

  if (props.error !== null && props.collections.length === 0) {
    return (
      <Notice
        title={t('errorTitle')}
        detail={props.error}
        action={<Button onClick={props.onRefresh}>{t('retry')}</Button>}
      />
    )
  }

  if (collection === undefined) {
    return <Notice title={t('discoverEmpty')} detail={t('discoverEmptyHint')} />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.lg }}>
      <ShelfTabs collections={props.collections} active={collection.id} onSelect={props.onSelect} />

      {/* A read still running *with shelves already on screen*: the reader keeps what
          they were reading and is told a newer answer is on its way. Replacing the
          list with a skeleton here would throw away the page they are looking at in
          order to show them the same page. */}
      {props.loading ? <LoadingLine label={t('discoverLoading')} /> : null}

      <p style={{ margin: 0, fontSize: 12, color: token.labelSecondary }}>
        {t(HINT_KEY[collection.id])}
        <DegradedNote sources={props.sources} />
      </p>

      {/* A refresh that failed after the shelves were already on screen: the reader
          keeps what they were reading, and is told the new answer did not arrive. */}
      {props.error !== null && props.collections.length > 0
        ? (
            <div style={{ display: 'flex', gap: SPACE.sm, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: token.error }}>{props.error}</span>
              <Button onClick={props.onRefresh}>{t('retry')}</Button>
            </div>
          )
        : null}

      {collection.items.length === 0
        ? <Notice title={t('discoverShelfEmpty')} detail={t(RULE_KEY[collection.id])} />
        : (
            <SkillRowList
              skills={collection.items}
              metric={collection.metric}
              installingIds={props.installingIds}
              onOpen={props.onOpen}
              onInstall={props.onInstall}
            />
          )}

      {/* The whole point of the page is to point at the market, not to replace it:
          five shelves of ten cannot hold a registry with 190,000 entries. */}
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: SPACE.xs }}>
        <Button onClick={props.onFindMore} style={{ padding: '7px 18px' }}>
          {t('discoverFindMore')} →
        </Button>
      </div>
    </div>
  )
}

/**
 * The shelf switcher.
 *
 * `role="tablist"` rather than a row of buttons, because that is what it is: one
 * panel of content, several headings that choose it. The selected tab carries the
 * brand underline *and* the primary label colour, so the state does not rest on
 * colour alone for a reader who cannot see the underline.
 */
function ShelfTabs({
  collections,
  active,
  onSelect,
}: {
  collections: DiscoverCollection[]
  active: DiscoverCollectionId
  onSelect: (id: DiscoverCollectionId) => void
}) {
  const t = useT()
  return (
    <div
      role="tablist"
      aria-label={t('discoverTitle')}
      style={{ display: 'flex', gap: SPACE.lg, borderBottom: `1px solid ${token.borderL1}`, flexWrap: 'wrap' }}
    >
      {collections.map((collection) => {
        const selected = collection.id === active
        return (
          <button
            key={collection.id}
            role="tab"
            type="button"
            aria-selected={selected}
            title={t(RULE_KEY[collection.id])}
            onClick={() => { onSelect(collection.id) }}
            style={{
              font: 'inherit',
              fontSize: 13,
              padding: '6px 2px 8px',
              marginBottom: -1,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: selected ? token.labelPrimary : token.labelSecondary,
              borderBottom: `2px solid ${selected ? token.brand : 'transparent'}`,
              fontWeight: selected ? 600 : 400,
              transition: 'color 150ms ease-out',
            }}
          >
            {t(LABEL_KEY[collection.id])}
          </button>
        )
      })}
    </div>
  )
}

/**
 * One registry that answered badly, named.
 *
 * Printed under the shelf's explanation rather than as a banner across the top: it
 * qualifies *why this list is short*, so it belongs beside the list, and a reader
 * whose page is full does not need to be told about a registry they are not
 * missing.
 */
function DegradedNote({ sources }: { sources: Record<MarketSource, SourceStatusInfo> | null }) {
  const t = useT()
  if (sources === null) return null
  const degraded = (['clawhub', 'skillhub'] as const).filter((source) => {
    const status = sources[source]?.status
    return status === 'failed' || status === 'degraded'
  })
  if (degraded.length === 0) return null
  return (
    <span style={{ color: token.warn }} title={t('discoverDegradedHint')}>
      {' · '}{t('discoverDegraded')} {degraded.join(' / ')}
    </span>
  )
}

function SkillRowList({
  skills,
  metric,
  installingIds,
  onOpen,
  onInstall,
}: {
  skills: NormalizedSkill[]
  metric: DiscoverMetric
  installingIds: string[]
  onOpen: (skill: NormalizedSkill) => void
  onInstall: (skill: NormalizedSkill) => void
}) {
  const t = useT()
  return (
    <div style={surfaceStyle({ overflow: 'hidden' })}>
      {/* A column heading, not a data row.
          It repeats the row's own fixed columns — the rank gutter, the metric, the
          button — rather than only the two labelled ones, because `marginLeft:auto`
          would otherwise push the heading to the container's edge while the numbers
          sit a button's width in from it. A heading that does not line up with its
          column is worse than no heading. */}
      <div
        aria-hidden="true"
        style={{
          display: 'flex',
          gap: SPACE.md,
          alignItems: 'center',
          padding: `${SPACE.sm}px ${SPACE.md}px`,
          borderBottom: `1px solid ${token.borderL1}`,
          fontSize: 10.5,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: token.labelSecondary,
        }}
      >
        <span style={{ width: RANK_WIDTH, flex: 'none' }} />
        <span style={{ flex: '1 1 auto' }}>{t('discoverColumnSkill')}</span>
        <span style={{ flex: 'none', minWidth: METRIC_MIN_WIDTH, textAlign: 'right' }}>{t(METRIC_KEY[metric])}</span>
        <span style={{ flex: 'none', minWidth: ACTION_MIN_WIDTH }} />
      </div>

      <div role="list">
        {skills.map((skill, index) => (
          <SkillRow
            key={skill.id}
            skill={skill}
            rank={index + 1}
            metric={metric}
            last={index === skills.length - 1}
            busy={installingIds.includes(skill.id)}
            onOpen={() => { onOpen(skill) }}
            onInstall={() => { onInstall(skill) }}
          />
        ))}
      </div>
    </div>
  )
}

function SkillRow({
  skill,
  rank,
  metric,
  last,
  busy,
  onOpen,
  onInstall,
}: {
  skill: NormalizedSkill
  rank: number
  metric: DiscoverMetric
  last: boolean
  busy: boolean
  onOpen: () => void
  onInstall: () => void
}) {
  const t = useT()
  const locale = useLocale()
  const installed = skill.installState === 'installed'
  const blocked = skill.installState === 'not-installable'
  const categories = (skill.categories ?? []).slice(0, ROW_CATEGORY_LIMIT)

  return (
    <div
      role="listitem"
      style={{
        display: 'flex',
        gap: SPACE.md,
        alignItems: 'center',
        padding: `${SPACE.sm + 2}px ${SPACE.md}px`,
        borderBottom: last ? 'none' : `1px solid ${token.borderL1}`,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: RANK_WIDTH,
          flex: 'none',
          fontSize: 11,
          color: token.labelSecondary,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {rank}
      </span>

      <div style={{ flex: '1 1 auto', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: SPACE.sm, minWidth: 0 }}>
          <button
            type="button"
            onClick={onOpen}
            title={skill.name}
            style={{
              border: 'none',
              background: 'transparent',
              padding: 0,
              font: 'inherit',
              fontSize: 13,
              fontWeight: 600,
              color: token.labelPrimary,
              cursor: 'pointer',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
            }}
          >
            {skill.name}
          </button>
          <span
            style={{
              fontSize: 11,
              color: token.labelSecondary,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            @{skill.author.handle}
          </span>
        </div>

        {/* Provenance is not decoration here: the panel merges two registries, and
            the same skill can exist on both with different bytes. The source is
            named so a reader comparing two shelves can tell them apart. */}
        <div style={{ display: 'flex', gap: SPACE.xs, alignItems: 'center', marginTop: 3, flexWrap: 'wrap' }}>
          <Pill tone="brand">{skill.source}</Pill>
          {skill.verified === true ? <Pill tone="ok">{t('discoverVerified')}</Pill> : null}
          {categories.map((ref) => (
            <Pill key={ref.key} tone="neutral" title={ref.key}>
              {categoryLabelText(ref, locale)}
            </Pill>
          ))}
          {installed ? <Pill tone="ok">{t('installed')}</Pill> : null}
        </div>
      </div>

      <span
        aria-label={`${t(METRIC_KEY[metric])} ${metricText(skill, metric)}`}
        style={{
          flex: 'none',
          minWidth: METRIC_MIN_WIDTH,
          textAlign: 'right',
          fontSize: 12,
          color: token.labelPrimary,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {metricText(skill, metric)}
      </span>

      <Button
        variant={installed ? 'ghost' : 'primary'}
        onClick={onInstall}
        disabled={busy || installed || blocked}
        title={blocked ? t('notInstallable') : undefined}
        style={{ flex: 'none', minWidth: ACTION_MIN_WIDTH, borderRadius: radius.md }}
      >
        {installed ? t('installed') : busy ? t('installing') : t('install')}
      </Button>
    </div>
  )
}
