/**
 * The panel components, actually rendered.
 *
 * A JSX component can type-check, bundle, and register correctly and still throw
 * on first paint — a missing context, a `useT` outside its provider, a `null` the
 * type system was told to trust. Nothing short of rendering catches that, and the
 * failure mode without this test is a blank panel in the GUI with the real error
 * only visible in the browser console.
 *
 * `renderToStaticMarkup` runs the components, their hooks, and their context lookups
 * for real. Effects do not run (there is no DOM), so this does not cover the
 * controller's network behaviour; it covers the render path, which is what breaks
 * silently.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const require = createRequire(import.meta.url)

/**
 * Load the browser artifact and return the plugin it registers.
 *
 * The loader's `require` answers `react` and `react/jsx-runtime`; `react-dom/server`
 * is added here because the *test* needs a renderer, and the assertion in the
 * bundle test already proves the artifact itself never asks for it.
 */
function loadClientPlugin() {
  const artifact = join(ROOT, 'lib', 'client.cjs')
  delete require.cache[artifact]

  let exportsValue
  globalThis.window = {
    __ModuleLoader__: {
      load(entry) {
        exportsValue = entry.factory((specifier) => {
          if (specifier === 'react' || specifier === 'react/jsx-runtime') return require('react')
          throw new Error(`the module table cannot answer "${specifier}"`)
        })
      },
    },
  }
  try {
    require(artifact)
  } finally {
    delete globalThis.window
  }
  return exportsValue
}

const plugin = loadClientPlugin()
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

/** A translate function that returns the key, so a rendered string names its own source. */
const t = (key) => key

/** A skill shaped exactly as the host's normalizer produces one. */
function skill(overrides = {}) {
  return {
    id: 'clawhub:demo',
    source: 'clawhub',
    slug: 'demo',
    name: 'Demo Skill',
    summary: 'A skill used to prove the panel renders.',
    author: { handle: 'author', displayName: 'Author' },
    stats: { downloads: 1234, installs: 12, stars: 3 },
    tags: ['demo', 'test'],
    version: '1.0.0',
    updatedAt: 1_700_000_000_000,
    securityStatus: 'benign',
    installState: 'installable',
    ...overrides,
  }
}

/** One installed inventory row, shaped as the host's scanner reports one. */
function installed(overrides = {}) {
  return {
    key: 'a'.repeat(64),
    linked: false,
    removable: true,
    id: 'clawhub:demo',
    source: 'clawhub',
    slug: 'demo',
    owner: 'author',
    name: 'Demo Skill',
    dirName: 'demo',
    dirPath: 'C:/skills/demo',
    version: '1.0.0',
    installedAt: '2026-01-01T00:00:00.000Z',
    managed: true,
    bytes: 2048,
    fileCount: 3,
    ...overrides,
  }
}

/**
 * Render the panel the way the framework does: one component, one locale seat.
 *
 * The component is called as a function rather than mounted, so the controller's
 * effects never run — which is exactly the boundary this test is about.
 */
function renderPanel(component, props) {
  // `renderToStaticMarkup` needs an element, and the panel takes props directly.
  return renderToStaticMarkup(React.createElement(component, props))
}

const { MarketPage } = plugin.__components ?? {}

