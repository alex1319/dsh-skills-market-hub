/**
 * One skill card, and the grid that holds them.
 *
 * The card answers four questions in reading order — what is it, who published
 * it, how popular is it, and is it safe/installed — because those are the four
 * things a reader weighs before opening a skill. Everything else waits for the
 * detail view.
 */

import { useEffect, useRef } from 'react'
import { useT } from '../translate.tsx'
import { Button, Pill, SPACE, countText, radius, shortDate, surfaceStyle, token } from '../ui.tsx'
import type { NormalizedSkill, SecurityStatus } from '../api.ts'

/** Verdict → pill tone. An unknown verdict is shown, never hidden. */
function securityTone(status: SecurityStatus): 'ok' | 'warn' | 'error' | 'muted' {
  if (status === 'verified' || status === 'benign') return 'ok'
  if (status === 'flagged') return 'error'
  return 'muted'
}

function securityLabelKey(status: SecurityStatus): string {
  if (status === 'verified') return 'securityVerified'
  if (status === 'benign') return 'securityBenign'
  if (status === 'flagged') return 'securityFlagged'
  return 'securityUnknown'
}

export interface SkillCardProps {
  skill: NormalizedSkill
  busy: boolean
  onOpen: () => void
  onInstall: () => void
}

export function SkillCard({ skill, busy, onOpen, onInstall }: SkillCardProps) {
  const t = useT()
  const installed = skill.installState === 'installed'
  const blocked = skill.installState === 'not-installable'

  return (
    <div style={surfaceStyle({ padding: SPACE.md, display: 'flex', flexDirection: 'column', gap: SPACE.sm })}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: SPACE.sm }}>
        <SkillAvatar name={skill.name} iconUrl={skill.iconUrl} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <button
            type="button"
            onClick={onOpen}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: 0,
              border: 'none',
              background: 'transparent',
              color: token.labelPrimary,
              font: 'inherit',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={skill.name}
          >
            {skill.name}
          </button>
          <div style={{ fontSize: 11, color: token.labelSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {skill.author.displayName ?? skill.author.handle}
            {skill.version === undefined ? '' : ` · v${skill.version}`}
          </div>
        </div>
      </div>

      <p style={{
        margin: 0,
        fontSize: 12,
        color: token.labelSecondary,
        display: '-webkit-box',
        WebkitLineClamp: 3,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
        minHeight: 54,
      }}>
        {skill.summary}
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE.xs, alignItems: 'center' }}>
        <Pill tone="brand">{skill.source}</Pill>
        <Pill tone={securityTone(skill.securityStatus)} title={t(securityLabelKey(skill.securityStatus))}>
          {t(securityLabelKey(skill.securityStatus))}
        </Pill>
        {skill.requiresApiKey === true ? <Pill tone="warn">{t('detailRequiresKey')}</Pill> : null}
        {installed ? <Pill tone="ok">{t('installed')}</Pill> : null}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: token.labelSecondary }}>
          {/* Downloads are the one popularity signal both registries publish. */}
          {t('detailDownloads')} {countText(skill.stats.downloads)}
        </span>
      </div>

      <div style={{ display: 'flex', gap: SPACE.sm, alignItems: 'center', marginTop: 'auto' }}>
        <Button onClick={onOpen} style={{ flex: 1 }}>{t('detailOverview')}</Button>
        <Button
          variant="primary"
          onClick={onInstall}
          disabled={busy || installed || blocked}
          title={blocked ? t('notInstallable') : undefined}
          style={{ flex: 1 }}
        >
          {installed ? t('installed') : busy ? t('installing') : t('install')}
        </Button>
      </div>
    </div>
  )
}

/**
 * Skill initials avatar.
 *
 * The registries publish an icon URL for some skills and `null` for most; a
 * broken image is worse than a monogram, so the fallback is what renders unless a
 * URL is actually present.
 */
function SkillAvatar({ name, iconUrl }: { name: string; iconUrl?: string }) {
  const initials = name.split(/\s+/).slice(0, 2).map((word) => word.slice(0, 1).toUpperCase()).join('') || '?'
  if (iconUrl !== undefined && iconUrl !== '') {
    return (
      <img
        src={iconUrl}
        alt=""
        width={30}
        height={30}
        style={{ width: 30, height: 30, borderRadius: radius.md, objectFit: 'cover', flex: 'none' }}
        // A registry URL can rot; falling back to the monogram keeps the row legible.
        onError={(event) => { event.currentTarget.style.display = 'none' }}
      />
    )
  }
  return (
    <span
      aria-hidden="true"
      style={{
        width: 30,
        height: 30,
        flex: 'none',
        borderRadius: radius.md,
        border: `1px solid ${token.borderL1}`,
        background: token.bgLayer2,
        color: token.labelSecondary,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      {initials}
    </span>
  )
}

export interface SkillGridProps {
  skills: NormalizedSkill[]
  installingIds: string[]
  onOpen: (skill: NormalizedSkill) => void
  onInstall: (skill: NormalizedSkill) => void
}

export function SkillGrid({ skills, installingIds, onOpen, onInstall }: SkillGridProps) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
      gap: SPACE.md,
      alignItems: 'stretch',
    }}>
      {skills.map((skill) => (
        <SkillCard
          key={skill.id}
          skill={skill}
          busy={installingIds.includes(skill.id)}
          onOpen={() => { onOpen(skill) }}
          onInstall={() => { onInstall(skill) }}
        />
      ))}
    </div>
  )
}

/**
 * Sentinel that asks for the next page when it scrolls into view.
 *
 * The observer is rooted at the scrolling container rather than the viewport: the
 * panel lives inside the shell's own scroll area, so a viewport-rooted observer
 * would report "not intersecting" for a sentinel that is already visible.
 */
export function LoadMoreSentinel({ onReach, rootRef }: { onReach: () => void; rootRef: { current: HTMLElement | null } }) {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const element = ref.current
    if (element === null) return
    if (typeof IntersectionObserver !== 'function') return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onReach()
      },
      // Start one screen early so the next page is usually already there when the
      // reader arrives.
      { root: rootRef.current, rootMargin: '600px 0px' },
    )
    observer.observe(element)
    return () => { observer.disconnect() }
  }, [onReach, rootRef])

  return <div ref={ref} style={{ height: 1 }} aria-hidden="true" />
}
