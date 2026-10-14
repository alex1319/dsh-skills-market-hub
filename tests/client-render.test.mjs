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

  it('renders the panel shell with its two sections', async () => {
    const { MarketPage: Page } = await import('../lib/client/page/MarketPage.js')
    const html = renderPanel(Page, { t })

    // The keys come back verbatim because the test's `t` is the identity, so each
    // assertion below names the exact dictionary entry the UI is reading.
    assert.match(html, /role="tablist"/, 'the section switch renders as a tab list')
    assert.match(html, /tabMarket/)
    assert.match(html, /tabInstalled/)
    assert.match(html, /refresh/)
    assert.match(html, /type="search"/, 'the search field is present')
    assert.match(html, /aria-label="filterSource"/, 'the filter bar is present')
    // The first section is the market, and it is selected on open.
    assert.match(html, /aria-selected="true"[^>]*>tabMarket/)
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
})