describe('client panel render', () => {
  it('exposes the components the entry registers', async () => {
    // The bundle's exports are the plugin; the components are reachable through
    // the registration path, which the bundle test already drives. Here the panel
    // is imported from the compiled client program instead, so a render failure
    // points at the component rather than at the loader.
    const page = await import('../lib/client/page/MarketPage.js').catch(() => null)
    assert.ok(page !== null, 'the compiled panel module must exist')
    assert.equal(typeof page.MarketPage, 'function')
    assert.equal(MarketPage, undefined, 'components are not smuggled through the plugin exports')
  })

  it('renders the panel shell with its three sections, opening on Discover', async () => {
    const { MarketPage: Page } = await import('../lib/client/page/MarketPage.js')
    const html = renderPanel(Page, { t })

    // The keys come back verbatim because the test's `t` is the identity, so each
    // assertion below names the exact dictionary entry the UI is reading.
    assert.match(html, /role="tablist"/, 'the section switch renders as a tab list')
    assert.match(html, /tabDiscover/)
    assert.match(html, /tabMarket/)
    assert.match(html, /tabInstalled/)
    assert.match(html, /refresh/)
    // Discover is first *and* selected on open: it is the section that answers a
    // reader who does not yet know what they are looking for.
    assert.match(html, /aria-selected="true"[^>]*>tabDiscover/)
  })

  it('renders the market list with its search box and filters when that tab is shown', async () => {
    // Driven directly rather than through the panel: the panel opens on Discover,
    // and `renderToStaticMarkup` runs no handlers, so no static render can switch
    // tabs. The list is the unit under test here, not the tab strip.
    const { MarketList } = await import('../lib/client/components/MarketList.js')
    const { TranslateProvider } = await import('../lib/client/translate.js')

    const html = renderToStaticMarkup(
      React.createElement(TranslateProvider, { t }, React.createElement(MarketList, {
        state: {
          section: 'market',
          filters: { q: '', source: 'all', security: 'all', installed: 'all' },
          searchDraft: '',
          items: [skill()],
          sources: null,
          nextCursor: null,
          loading: false,
          loadingMore: false,
          error: null,
          itemStatuses: {},
          installingIds: [],
        },
        scrollRoot: { current: null },
        onOpen: () => undefined,
        onInstall: () => undefined,
        onLoadMore: () => undefined,
        onSearchDraft: () => undefined,
        onSubmitSearch: () => undefined,
        onClearFilters: () => undefined,
        onSetSource: () => undefined,
        onSetSecurity: () => undefined,
        onSetInstalled: () => undefined,
        onRetry: () => undefined,
      })),
    )

    assert.match(html, /type="search"/, 'the search field is present')
    assert.match(html, /aria-label="filterSource"/, 'the filter bar is present')
    assert.match(html, /Demo Skill/)
  })

  it('renders a skill card from a normalized record', async () => {
    const { SkillGrid } = await import('../lib/client/components/SkillCard.js')
    const { TranslateProvider } = await import('../lib/client/translate.js')

    const html = renderToStaticMarkup(
      React.createElement(TranslateProvider, { t }, React.createElement(SkillGrid, {
        skills: [skill(), skill({ id: 'skillhub:other', source: 'skillhub', name: 'Other', installState: 'installed' })],
        installingIds: [],
        onOpen: () => undefined,
        onInstall: () => undefined,
      })),
    )

    assert.match(html, /Demo Skill/)
    assert.match(html, /Other/)
    assert.match(html, /clawhub/)
    assert.match(html, /skillhub/)
    // An installed card shows the installed label rather than an install button.
    assert.match(html, /installed/)
  })

  it('renders a flagged verdict instead of hiding it', async () => {
    const { SkillGrid } = await import('../lib/client/components/SkillCard.js')
    const { TranslateProvider } = await import('../lib/client/translate.js')

    const html = renderToStaticMarkup(
      React.createElement(TranslateProvider, { t }, React.createElement(SkillGrid, {
        skills: [skill({ securityStatus: 'flagged' })],
        installingIds: [],
        onOpen: () => undefined,
        onInstall: () => undefined,
      })),
    )
    assert.match(html, /securityFlagged/)
  })

  it('renders classification chips on a card', async () => {
    const { SkillGrid } = await import('../lib/client/components/SkillCard.js')
    const { TranslateProvider } = await import('../lib/client/translate.js')

    const html = renderToStaticMarkup(
      React.createElement(TranslateProvider, { t, locale: 'zh' }, React.createElement(SkillGrid, {
        skills: [skill({
          categories: [
            { key: 'design-poster', labelZh: '海报设计', labelEn: 'Poster Design' },
            { key: 'content-creation', labelZh: '内容创作', labelEn: 'Content Creation' },
          ],
        })],
        installingIds: [],
        onOpen: () => undefined,
        onInstall: () => undefined,
      })),
    )

    // The label the reader sees, and the stable key behind it.
    assert.match(html, /海报设计/)
    assert.match(html, /title="design-poster"/)
  })

  it('shows the registry label in the reader\u2019s language, not a fixed one', async () => {
    const { SkillGrid } = await import('../lib/client/components/SkillCard.js')
    const { TranslateProvider } = await import('../lib/client/translate.js')

    const categories = [{ key: 'design-poster', labelZh: '海报设计', labelEn: 'Poster Design' }]
    const render = (locale) => renderToStaticMarkup(
      React.createElement(TranslateProvider, { t, locale }, React.createElement(SkillGrid, {
        skills: [skill({ categories })],
        installingIds: [],
        onOpen: () => undefined,
        onInstall: () => undefined,
      })),
    )

    assert.match(render('zh'), /海报设计/)
    assert.match(render('en'), /Poster Design/)
  })

  it('falls back through the labels and finally to the key, never to nothing', async () => {
    const { SkillGrid } = await import('../lib/client/components/SkillCard.js')
    const { TranslateProvider } = await import('../lib/client/translate.js')

    const html = renderToStaticMarkup(
      React.createElement(TranslateProvider, { t, locale: 'zh' }, React.createElement(SkillGrid, {
        skills: [skill({
          categories: [
            // Label in the other language only: still better than the key.
            { key: 'knowledge', labelEn: 'Knowledge' },
            // No label at all: the key, de-hyphenated.
            { key: 'business-ops' },
          ],
        })],
        installingIds: [],
        onOpen: () => undefined,
        onInstall: () => undefined,
      })),
    )

    assert.match(html, /Knowledge/)
    assert.match(html, /Business Ops/)
    assert.match(html, /title="business-ops"/, 'the stable key stays reachable on hover')
  })

  it('caps the chips on a card and names the overflow', async () => {
    const { SkillGrid } = await import('../lib/client/components/SkillCard.js')
    const { TranslateProvider } = await import('../lib/client/translate.js')

    const html = renderToStaticMarkup(
      React.createElement(TranslateProvider, { t, locale: 'en' }, React.createElement(SkillGrid, {
        skills: [skill({
          categories: [
            { key: 'a-one', labelEn: 'Alpha' },
            { key: 'b-two', labelEn: 'Beta' },
            { key: 'c-three', labelEn: 'Gamma' },
            { key: 'd-four', labelEn: 'Delta' },
          ],
        })],
        installingIds: [],
        onOpen: () => undefined,
        onInstall: () => undefined,
      })),
    )

    assert.match(html, /Alpha/)
    assert.match(html, /Beta/)
    // The label is read out of the chip's own body, not searched for across the
    // document: the overflow tooltip names the hidden labels on purpose.
    assert.ok(!/>Gamma</.test(html), `a card must stay scannable:\n${html}`)
    assert.match(html, />\+2</, 'the hidden count is shown')
    assert.match(html, /title="Gamma \/ Delta"/, 'and the hidden labels are named on hover')
  })

  it('renders the detail view across all four tabs', async () => {
    const { MarketDetail } = await import('../lib/client/components/MarketDetail.js')
    const { TranslateProvider } = await import('../lib/client/translate.js')

    const detail = {
      ...skill(),
      description: '# Demo\n\nBody text.',
      license: 'MIT',
      files: [
        { path: 'SKILL.md', size: 1024, language: 'markdown', tooBig: false },
        { path: 'reference/notes.md', size: 2048, language: 'markdown', tooBig: false },
      ],
      totalSize: 3072,
      securityReports: [{ vendor: 'vt', status: 'clean', statusText: 'No detections', reportUrl: 'https://example.invalid/r' }],
      changelog: { version: '1.0.0', text: 'Initial release' },
      pageUrl: 'https://clawhub.ai/author/skills/demo',
    }

    for (const tab of ['overview', 'files', 'security', 'changelog']) {
      const html = renderToStaticMarkup(
        React.createElement(TranslateProvider, { t }, React.createElement(MarketDetail, {
          detail,
          loading: false,
          error: null,
          tab,
          file: tab === 'files' ? { path: 'SKILL.md', content: '---\nname: demo\n---', language: 'markdown', size: 20, truncated: false } : null,
          fileLoading: false,
          fileError: null,
          busy: false,
          onBack: () => undefined,
          onSetTab: () => undefined,
          onSelectFile: () => undefined,
          onInstall: () => undefined,
          onRetry: () => undefined,
        })),
      )
      assert.ok(html.length > 100, `the ${tab} tab must render something`)
      assert.match(html, /Demo Skill/)
    }
  })

  it('renders the loading and failed states without crashing', async () => {
    const { MarketDetail } = await import('../lib/client/components/MarketDetail.js')
    const { TranslateProvider } = await import('../lib/client/translate.js')

    const base = {
      tab: 'overview', file: null, fileLoading: false, fileError: null, busy: false,
      onBack: () => undefined, onSetTab: () => undefined, onSelectFile: () => undefined,
      onInstall: () => undefined, onRetry: () => undefined,
    }

    const loading = renderToStaticMarkup(
      React.createElement(TranslateProvider, { t }, React.createElement(MarketDetail, {
        ...base, detail: null, loading: true, error: null,
      })),
    )
    assert.ok(loading.length > 0, 'a loading detail renders a skeleton')

    const failed = renderToStaticMarkup(
      React.createElement(TranslateProvider, { t }, React.createElement(MarketDetail, {
        ...base, detail: null, loading: false, error: 'MARKET_UPSTREAM_TIMEOUT',
      })),
    )
    assert.match(failed, /MARKET_UPSTREAM_TIMEOUT/, 'the failure reason reaches the reader')
  })

  it('renders the installed inventory, managed and unmanaged alike', async () => {
    const { InstalledPanel } = await import('../lib/client/components/InstalledPanel.js')
    const { TranslateProvider } = await import('../lib/client/translate.js')

    const html = renderToStaticMarkup(
      React.createElement(TranslateProvider, { t }, React.createElement(InstalledPanel, {
        items: [
          {
            key: 'a'.repeat(64), linked: false, removable: true, id: 'clawhub:demo', source: 'clawhub', slug: 'demo',
            owner: 'author', name: 'Demo Skill', dirName: 'demo', dirPath: 'C:/skills/demo',
            version: '1.0.0', installedAt: '2026-01-01T00:00:00.000Z', managed: true, bytes: 2048, fileCount: 3,
          },
          {
            key: 'b'.repeat(64), linked: false, removable: true, id: 'local:handwritten', source: 'local', slug: 'handwritten',
            name: 'Handwritten', dirName: 'handwritten', dirPath: 'C:/skills/handwritten',
            managed: false, bytes: 512, fileCount: 1,
          },
        ],
        loading: false,
        error: null,
        detail: null,
        detailLoading: false,
        detailError: null,
        file: null,
        fileLoading: false,
        fileError: null,
        onRefresh: () => undefined,
        onOpen: () => undefined,
        onCloseDetail: () => undefined,
        onSelectFile: () => undefined,
        onRequestRemove: () => undefined,
      })),
    )

    assert.match(html, /Demo Skill/)
    assert.match(html, /Handwritten/)
    assert.match(html, /installedManaged/)
    assert.match(html, /installedLocal/)
    // The absolute path is shown before removal, which is the confirmation's point.
    assert.match(html, /C:\/skills\/demo/)
  })

  it('offers no removal control for an unmanaged entry', async () => {
    const { InstalledPanel } = await import('../lib/client/components/InstalledPanel.js')
    const { TranslateProvider } = await import('../lib/client/translate.js')

    const html = renderToStaticMarkup(
      React.createElement(TranslateProvider, { t }, React.createElement(InstalledPanel, {
        items: [{
          key: 'b'.repeat(64), linked: false, removable: true, id: 'local:handwritten', source: 'local', slug: 'handwritten',
          name: 'Handwritten', dirName: 'handwritten', dirPath: 'C:/skills/handwritten',
          managed: false, bytes: 512, fileCount: 1,
        }],
        loading: false, error: null, detail: null, detailLoading: false, detailError: null,
        file: null, fileLoading: false, fileError: null,
        onRefresh: () => undefined, onOpen: () => undefined, onCloseDetail: () => undefined,
        onSelectFile: () => undefined, onRequestRemove: () => undefined,
      })),
    )

    // The host would refuse this removal; offering the button anyway would be a
    // control that only ever fails.
    assert.ok(!html.includes('>uninstall<'), `unmanaged rows must not offer removal:\n${html}`)
    assert.ok(!html.includes('>uninstallDisabled<'))
  })

  it('renders the install confirmation with its acknowledgement gate', async () => {
    const { ConfirmInstallDialog } = await import('../lib/client/components/Dialogs.js')
    const { TranslateProvider } = await import('../lib/client/translate.js')

    const html = renderToStaticMarkup(
      React.createElement(TranslateProvider, { t }, React.createElement(ConfirmInstallDialog, {
        name: 'Demo Skill',
        source: 'clawhub',
        owner: 'author',
        version: '1.0.0',
        securityLabel: 'benign',
        requiresKey: true,
        busy: false,
        onCancel: () => undefined,
        onConfirm: () => undefined,
      })),
    )

    assert.match(html, /role="dialog"/)
    assert.match(html, /aria-modal="true"/)
    assert.match(html, /type="checkbox"/)
    // The confirm button starts disabled: the acknowledgement is not decorative.
    assert.match(html, /disabled=""/)
    assert.match(html, /installAcknowledge/)
  })

  it('names the exact directory in the removal confirmation', async () => {
    const { ConfirmRemoveDialog } = await import('../lib/client/components/Dialogs.js')
    const { TranslateProvider } = await import('../lib/client/translate.js')

    const html = renderToStaticMarkup(
      React.createElement(TranslateProvider, { t }, React.createElement(ConfirmRemoveDialog, {
        name: 'Demo Skill',
        dirPath: 'C:/skills/demo',
        busy: false,
        onCancel: () => undefined,
        onConfirm: () => undefined,
      })),
    )
    assert.match(html, /C:\/skills\/demo/)
  })

  it('shows both popularity figures on a card, not just downloads', async () => {
    const { SkillGrid } = await import('../lib/client/components/SkillCard.js')
    const { TranslateProvider } = await import('../lib/client/translate.js')

    const html = renderToStaticMarkup(
      React.createElement(TranslateProvider, { t }, React.createElement(SkillGrid, {
        skills: [skill({ stats: { downloads: 484723, installs: 18487, stars: 3998 } })],
        installingIds: [],
        onOpen: () => undefined,
        onInstall: () => undefined,
      })),
    )

    // The keys come back verbatim because the test's `t` is the identity, so each
    // assertion names the dictionary entry the UI reads.
    assert.match(html, /detailDownloads/)
    assert.match(html, /detailStars/)
    assert.match(html, /4\.0k/, 'stars are rendered with the same compaction as downloads')
    assert.match(html, /485k/)
  })

  it('renders a star count of zero rather than an empty figure', async () => {
    const { SkillGrid } = await import('../lib/client/components/SkillCard.js')
    const { TranslateProvider } = await import('../lib/client/translate.js')

    const html = renderToStaticMarkup(
      React.createElement(TranslateProvider, { t }, React.createElement(SkillGrid, {
        // Most SkillHub entries really are zero; that is the registry's figure, and
        // an em dash here would read as "unknown" instead of "nobody starred it".
        skills: [skill({ stats: { downloads: 13, stars: 0 } })],
        installingIds: [],
        onOpen: () => undefined,
        onInstall: () => undefined,
      })),
    )

    assert.match(html, /detailStars 0<\/span>/, 'the label and its zero are both rendered')
  })

  it('labels every installed row with the registry it came from', async () => {
    const { InstalledPanel } = await import('../lib/client/components/InstalledPanel.js')
    const { TranslateProvider } = await import('../lib/client/translate.js')

    const html = renderToStaticMarkup(
      React.createElement(TranslateProvider, { t }, React.createElement(InstalledPanel, {
        items: [
          installed({ key: 'a'.repeat(64), id: 'clawhub:demo', source: 'clawhub', slug: 'demo', name: 'From ClawHub' }),
          installed({ key: 'b'.repeat(64), id: 'skillhub:other', source: 'skillhub', slug: 'other', name: 'From SkillHub' }),
          installed({ key: 'c'.repeat(64), id: 'local:mine', source: 'local', slug: 'mine', name: 'Handwritten', managed: false }),
        ],
        loading: false, error: null, detail: null, detailLoading: false, detailError: null,
        file: null, fileLoading: false, fileError: null,
        onRefresh: () => undefined, onOpen: () => undefined, onCloseDetail: () => undefined,
        onSelectFile: () => undefined, onRequestRemove: () => undefined,
      })),
    )

    assert.match(html, /title="installedFilterSourceHint"[^>]*>clawhub<\/span>/, 'the registry id, in the card\u2019s own spelling')
    assert.match(html, /title="installedFilterSourceHint"[^>]*>skillhub<\/span>/)
    assert.match(html, />installedSourceLocal</)
  })

  it('offers only the sources the inventory actually holds', async () => {
    const { InstalledPanel } = await import('../lib/client/components/InstalledPanel.js')
    const { TranslateProvider } = await import('../lib/client/translate.js')

    const render = (items) => renderToStaticMarkup(
      React.createElement(TranslateProvider, { t }, React.createElement(InstalledPanel, {
        items, loading: false, error: null, detail: null, detailLoading: false, detailError: null,
        file: null, fileLoading: false, fileError: null,
        onRefresh: () => undefined, onOpen: () => undefined, onCloseDetail: () => undefined,
        onSelectFile: () => undefined, onRequestRemove: () => undefined,
      })),
    )

    const onlyLocal = render([installed({ key: 'c'.repeat(64), source: 'local', managed: false })])
    assert.match(onlyLocal, /<option value="all"/)
    assert.match(onlyLocal, /<option value="local"/)
    // A filter that can only ever empty the list is not offered.
    assert.ok(!onlyLocal.includes('<option value="clawhub"'), `unexpected option:\n${onlyLocal}`)
    assert.ok(!onlyLocal.includes('<option value="skillhub"'))

    const mixed = render([
      installed({ key: 'a'.repeat(64), source: 'clawhub' }),
      installed({ key: 'b'.repeat(64), source: 'skillhub' }),
    ])
    assert.match(mixed, /<option value="clawhub"/)
    assert.match(mixed, /<option value="skillhub"/)
    assert.ok(!mixed.includes('<option value="local"'))
  })

  it('carries the source filter\u2019s purpose in its accessible description', async () => {
    const { InstalledPanel } = await import('../lib/client/components/InstalledPanel.js')
    const { TranslateProvider } = await import('../lib/client/translate.js')

    const html = renderToStaticMarkup(
      React.createElement(TranslateProvider, { t }, React.createElement(InstalledPanel, {
        items: [installed({})],
        loading: false, error: null, detail: null, detailLoading: false, detailError: null,
        file: null, fileLoading: false, fileError: null,
        onRefresh: () => undefined, onOpen: () => undefined, onCloseDetail: () => undefined,
        onSelectFile: () => undefined, onRequestRemove: () => undefined,
      })),
    )

    assert.match(html, /aria-label="installedFilterSource"/)
    assert.match(html, /title="installedFilterSourceHint"/)
  })

  it('narrows the installed list by source, and by search inside it', async () => {
    // The filter's decision, driven directly. A static render cannot set the
    // dropdown — `renderToStaticMarkup` runs no handlers — so the pure function is
    // the only place this behaviour is testable, which is why it exists.
    const { filterInstalled } = await import('../lib/client/components/InstalledPanel.js')

    const items = [
      installed({ key: 'a'.repeat(64), id: 'clawhub:alpha', source: 'clawhub', slug: 'alpha', name: 'Alpha' }),
      installed({ key: 'b'.repeat(64), id: 'skillhub:beta', source: 'skillhub', slug: 'beta', name: 'Beta' }),
      installed({ key: 'c'.repeat(64), id: 'local:gamma', source: 'local', slug: 'gamma', name: 'Gamma', managed: false }),
    ]
    const slugs = (list) => list.map((entry) => entry.slug)

    assert.deepEqual(slugs(filterInstalled(items, 'all', '')), ['alpha', 'beta', 'gamma'])
    assert.deepEqual(slugs(filterInstalled(items, 'clawhub', '')), ['alpha'])
    assert.deepEqual(slugs(filterInstalled(items, 'skillhub', '')), ['beta'])
    assert.deepEqual(slugs(filterInstalled(items, 'local', '')), ['gamma'])
    assert.deepEqual(slugs(filterInstalled(items, 'clawhub', 'beta')), [], 'the two conditions are an AND')
    assert.deepEqual(slugs(filterInstalled(items, 'all', '  BETA ')), ['beta'], 'the search still ignores case and padding')
    assert.deepEqual(slugs(filterInstalled(items, 'local', 'gam')), ['gamma'])
  })

  it('throws when a component is used outside the translate provider', async () => {
    const { SkillGrid } = await import('../lib/client/components/SkillCard.js')

    // A missing provider is a wiring mistake; printing raw keys would hide it.
    assert.throws(
      () => renderToStaticMarkup(
        React.createElement(SkillGrid, {
          skills: [skill()], installingIds: [], onOpen: () => undefined, onInstall: () => undefined,
        }),
      ),
      /TranslateProvider/,
    )
  })

  it('renders the Discover shelves, their rows, and the way out to the market', async () => {
    const { DiscoverPanel } = await import('../lib/client/components/DiscoverPanel.js')
    const { TranslateProvider } = await import('../lib/client/translate.js')

    const collections = [
      { id: 'featured', metric: 'downloads', items: [skill({ name: 'Featured One' })] },
      { id: 'newest', metric: 'updatedAt', items: [skill({ id: 'clawhub:fresh', slug: 'fresh', name: 'Fresh One', updatedAt: 1_700_000_000_000 })] },
    ]

    const html = renderToStaticMarkup(
      React.createElement(TranslateProvider, { t, locale: 'zh' }, React.createElement(DiscoverPanel, {
        collections,
        active: 'featured',
        loading: false,
        error: null,
        installingIds: [],
        sources: null,
        onSelect: () => undefined,
        onOpen: () => undefined,
        onInstall: () => undefined,
        onRefresh: () => undefined,
        onFindMore: () => undefined,
      })),
    )

    // Every shelf is reachable, not just the selected one.
    assert.match(html, /discoverFeatured/)
    assert.match(html, /discoverNewest/)
    assert.match(html, /Featured One/)
    // The unselected shelf's row is not on screen — one shelf at a time is the point.
    assert.ok(!html.includes('Fresh One'))
    assert.match(html, /@author/, 'the author travels with the name')
    assert.match(html, /discoverFindMore/, 'the way into the market is always offered')
  })

  it('prints the figure a shelf ranked by, rather than downloads everywhere', async () => {
    const { DiscoverPanel } = await import('../lib/client/components/DiscoverPanel.js')
    const { TranslateProvider } = await import('../lib/client/translate.js')

    const render = (metric) => renderToStaticMarkup(
      React.createElement(TranslateProvider, { t, locale: 'zh' }, React.createElement(DiscoverPanel, {
        collections: [{ id: 'newest', metric, items: [skill({ stats: { downloads: 1234, installs: 42, stars: 7 }, updatedAt: 1_700_000_000_000 })] }],
        active: 'newest',
        loading: false,
        error: null,
        installingIds: [],
        sources: null,
        onSelect: () => undefined,
        onOpen: () => undefined,
        onInstall: () => undefined,
        onRefresh: () => undefined,
        onFindMore: () => undefined,
      })),
    )

    // A shelf headed "安装量" that printed a download count would be a claim the host
    // never made, so the number and its heading both come from the collection.
    assert.match(render('installs'), /discoverColumnInstalls/)
    assert.match(render('installs'), /42/)
    assert.match(render('stars'), /discoverColumnStars/)
    assert.match(render('stars'), />7</)
    // A recency shelf shows a date, not an epoch.
    assert.match(render('updatedAt'), /discoverColumnUpdated/)
    assert.match(render('updatedAt'), new RegExp(new Date(1_700_000_000_000).toLocaleDateString().replace(/[/]/g, '\\/')))
  })

  it('announces the first read instead of showing a blank page', async () => {
    const { DiscoverPanel } = await import('../lib/client/components/DiscoverPanel.js')
    const { TranslateProvider } = await import('../lib/client/translate.js')

    const html = renderToStaticMarkup(
      React.createElement(TranslateProvider, { t, locale: 'zh' }, React.createElement(DiscoverPanel, {
        collections: [],
        active: 'featured',
        loading: true,
        error: null,
        installingIds: [],
        sources: null,
        onSelect: () => undefined,
        onOpen: () => undefined,
        onInstall: () => undefined,
        onRefresh: () => undefined,
        onFindMore: () => undefined,
      })),
    )

    // A live region, not just a spinner: the Discover read is three upstream pages
    // (~1.3s warm, ~4.1s cold), so this is a state a reader sits in for a while, and
    // a screen reader has to be told about it in words.
    assert.match(html, /role="status"/)
    assert.match(html, /aria-live="polite"/)
    assert.match(html, /discoverLoading/)
    // And the placeholder is the shape of the thing that is coming, so the page does
    // not visibly jump when it arrives.
    assert.match(html, /smh-slide/, 'the indeterminate bar is there for sighted readers')
  })

  it('keeps the shelves on screen while a refresh runs, instead of replacing them', async () => {
    const { DiscoverPanel } = await import('../lib/client/components/DiscoverPanel.js')
    const { TranslateProvider } = await import('../lib/client/translate.js')

    const html = renderToStaticMarkup(
      React.createElement(TranslateProvider, { t, locale: 'zh' }, React.createElement(DiscoverPanel, {
        collections: [{ id: 'featured', metric: 'downloads', items: [skill({ name: 'Still Here' })] }],
        active: 'featured',
        loading: true,
        error: null,
        installingIds: [],
        sources: null,
        onSelect: () => undefined,
        onOpen: () => undefined,
        onInstall: () => undefined,
        onRefresh: () => undefined,
        onFindMore: () => undefined,
      })),
    )

    assert.match(html, /Still Here/, 'the reader keeps the page they were reading')
    assert.match(html, /role="status"/, 'and is told a newer answer is on its way')
  })

  it('resolves an install confirmation from wherever the reader pressed Install', async () => {
    // The gap this closes: the components were tested and the controller was tested,
    // and the *wiring between them* was not — so a button that recorded the click and
    // then rendered no dialog passed every test in this file. A static render cannot
    // press a button, which is why this decision is a pure function.
    const { installTargetOf } = await import('../lib/client/page/MarketPage.js')

    const shelved = skill({ id: 'clawhub:shelved', slug: 'shelved', name: 'On A Shelf' })
    const listed = skill({ id: 'clawhub:listed', slug: 'listed', name: 'In The List' })
    const opened = skill({ id: 'clawhub:opened', slug: 'opened', name: 'Open In Detail' })

    // A Discover-only state, which is what most readers are in when they first press
    // it: the panel opens on Discover and the market list is read lazily, so `items`
    // is empty and the detail page was never opened either. This is the exact state
    // that used to resolve to nothing.
    assert.equal(
      installTargetOf({
        discover: [{ id: 'featured', metric: 'downloads', items: [shelved] }],
        items: [],
        detail: null,
        confirmInstallId: 'clawhub:shelved',
      })?.name,
      'On A Shelf',
    )

    assert.equal(
      installTargetOf({ discover: [], items: [listed], detail: null, confirmInstallId: 'clawhub:listed' })?.name,
      'In The List',
    )
    assert.equal(
      installTargetOf({ discover: [], items: [], detail: opened, confirmInstallId: 'clawhub:opened' })?.name,
      'Open In Detail',
    )

    // Nothing requested, and a request whose skill is on no surface: both must be
    // nothing, because rendering a dialog with no skill is the failure mode.
    assert.equal(installTargetOf({ discover: [], items: [], detail: null, confirmInstallId: null }), undefined)
    assert.equal(
      installTargetOf({ discover: [], items: [], detail: null, confirmInstallId: 'clawhub:gone' }),
      undefined,
    )

    // A skill sitting on two shelves resolves to the same one skill.
    assert.equal(
      installTargetOf({
        discover: [
          { id: 'featured', metric: 'downloads', items: [shelved] },
          { id: 'installs', metric: 'installs', items: [shelved] },
        ],
        items: [],
        detail: null,
        confirmInstallId: 'clawhub:shelved',
      })?.id,
      'clawhub:shelved',
    )
  })

  it('shows an unpublished figure as unknown, not as a zero', async () => {
    const { DiscoverPanel } = await import('../lib/client/components/DiscoverPanel.js')
    const { TranslateProvider } = await import('../lib/client/translate.js')

    const render = (stats) => renderToStaticMarkup(
      React.createElement(TranslateProvider, { t, locale: 'zh' }, React.createElement(DiscoverPanel, {
        collections: [{ id: 'installs', metric: 'installs', items: [skill({ stats })] }],
        active: 'installs',
        loading: false,
        error: null,
        installingIds: [],
        sources: null,
        onSelect: () => undefined,
        onOpen: () => undefined,
        onInstall: () => undefined,
        onRefresh: () => undefined,
        onFindMore: () => undefined,
      })),
    )

    // The registry published a zero: that is its figure, and it is shown.
    assert.match(render({ downloads: 13, installs: 0 }), />0</)
    // The registry published nothing: a zero here would turn silence into a claim
    // that nobody installed it, and the ranking already sorts the two differently.
    assert.match(render({ downloads: 13 }), />—</)
    assert.ok(!/aria-label="discoverColumnInstalls 0"/.test(render({ downloads: 13 })))
  })

  it('renders an empty shelf with the reason instead of hiding it', async () => {
    const { DiscoverPanel } = await import('../lib/client/components/DiscoverPanel.js')
    const { TranslateProvider } = await import('../lib/client/translate.js')

    const html = renderToStaticMarkup(
      React.createElement(TranslateProvider, { t, locale: 'zh' }, React.createElement(DiscoverPanel, {
        collections: [
          { id: 'official', metric: 'downloads', items: [] },
          { id: 'newest', metric: 'updatedAt', items: [] },
        ],
        active: 'official',
        loading: false,
        error: null,
        installingIds: [],
        sources: null,
        onSelect: () => undefined,
        onOpen: () => undefined,
        onInstall: () => undefined,
        onRefresh: () => undefined,
        onFindMore: () => undefined,
      })),
    )

    assert.match(html, /discoverShelfEmpty/)
    // Two keys, two jobs: the one-line signpost sits under the tabs, and the full
    // rule — the thing a reader who doubts the shelf actually wants — appears here,
    // where they are asking why it is empty.
    assert.match(html, /discoverOfficialHint/, 'the signpost names the shelf')
    assert.match(html, /discoverOfficialRule/, 'and the reason is given, not just the absence')
    // And the shelf is still offered, so its absence is legible rather than silent.
    assert.match(html, /discoverOfficial/)
  })

  it('marks a registry-verified row, and says which registry answered badly', async () => {
    const { DiscoverPanel } = await import('../lib/client/components/DiscoverPanel.js')
    const { TranslateProvider } = await import('../lib/client/translate.js')

    const html = renderToStaticMarkup(
      React.createElement(TranslateProvider, { t, locale: 'zh' }, React.createElement(DiscoverPanel, {
        collections: [{ id: 'official', metric: 'downloads', items: [skill({ verified: true })] }],
        active: 'official',
        loading: false,
        error: null,
        installingIds: [],
        sources: { clawhub: { status: 'failed' }, skillhub: { status: 'ok' } },
        onSelect: () => undefined,
        onOpen: () => undefined,
        onInstall: () => undefined,
        onRefresh: () => undefined,
        onFindMore: () => undefined,
      })),
    )

    assert.match(html, /discoverVerified/)
    assert.match(html, /discoverDegraded/)
    assert.match(html, /clawhub/, 'the registry that failed is named')
  })

  it('reports a failed shelf read without throwing the page away', async () => {
    const { DiscoverPanel } = await import('../lib/client/components/DiscoverPanel.js')
    const { TranslateProvider } = await import('../lib/client/translate.js')

    const base = {
      active: 'featured',
      loading: false,
      installingIds: [],
      sources: null,
      onSelect: () => undefined,
      onOpen: () => undefined,
      onInstall: () => undefined,
      onRefresh: () => undefined,
      onFindMore: () => undefined,
    }

    const failed = renderToStaticMarkup(
      React.createElement(TranslateProvider, { t, locale: 'zh' }, React.createElement(DiscoverPanel, {
        ...base, collections: [], error: 'MARKET_UPSTREAM_TIMEOUT',
      })),
    )
    assert.match(failed, /MARKET_UPSTREAM_TIMEOUT/, 'the failure reason reaches the reader')
    assert.match(failed, /retry/)

    // A refresh that failed while shelves were already on screen keeps them.
    const stale = renderToStaticMarkup(
      React.createElement(TranslateProvider, { t, locale: 'zh' }, React.createElement(DiscoverPanel, {
        ...base, collections: [{ id: 'featured', metric: 'downloads', items: [skill()] }], error: 'down',
      })),
    )
    assert.match(stale, /Demo Skill/)
    assert.match(stale, /down/)
  })
})
