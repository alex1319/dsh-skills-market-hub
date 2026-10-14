/**
 * Minimal Cordis host stand-ins for the plugin tests.
 *
 * These are deliberately hand-written rather than imported from
 * `@deepseek-ai/cordis`: the point of these tests is to exercise the plugin's
 * *contract* (what it registers, what it answers) against a surface this file
 * fully controls, so a host-internal refactor cannot quietly change what is
 * being asserted. The real host is exercised by loading the plugin into a
 * disposable profile.
 */

import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Build a fake plugin context that records everything the plugin contributes.
 *
 * @param services - service keys resolvable through `ctx.get`, e.g. `{ webServer }`.
 * @returns the context plus the recorded effects, service listeners and logs.
 */
export function fakeContext(services = {}) {
  const effects = []
  const listeners = []
  const logs = []

  const ctx = {
    get(name) {
      return services[name]
    },
    on(event, listener) {
      listeners.push({ event, listener })
      return () => {
        const index = listeners.findIndex((entry) => entry.listener === listener)
        if (index >= 0) listeners.splice(index, 1)
      }
    },
    effect(factory, label) {
      const disposer = factory()
      const wrapped = typeof disposer === 'function' ? disposer : () => undefined
      effects.push({ label, dispose: wrapped })
      return wrapped
    },
    logger: {
      info(message) { logs.push({ level: 'info', message }) },
      warn(message) { logs.push({ level: 'warn', message }) },
      error(message) { logs.push({ level: 'error', message }) },
    },
  }

  return {
    ctx,
    effects,
    listeners,
    logs,
    /** Run every registered effect disposer, newest first (unload semantics). */
    async disposeAll() {
      for (const effect of [...effects].reverse()) await effect.dispose()
      effects.length = 0
    },
    /** Emit a host service event at the plugin's registered listener. */
    emitService(name) {
      for (const entry of [...listeners]) {
        if (entry.event === 'internal/service') entry.listener(name)
      }
    },
  }
}

/**
 * A web-server stand-in that speaks the real HTTP carrier contract.
 *
 * `register` keeps the route table the way `dsh-host-webserver` does (duplicate
 * paths throw), and `listen` serves it over a real socket so the assertions run
 * against actual request/response objects rather than mocks of them.
 */
export function fakeWebServer() {
  const routes = []
  let server = null

  return {
    register(route) {
      if (routes.some((existing) => existing.kind === route.kind && existing.path === route.path)) {
        throw new Error(`duplicate route ${route.kind} ${route.path}`)
      }
      routes.push(route)
      return () => {
        const index = routes.indexOf(route)
        if (index >= 0) routes.splice(index, 1)
      }
    },
    get routes() {
      return routes
    },
    async listen() {
      server = createServer((req, res) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        const match = routes.find((route) => (
          route.kind === 'exact' ? url.pathname === route.path : url.pathname.startsWith(route.path)
        ))
        if (match === undefined) {
          res.writeHead(404, { 'content-type': 'application/json' })
          res.end('{"error":{"code":"NO_ROUTE","message":"no route"}}')
          return
        }
        Promise.resolve(match.handler(req, res)).catch((error) => {
          if (!res.headersSent) res.writeHead(500)
          res.end(String(error))
        })
      })
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
      const address = server.address()
      return `http://127.0.0.1:${address.port}`
    },
    async close() {
      if (server === null) return
      await new Promise((resolve) => server.close(resolve))
      server = null
    },
  }
}

/**
 * Issue one request and decode it the way the browser client does.
 *
 * @returns `{ status, headers, body }` where `body` is parsed JSON when the
 *   response is JSON and the raw text otherwise.
 */
export async function request(base, path, init = {}) {
  const response = await fetch(`${base}${path}`, init)
  const text = await response.text()
  let body = text
  if ((response.headers.get('content-type') ?? '').includes('application/json')) {
    try {
      body = JSON.parse(text)
    } catch {
      // A malformed JSON body is itself worth seeing in the assertion output.
    }
  }
  return { status: response.status, headers: response.headers, body }
}

/** POST a JSON body, the way the panel does. */
export function postJson(base, path, body) {
  return request(base, path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/**
 * Boot the plugin against a throwaway skills root over a real socket.
 *
 * The skills root is a temp directory, and `DSH_HOME` is pointed at another one,
 * so nothing in a test can reach the developer's real skills.
 *
 * @returns handles for the running host; `close()` releases the socket, the
 *   sandbox directory, and the plugin's effects.
 */
export async function bootPlugin(plugin, options = {}) {
  const sandbox = await mkdtemp(join(tmpdir(), 'skills-market-hub-http-'))
  const skillsRoot = options.skillsRoot ?? join(sandbox, 'skills')
  const dshHome = options.dshHome ?? join(sandbox, 'home')

  const previousDshHome = process.env.DSH_HOME
  const previousAgentsHome = process.env.DSH_AGENTS_HOME
  process.env.DSH_HOME = dshHome
  // Keep the shared agents pool inside the sandbox too, so an inventory scan
  // cannot pick up skills the developer really has.
  process.env.DSH_AGENTS_HOME = join(sandbox, 'agents')

  const webServer = fakeWebServer()
  const host = fakeContext(options.services ?? { webServer })
  plugin.apply(host.ctx, { skillsRoot, ...(options.config ?? {}) })
  const base = await webServer.listen()

  return {
    base,
    skillsRoot,
    dshHome,
    sandbox,
    host,
    webServer,
    async close() {
      await webServer.close()
      await host.disposeAll()
      if (previousDshHome === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = previousDshHome
      if (previousAgentsHome === undefined) delete process.env.DSH_AGENTS_HOME
      else process.env.DSH_AGENTS_HOME = previousAgentsHome
      await rm(sandbox, { recursive: true, force: true })
    },
  }
}
