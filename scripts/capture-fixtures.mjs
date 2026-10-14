/**
 * Capture upstream response samples into `tests/fixtures/market/`.
 *
 * The normalizers in `src/market/*` are written against the *real* upstream
 * shapes, so the fixtures must come from the real endpoints rather than from a
 * hand-written idea of them. Re-run this when a provider changes its payload and
 * the provider tests start failing: the diff shows exactly what moved.
 *
 * Usage: node scripts/capture-fixtures.mjs
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(fileURLToPath(import.meta.url)).replace(/[\\/]scripts$/, '')
const OUT = join(ROOT, 'tests', 'fixtures', 'market')
const USER_AGENT = 'dsh-skills-market-hub-fixture-capture/0.1'

/**
 * Fixtures come from live registries, so their *content* moves between captures:
 * a download counter ticks, a page-one ranking reshuffles. Tests must therefore
 * derive expectations from the fixture rather than hardcoding a number — but the
 * capture itself should still be as reproducible as the upstream allows, which is
 * what the sort parameters below are for. Anything that cannot be pinned (which
 * entries sit on page one of a popularity ranking) is handled in the tests.
 */
const TARGETS = [
  { file: 'clawhub-list.json', url: 'https://clawhub.ai/api/v1/skills?limit=3&sort=downloads' },
  { file: 'clawhub-search.json', url: 'https://clawhub.ai/api/v1/search?q=pdf' },
  { file: 'clawhub-detail.json', url: 'https://clawhub.ai/api/v1/skills/pdf?owner=awspace' },
  { file: 'clawhub-version.json', url: 'https://clawhub.ai/api/v1/skills/self-improving-agent/versions/1.0.0?owner=pskoett' },
  { file: 'clawhub-file.txt', url: 'https://clawhub.ai/api/v1/skills/self-improving-agent/file?path=SKILL.md&owner=pskoett' },
  { file: 'skillhub-list.json', url: 'https://api.skillhub.cn/api/skills?page=1&pageSize=3' },
  { file: 'skillhub-search.json', url: 'https://api.skillhub.cn/api/skills?page=1&pageSize=3&keyword=pdf' },
  { file: 'skillhub-detail.json', url: 'https://api.skillhub.cn/api/v1/skills/anti-fraud' },
  { file: 'skillhub-files.json', url: 'https://api.skillhub.cn/api/v1/skills/anti-fraud/files' },
  // Verified by probe: the content endpoint takes `path` as a query parameter
  // and answers markdown. The path-segment spelling (`/files/SKILL.md`) is a 405,
  // so the two are not interchangeable.
  { file: 'skillhub-file.txt', url: 'https://api.skillhub.cn/api/v1/skills/anti-fraud/file?path=SKILL.md' },
]

await mkdir(OUT, { recursive: true })

let failed = 0
for (const target of TARGETS) {
  try {
    const response = await fetch(target.url, {
      headers: { 'user-agent': USER_AGENT, accept: 'application/json, text/plain, */*' },
      redirect: 'follow',
    })
    const body = await response.text()
    if (!response.ok) {
      process.stdout.write(`FAIL ${target.file} — HTTP ${response.status}\n${body.slice(0, 200)}\n`)
      failed += 1
      continue
    }
    // Pretty-print JSON so a fixture diff is reviewable; keep text verbatim
    // except for line endings. Upstream serves a mix of CRLF and LF, and a
    // fixture whose bytes depend on the capturing platform would make every
    // later diff unreadable — the parsers must handle both, which is asserted
    // separately rather than left to whatever the server sent today.
    let output = body.replace(/\r\n/g, '\n')
    if (target.file.endsWith('.json')) {
      try {
        output = `${JSON.stringify(JSON.parse(body), null, 2)}\n`
      } catch {
        // Not JSON despite the extension: store it as received, the test will show it.
      }
    }
    await writeFile(join(OUT, target.file), output, 'utf8')
    process.stdout.write(`ok   ${target.file} (${body.length} bytes)\n`)
  } catch (error) {
    process.stdout.write(`FAIL ${target.file} — ${error instanceof Error ? error.message : String(error)}\n`)
    failed += 1
  }
}

process.stdout.write(failed === 0 ? '\nall fixtures captured\n' : `\n${failed} fixture(s) failed\n`)
process.exitCode = failed === 0 ? 0 : 1
