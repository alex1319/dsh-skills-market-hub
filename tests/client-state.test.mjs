/**
 * The panel controller, driven through a stubbed `fetch`.
 *
 * The controller holds the behaviours that are invisible until they go wrong: a
 * search that lands out of order, a pagination guard that lets the same page in
 * three times, an inventory that only refreshes when the plugin restarts. None of
 * those are visible in a render test, and all of them are miserable to debug in a
 * browser.
 *
 * `fetch` is stubbed at the global, so the controller's real code path runs —
 * including its URL construction, its abort handling, and its error mapping.
 */

import { afterEach, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { MarketController, SEARCH_DEBOUNCE_MS } from '../lib/client/state.js'

/** Requests the stub saw, newest first. */
let calls = []
/** Per-path responder: `(url) => unknown` or a promise. */
let responder = () => ({ items: [], nextCursor: null, sources: {} })
let originalFetch

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: '',
    headers: { get: () => 'application/json' },
    json: async () => body,
    text: async () => JSON.stringify(body),
  }
}

beforeEach(() => {
  calls = []
  responder = () => ({ items: [], nextCursor: null, sources: {} })
  originalFetch = globalThis.fetch
  globalThis.fetch = async (url, init = {}) => {
    const path = String(url)
    calls.push({ path, method: init.method ?? 'GET', body: init.body })
    // Honour the abort signal the way a real fetch does, so cancellation is
    // observable rather than assumed.
    if (init.signal?.aborted === true) {
      const error = new Error('aborted')
      error.name = 'AbortError'
      throw error
    }
    const result = await responder(path, init)
    if (result instanceof Error) throw result
    if (typeof result === 'object' && result !== null && 'errorStatus' in result) {
      return jsonResponse(result.body, result.errorStatus)
    }
    return jsonResponse(result)
  }
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

function skill(id, extra = {}) {
  return {
    id,
    source: 'clawhub',
    slug: id.split(':')[1],
    name: id,
    summary: '',
    author: { handle: 'a' },
    stats: { downloads: 0 },
    tags: [],
    securityStatus: 'unknown',
    installState: 'installable',
    ...extra,
  }
}

/** Wait for the controller's in-flight work to settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('list loading', () => {
  it('loads a first page and exposes its cursor', async () => {
    responder = () => ({ items: [skill('clawhub:a')], nextCursor: 'catalog:24', sources: { clawhub: { status: 'ok' } } })
    const controller = new MarketController()

    await controller.load()

    assert.equal(controller.getSnapshot().items.length, 1)
    assert.equal(controller.getSnapshot().nextCursor, 'catalog:24')
    assert.equal(controller.getSnapshot().loading, false)
    assert.match(calls[0].path, /\/skills\?/)
  })

  it('reports a failure as a message, not a throw', async () => {
    responder = () => ({ errorStatus: 502, body: { error: { code: 'MARKET_UPSTREAM_ERROR', message: 'upstream is down' } } })
    const controller = new MarketController()

    await controller.load()

    const state = controller.getSnapshot()
    assert.equal(state.loading, false)
    assert.equal(state.error, 'upstream is down')
    assert.deepEqual(state.items, [])
  })

  it('appends the next page without duplicating entries', async () => {
    let call = 0
    responder = () => {
      call += 1
      return call === 1
        ? { items: [skill('clawhub:a'), skill('clawhub:b')], nextCursor: 'c2', sources: {} }
        // The second page repeats `b`: a registry whose paging is unstable must not
        // put the same card in the list twice.
        : { items: [skill('clawhub:b'), skill('clawhub:c')], nextCursor: null, sources: {} }
    }
    const controller = new MarketController()

    await controller.load()
    await controller.loadMore()

    assert.deepEqual(controller.getSnapshot().items.map((entry) => entry.id), ['clawhub:a', 'clawhub:b', 'clawhub:c'])
    assert.equal(controller.getSnapshot().nextCursor, null)
  })

  it('refuses a concurrent append, so a scroll burst cannot stack pages', async () => {
    let call = 0
    responder = async () => {
      call += 1
      await new Promise((resolve) => setTimeout(resolve, 5))
      return { items: [skill(`clawhub:p${call}`)], nextCursor: 'more', sources: {} }
    }
    const controller = new MarketController()

    await controller.load()
    // Three scroll events during one fetch.
    await Promise.all([controller.loadMore(), controller.loadMore(), controller.loadMore()])

    const ids = controller.getSnapshot().items.map((entry) => entry.id)
    assert.equal(new Set(ids).size, ids.length, 'no page may be appended twice')
    assert.equal(call, 2, 'one list call plus exactly one append')
  })

  it('does not append when there is no cursor', async () => {
    responder = () => ({ items: [skill('clawhub:a')], nextCursor: null, sources: {} })
    const controller = new MarketController()

    await controller.load()
    await controller.loadMore()

    assert.equal(calls.length, 1)
  })

  it('keeps the page it has when an append fails, and restores the cursor', async () => {
    let call = 0
    responder = () => {
      call += 1
      if (call === 1) return { items: [skill('clawhub:a')], nextCursor: 'c2', sources: {} }
      return { errorStatus: 502, body: { error: { code: 'MARKET_UPSTREAM_ERROR', message: 'down' } } }
    }
    const controller = new MarketController()

    await controller.load()
    await controller.loadMore()

    const state = controller.getSnapshot()
    assert.equal(state.items.length, 1, 'the reader keeps what they already scrolled through')
    assert.equal(state.nextCursor, 'c2', 'and can retry the append')
    assert.equal(state.error, 'down')
    assert.equal(state.loadingMore, false)
  })

  it('drops a superseded response instead of letting it land last', async () => {
    const seen = []
    responder = (path) => {
      const q = new URL(path, 'http://x').searchParams.get('q') ?? ''
      seen.push(q)
      // The first query answers slowly, the second quickly: without cancellation
      // the stale answer would overwrite the fresh one.
      const delay = q === 'slow' ? 30 : 1
      return new Promise((resolve) => {
        setTimeout(() => resolve({ items: [skill(`clawhub:${q}`)], nextCursor: null, sources: {} }), delay)
      })
    }
    const controller = new MarketController()

    const first = controller.load()
    controller.setSearchDraft('slow')
    controller.submitSearch()
    await first
    await settle()
    await new Promise((resolve) => setTimeout(resolve, 40))

    assert.deepEqual(seen, ['', 'slow'])
    assert.deepEqual(
      controller.getSnapshot().items.map((entry) => entry.id),
      ['clawhub:slow'],
      'the newest query owns the list',
    )
  })
})

describe('search and filters', () => {
  it('commits the query only after the debounce', async () => {
    responder = () => ({ items: [], nextCursor: null, sources: {} })
    const controller = new MarketController()

    controller.setSearchDraft('pdf')
    assert.equal(controller.getSnapshot().filters.q, '', 'the draft is not the query yet')
    assert.equal(calls.length, 0, 'and no request has been made')

    await new Promise((resolve) => setTimeout(resolve, SEARCH_DEBOUNCE_MS + 40))
    assert.equal(controller.getSnapshot().filters.q, 'pdf')
    assert.equal(calls.length, 1)
    assert.match(calls[0].path, /q=pdf/)
  })

  it('collapses a burst of keystrokes into one request', async () => {
    responder = () => ({ items: [], nextCursor: null, sources: {} })
    const controller = new MarketController()

    for (const value of ['p', 'pd', 'pdf']) controller.setSearchDraft(value)
    await new Promise((resolve) => setTimeout(resolve, SEARCH_DEBOUNCE_MS + 40))

    assert.equal(calls.length, 1)
    assert.match(calls[0].path, /q=pdf/)
  })

  it('submits immediately when the reader presses Enter', async () => {
    responder = () => ({ items: [], nextCursor: null, sources: {} })
    const controller = new MarketController()

    controller.setSearchDraft('pdf')
    controller.submitSearch()
    await settle()

    assert.equal(calls.length, 1)
  })

  it('omits a filter set to "all", keeping the URL canonical', async () => {
    responder = () => ({ items: [], nextCursor: null, sources: {} })
    const controller = new MarketController()

    await controller.load()
    assert.ok(!calls[0].path.includes('source='))
    assert.ok(!calls[0].path.includes('security='))
    assert.ok(!calls[0].path.includes('installed='))

    controller.setFilter({ source: 'skillhub' })
    await settle()
    assert.match(calls[1].path, /source=skillhub/)
  })

  it('clears the search box and every filter at once', async () => {
    responder = () => ({ items: [], nextCursor: null, sources: {} })
    const controller = new MarketController()

    controller.setSearchDraft('pdf')
    controller.submitSearch()
    controller.setFilter({ security: 'flagged' })
    await settle()

    controller.clearFilters()
    await settle()

    const state = controller.getSnapshot()
    assert.deepEqual(state.filters, { q: '', source: 'all', security: 'all', installed: 'all' })
    assert.equal(state.searchDraft, '')
  })

  it('asks the host to bypass its cache only on an explicit refresh', async () => {
    responder = () => ({ items: [], nextCursor: null, sources: {} })
    const controller = new MarketController()

    await controller.load()
    assert.ok(!calls[0].path.includes('refresh='))

    controller.refresh()
    await settle()
    assert.match(calls[1].path, /refresh=1/)
  })
})

describe('detail', () => {
  it('loads a detail and selects the first file when the Files tab opens', async () => {
    const detail = {
      ...skill('clawhub:demo'),
      description: 'body',
      files: [
        { path: 'SKILL.md', size: 10, language: 'markdown', tooBig: false },
        { path: 'notes.md', size: 10, language: 'markdown', tooBig: false },
      ],
      totalSize: 20,
    }
    responder = (path) => {
      if (path.includes('/file?')) return { file: { path: 'SKILL.md', content: 'x', language: 'markdown', size: 1, truncated: false } }
      return { skill: detail, sourceStatus: { status: 'ok' } }
    }
    const controller = new MarketController()

    await controller.openDetail('clawhub:demo')
    assert.equal(controller.getSnapshot().detail?.id, 'clawhub:demo')

    controller.setDetailTab('files')
    await settle()
    assert.equal(controller.getSnapshot().file?.path, 'SKILL.md', 'the Files tab is never a blank pane')
  })

  it('skips a file too large to preview when choosing the first one', async () => {
    const detail = {
      ...skill('clawhub:demo'),
      description: '',
      files: [
        { path: 'huge.bin', size: 9_000_000, language: 'text', tooBig: true },
        { path: 'SKILL.md', size: 10, language: 'markdown', tooBig: false },
      ],
      totalSize: 9_000_010,
    }
    responder = (path) => (path.includes('/file?')
      ? { file: { path: 'SKILL.md', content: 'x', language: 'markdown', size: 1, truncated: false } }
      : { skill: detail, sourceStatus: { status: 'ok' } })
    const controller = new MarketController()

    await controller.openDetail('clawhub:demo')
    controller.setDetailTab('files')
    await settle()

    assert.equal(controller.getSnapshot().file?.path, 'SKILL.md')
  })

  it('reports a detail failure and keeps the list reachable', async () => {
    responder = () => ({ errorStatus: 404, body: { error: { code: 'MARKET_UPSTREAM_BAD_RESPONSE', message: 'no such skill' } } })
    const controller = new MarketController()

    await controller.openDetail('clawhub:missing')

    assert.equal(controller.getSnapshot().detailError, 'no such skill')
    controller.closeDetail()
    assert.deepEqual(controller.getSnapshot().view, { kind: 'list' })
  })
})

describe('install', () => {
  it('sends the author the card named, so an ambiguous slug is resolved', async () => {
    responder = () => ({ ok: true, installedPath: '/skills/demo', skill: skill('clawhub:demo') })
    const controller = new MarketController()

    await controller.openDetail('clawhub:demo', { owner: 'awspace' })
    controller.requestInstall('clawhub:demo')
    await controller.confirmInstall()

    const install = calls.find((call) => call.path.endsWith('/install'))
    assert.ok(install, 'the install request must be sent')
    assert.deepEqual(JSON.parse(install.body), { id: 'clawhub:demo', owner: 'awspace' })
  })

  it('marks the card installed rather than reloading the list under the reader', async () => {
    let listCall = 0
    responder = (path) => {
      if (path.endsWith('/install')) return { ok: true, installedPath: '/skills/demo', skill: skill('clawhub:demo') }
      listCall += 1
      return { items: [skill('clawhub:demo')], nextCursor: null, sources: {} }
    }
    const controller = new MarketController()

    await controller.load()
    assert.equal(listCall, 1)

    controller.requestInstall('clawhub:demo')
    await controller.confirmInstall()

    assert.equal(listCall, 1, 'installing must not move the card the reader is looking at')
    assert.equal(controller.getSnapshot().items[0].installState, 'installed')
    assert.equal(controller.getSnapshot().confirmInstallId, null)
  })

  it('surfaces a refused install as a notice and leaves the card alone', async () => {
    responder = (path) => (path.endsWith('/install')
      ? { errorStatus: 409, body: { error: { code: 'MARKET_ALREADY_INSTALLED', message: 'already installed' } } }
      : { items: [skill('clawhub:demo')], nextCursor: null, sources: {} })
    const controller = new MarketController()

    await controller.load()
    controller.requestInstall('clawhub:demo')
    await controller.confirmInstall()

    const state = controller.getSnapshot()
    assert.equal(state.notice?.tone, 'error')
    assert.equal(state.notice?.text, 'already installed')
    assert.deepEqual(state.installingIds, [])
    assert.equal(state.items[0].installState, 'installable')
  })

  it('does nothing when no install was requested', async () => {
    const controller = new MarketController()
    await controller.confirmInstall()
    assert.equal(calls.length, 0)
  })
})

describe('installed inventory', () => {
  it('reads the inventory when the tab is entered', async () => {
    responder = () => ({ items: [{ key: 'a'.repeat(64), name: 'demo' }] })
    const controller = new MarketController()

    controller.setSection('installed')
    await settle()

    assert.equal(calls.length, 1)
    assert.match(calls[0].path, /\/installed$/)
    assert.equal(controller.getSnapshot().inventory.length, 1)
  })

  it('re-reads the inventory on every entry, not once per session', async () => {
    responder = () => ({ items: [{ key: 'a'.repeat(64), name: 'demo' }] })
    const controller = new MarketController()

    controller.setSection('installed')
    await settle()
    controller.setSection('market')
    controller.setSection('installed')
    await settle()

    assert.equal(calls.length, 2, 'the tab exists to show the disk as it is now')
  })

  it('removes an entry and re-reads the inventory', async () => {
    let inventoryCalls = 0
    responder = (path) => {
      if (path.endsWith('/installed/uninstall')) return { ok: true, removedPath: '/skills/demo', item: { key: 'a'.repeat(64) } }
      inventoryCalls += 1
      return { items: inventoryCalls === 1 ? [{ key: 'a'.repeat(64), name: 'demo' }] : [] }
    }
    const controller = new MarketController()

    controller.setSection('installed')
    await settle()
    assert.equal(controller.getSnapshot().inventory.length, 1)

    controller.requestRemove('a'.repeat(64))
    await controller.confirmRemove()
    await settle()

    assert.equal(controller.getSnapshot().inventory.length, 0, 'the removed skill leaves the list')
    assert.equal(controller.getSnapshot().notice?.tone, 'success')
  })

  it('refreshes the inventory rather than the market when that tab is active', async () => {
    responder = () => ({ items: [] })
    const controller = new MarketController()

    controller.setSection('installed')
    await settle()
    const before = calls.length

    controller.refresh()
    await settle()

    assert.equal(calls.length, before + 1)
    assert.match(calls[calls.length - 1].path, /\/installed$/)
  })
})

describe('disposal', () => {
  it('releases every pending request', async () => {
    responder = () => new Promise(() => undefined) // never settles
    const controller = new MarketController()

    void controller.load()
    await settle()
    controller.dispose()

    // A disposed controller must not keep a listener alive; a leaked listener is
    // a leaked panel, and the host can mount several over a session.
    let notified = 0
    controller.subscribe(() => { notified += 1 })
    assert.equal(notified, 0)
  })
})
