# Skills Market Hub

**The Skills Market plugin for DeepSeek Harness**: browse skills on ClawHub and SkillHub in the desktop sidebar, read the description, look at the files, install to this machine once confirmed, and manage the installed skills in the same panel.

Current version **0.1.12** ([changelog](./CHANGELOG.md)). Measured running on DeepSeek Harness `0.2.0-rc.2`; see the [acceptance records](#acceptance-records).

**中文: [README.md](./README.md)**

This plugin is an independent community project. Skills are published by their respective authors, the copyright belongs to the original authors, and each skill's own declared license governs; the MIT license of this repository covers only the plugin's own code.

---

## What this plugin does

| Feature | Description |
| --- | --- |
| **Discover page (default)** | Five shelves: Featured, Trending, Official, New, Most installed; at most 10 entries each, one shelf per row, with the number that shelf's ranking is based on shown on the right; the bottom of each shelf jumps to the Market to keep looking |
| **Two-source browsing** | ClawHub and SkillHub are searched at the same time, and cross-source mirrors are folded automatically (the original entry is kept, the stale copy is not shown) |
| **Category tags** | Cards and the detail view show the registry's categories (SkillHub's sub-categories and top-level categories, ClawHub's `categories`), taking the Chinese or English name upstream published according to the interface language, falling back to the stable key when it cannot be resolved |
| **Two dimensions of popularity** | A card shows downloads and stars at once — the former is the people who took a copy, the latter the people who stayed |
| **Filtering and search** | The Market filters by source, security verdict and install state; the installed list filters by source; keyword search in both places normalizes full-width/half-width forms and markdown emphasis markers |
| **Preview before install** | The complete SKILL.md, a per-file listing with contents, the upstream security report, and the version changelog |
| **Install after confirming** | A dialog lists source, author, version and security verdict; confirm only becomes available once the acknowledgement is ticked |
| **Installed management** | Lists every skill on this machine (including ones placed there by hand), each row marked with the source registry and "From market/Local", previewable and uninstallable |
| **Persistent snapshot** | Upstream data is cached to disk (60 minutes by default); a `fetchedAt` hit is not re-stamped, and stale data is used as a fallback when upstream is unavailable |

### What the five Discover shelves are

The shelves are not an editorial pick, they are **a sort over the numbers the registries have already published**, and every shelf's rule is written in the interface hint:

| Shelf | Basis | Data source |
| --- | --- | --- |
| Featured | Near the top in the three orderings "downloads / installs / stars", **two of three needed to appear**, ordered first by how many it entered, then by best placement | This plugin's aggregation of the published numbers |
| Trending | ClawHub's published `trending` index; SkillHub has no sort parameter, so it is ordered by its **install count**; the two sides are shown **alternating** | ClawHub index + SkillHub list page |
| Official | Marked verified by the registry itself (`verified`) | `verified` in SkillHub's list |
| New | ClawHub's published `newest` index; SkillHub ordered by last update time; the two sides alternate | ClawHub index + SkillHub list page |
| Most installed | The install count the registry publishes | Both registries |

**The Official shelf is often short or even empty, and that is a fact rather than a defect.** Both registries hand out the verified mark extremely rarely: about one in a hundred on SkillHub's front page, while ClawHub declares `official`/`featured` only on the **search** endpoint; its list endpoint (the one this plugin browses with) does not return the field at all, and there is no endpoint that could enumerate official publishers (`/publishers`, `/official`, `sort=official` all 404 or 400, measured). So this shelf uses only signals that can be observed and does not pad itself with near-miss entries — when it is empty the interface explains why.

The values `sort` accepts were measured too: `downloads`/`installs`/`stars`/`trending`/`newest`/`updated` return 200, while the misspelled ones (`recent`, `featured`, `official`) return **400 rather than falling back to a default ordering** — so the mapping table is closed, not a template that concatenates strings.

---

## Installation

```bash
dsh plugin --profile desktop add <path-to-this-package-or-its-name> -w
```

Restart the DeepSeek Harness desktop app after installing, and a "Skills Market" entry appears in the sidebar.

This plugin only **inserts one line of its own** into the profile's plugin lines; it replaces no official component. To remove it, delete that line.

### After changing the code, the profile has to be installed once more

**This is the easiest pit to fall into**: when you install with `file:` pointing at a local directory, what the package manager puts into the profile is not a symlink but **a copy from the moment of installation**. Afterwards you change the source and rebuild, and the profile still holds the old version — and because the plugin "looks installed", this symptom is very hard to attribute: what you are reproducing is still the error that was already fixed.

From 0.1.2 on, the plugin **discovers this itself**. A line appears in the host log:

```
skills-market-hub: ready (v0.1.2, root=…, install=…, uninstall=on, cache=60m)
```

If the loaded build disagrees with the version in the `package.json` next to it, a warning follows immediately, stating both version numbers and the command to run.

Every time you finish changing code and run `pnpm build` again:

```bash
cd ~/.dsh/profiles/desktop
pnpm install --force --no-frozen-lockfile
```

Then restart the desktop app.

`--force` cannot be left out: the package manager caches dependencies by `file:` path, and without it, it will decide "the path has not changed, nothing to do", and the copy stays old.

> I tried rebuilding automatically with a `postinstall` hook and **gave it up**: pnpm 11+ blocks dependencies' install scripts by default, and that makes **the whole profile installation fail** (`ERR_PNPM_IGNORED_BUILDS`). Breaking the main installation path to save one manual step is not worth it. So the choice here is "detect it and say it clearly" rather than "fix it automatically".

To tell which copy is actually in the profile, compare hashes directly (PowerShell; both sides should print the same value):

```powershell
Get-FileHash "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\dsh-skills-market-hub\package.json" -Algorithm SHA256
Get-FileHash "D:\projects\dsh\dsh-skills-market-hub\package.json" -Algorithm SHA256
```

The package version can also be read out directly (on Windows `require()` trips over backslash paths, so this reads the file and parses it):

```powershell
node -e "console.log(JSON.parse(require('fs').readFileSync(process.env.USERPROFILE+'/.dsh/profiles/desktop/node_modules/dsh-skills-market-hub/package.json','utf8')).version)"
```

While changing code, do not switch to installing from `git+ssh://…`: that route goes through the `lib/` committed in the repository, so every change has to be committed and pushed before it can be pulled again, which is actually slower during joint debugging. Switch to it once the plugin is stable, or when deploying to another machine.

### Building from source

```bash
pnpm install
pnpm build      # tsc×2 + esbuild, produces lib/
pnpm check      # typecheck + build + contract checks + all tests + package closure
```

---

## Configuration

Written in the profile's plugin line `config`; every field has a default, so `{}` also starts.

| Field | Default | Description |
| --- | --- | --- |
| `skillsRoot` | `null` | Which directory to install into. `null` = `$DSH_HOME/skills` |
| `clawhubBaseUrl` | `https://clawhub.ai` | ClawHub address |
| `skillhubBaseUrl` | `https://api.skillhub.cn` | SkillHub address |
| `timeoutMs` | `15000` | Timeout of a single upstream request |
| `requestRetries` | `1` | Extra attempts after the first failure (retries only on 429 and 5xx) |
| `allowUninstall` | `true` | Whether uninstalling is allowed. When off, the uninstall endpoints are always 405 |
| `pageSize` | `24` | Default list page size (1–100) |
| `cacheTtlMinutes` | `60` | Upstream snapshot lifetime (1–1440) |

---

## HTTP API

One prefixed route, `/api/skills-market-hub`, everything returns JSON with `Cache-Control: no-store`; a failure is always `{ error: { code, message } }`.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/ping` `/version` `/stats` `/status` | Liveness, version, cache counts, per-source health |
| GET | `/discover` | The Discover page: the five shelves (`{ id, metric, items }`) and per-source health. Parameter `refresh` |
| GET | `/categories` | The category vocabulary the registry publishes (key, Chinese name, English name, ordering) |
| GET | `/skills` | List. Parameters `q, source, security, installed, cursor, limit, refresh` |
| GET | `/skills/:source/:slug` | Detail. Parameters `owner` (required when a ClawHub slug is shared across authors), `refresh` |
| GET | `/skills/:source/:slug/file` | One file's contents. Parameters `path` (required), `owner` |
| POST | `/install` | body `{ id: "source:slug", owner? }` |
| POST | `/uninstall` | body `{ id }` |
| GET | `/installed` | The list of skills on this machine |
| GET | `/installed/detail` | Documents and file listing of one installed skill. Parameter `key` |
| GET | `/installed/file` | One file of an installed skill. Parameters `key`, `path` |
| POST | `/installed/uninstall` | body `{ key }` |

`key` is the SHA-256 of the skill's absolute path: the browser side never holds the real path, and the host side re-scans the disk on every request to resolve it from this key, so a caller cannot construct an arbitrary file read.

---

## Design constraints

These are not style preferences, they are **imposed by the shape of the distribution**, and they are worth reading before changing code:

**Zero runtime dependencies.** The host loads the plugin in an "installed but not built" shape, and any dependency that has not been hoisted into the profile makes the plugin fail to load. So YAML frontmatter is handled by a bundled subset parser (it supports block scalars, flow collections and quote escapes), and no rendering library is pulled in for Markdown.

**The client artifact depends on React only.** Every `require()` that appears in `lib/client.cjs` must be a platform seed module. The shared UI primitives package (`dsh-client-ui-primitives`) is **deliberately not used**: its entry statically imports katex, shiki, mermaid language packs, `simple-icons` and thirty-odd stylesheets at the top level, so taking one button from it would bundle all of that into this plugin. The panel therefore draws its own controls with `--dsw-*` theme tokens, and the cost of that is zero.

**The client artifact is `.cjs`.** The host half is ESM (as with other DSH plugins), while the artifact handed to the browser module loader is a CommonJS closure factory. The difference is expressed with the extension rather than by putting a `package.json` in `lib/` — that would declare the host half as CommonJS too and make `import` fail outright. The build script asserts that no such file exists under `lib/`.

**The trust gate is resolved on every request.** The raw web route does not inherit the Connection service's Host/Origin fence, and the Connection line can activate later than this plugin; a snapshot would make the market readable and installable from any web page before the fence is in place.

**Install does not trust the cache.** Detail and file listings are forced to `force: true, allowStale: false` before anything is written to disk; every file for which upstream gives a checksum is compared on the spot, a mismatch aborts, and the whole staging directory is discarded.

**Everything that hits the disk goes through an atomic publish.** Files are first written into a work directory **beside the skills root** (`.skills-market-hub-work`), and after all checks pass they are published with a single `rename`. Uninstall first `rename`s into that same work directory and then deletes. Being a sibling is the point: same volume, so `rename` stays atomic (across volumes it degrades into copy + delete). On Windows this step gets blocked by brief handles held by antivirus/indexers/sync tools (`EPERM`, a misleading error name — it is not a permissions problem), so it is a **bounded retry with backoff** rather than giving up on the first try; a failed cleanup is not swallowed either, but logged and retried by a sweep on the next activation.

> **Only skills go in the scanned directory — this is not a tidiness issue, it is a whether-it-starts issue.** When DSH discovers skills it walks **every directory entry** under the skills root and parses `<entry>/SKILL.md`, and it **tolerates only `ENOENT`/`ENOTDIR`**; any other error code bubbles up as a `fatal load failure` and the desktop app will not start at all. 0.1.5 and earlier put the staging directory inside the skills root, on the reasoning that "a dot prefix is ignored" — **that reasoning was wrong**: a dot prefix fools a scan that filters by name, it does not fool a scan that resolves by path. A single `EPERM` directory left behind by one failed cleanup is enough to keep the whole harness from starting and to make **all** user skills disappear from the `/` menu. From 0.1.6 the work directory moved to a sibling; leftovers from older versions are cleaned up first at startup.

**Uninstall has to prove ownership.** A `.skills-market-hub.json` written by this plugin must exist in the directory, and the `id` in it must match the skill the caller is pointing at. Ownership looks only at the identity field, so a corrupt ledger does not affect the ownership decision — but a skill placed there by hand is never deleted.

---

## Development

```
src/
├── index.ts               plugin entry: name / inject / Config / apply
├── config.ts              schemastery config schema
├── web-routes.ts          prefixed route, trust gate, error envelope, parameter validators
├── routes.ts              endpoint dispatch table (15 paths / 10 dispatch entries)
├── market/
│   ├── types.ts           cross-boundary data model (the only source of client import type)
│   ├── yaml.ts            zero-dependency YAML subset parser
│   ├── frontmatter.ts     SKILL.md head/body split
│   ├── provider-fetch.ts  timeout, retry, streaming size cap, per-source health
│   ├── clawhub-provider.ts / skillhub-provider.ts
│   ├── taxonomy.ts        category vocabulary: fetch, cache, key → zh/en labels
│   ├── cache.ts / disk-cache.ts
│   ├── dedupe.ts          cross-source mirror folding
│   ├── cursor.ts          opaque pagination cursor
│   ├── discover.ts        the five Discover shelves (pure functions: given upstream pages, return sorted shelves)
│   └── market-service.ts  filtering, paging, install-state marking, Discover orchestration
├── skills/
│   ├── root.ts            where it installs / what counts as installed
│   ├── installed.ts       listing scan and sidecar validation
│   └── install-service.ts stage → validate → atomic publish → uninstall
└── client/
    ├── index.tsx          slots + locale registration
    ├── api.ts             host HTTP client
    ├── state.ts           controller and state machine
    ├── locale-store.ts    subscribes to the host locale snapshot, so category tags can pick a language
    ├── ui.tsx             tokenized controls and status blocks
    ├── translate.tsx      panel-level i18n context
    ├── locales.ts         zh (baseline) / en
    ├── icons.tsx
    ├── page/MarketPage.tsx
    └── components/        DiscoverPanel / SkillCard / MarketList / MarketDetail / InstalledPanel / Dialogs
```

### Tests

```bash
pnpm check                            # typecheck + build + contract checks + 375 tests + package closure
node --test tests/*.test.mjs          # all offline tests
SMH_LIVE=1 node --test tests/live-providers.test.mjs   # real upstream integration (needs network)
node scripts/capture-fixtures.mjs     # re-capture the upstream response fixtures
node scripts/pack-check.mjs           # whether the packed artifact still loads after being installed into an empty directory
```

The upstream response fixtures (`tests/fixtures/market/`) are captured from the real registries, and the provider normalization tests all run against them. Fixture contents change with upstream (download counts, front-page placement), so **assertions are derived from the fixtures, not written as frozen literals** — after a re-capture everything should still be green, unless upstream really changed a field name.

This rule is not just talk: when re-capturing in 0.1.3, two assertions went red immediately — one had ClawHub's download count written as `50487`, the other asserted that the SkillHub list's `tags` "is always null", while in the freshly captured page it is an array with values. Both were assertions **reading the weather instead of reading the code**.

A few other tests deliberately avoid the network but still do not let routing mistakes through: `market-service.test.mjs` points skillhub's base URL at a local HTTP server and asserts the **exact path** of the category-vocabulary request and the parse result. The origin was a real defect — guessing the wrong path (`/api/categories`) returned an empty 405 response, indistinguishable from "upstream publishes no categories", with the unit tests all green and the live test failing.

The real-upstream integration test is **skipped by default**, because it needs the network, is slower than the rest, and an upstream failure should not be read as a regression of this plugin. Run it once before a release: a fixture is a photograph, it proves normalization matched the shape captured at one moment, not that the registry still answers that way today.

---

## Known limitations

- The panel does not render Markdown: `description` is shown as the preformatted text the author wrote. The shared Markdown renderer would drag the whole UI primitives package into the bundle (see above), and shipping a Markdown subset parser and then claiming it is a faithful reproduction would be worse than showing the raw text. The "Files" tab gives the complete source including frontmatter.
- **The Discover page has no curated catalog shipped with the package; all five shelves are sorts over the numbers the registries have already published.** "Featured" is a consensus aggregation of three rankings (two of three to appear), not an editorial pick; the interface hint says so, because it decides whether the reader should trust that shelf.
- **The signal behind the "Official" shelf comes from the registry, not from this plugin's judgement, and both registries hand it out extremely rarely.** SkillHub's list endpoint has a `verified` field (about one in a hundred on its front page), while ClawHub's `official`/`featured` appear only in **search** results, are not returned by the list endpoint at all, and no endpoint can enumerate official publishers. This shelf is therefore often short or even empty — the interface explains why, and does not pad it with near-miss entries.
- **The bottleneck on the Discover first screen is ClawHub's server-side latency, not the amount of data** (measured: 39KB and 30KB take almost the same time: 1.2s vs 1.29s), so shrinking `limit` would not save time and was not done. `trending` and `newest` already run in parallel anyway, and cutting one would not change wall-clock time (wall clock = the slowest one). The vocabulary (1.5KB) used to be serialized ahead of the three lists; it now pre-warms when the plugin activates, so the first screen no longer pays for that trip.
- **The Discover page's three upstream pages go through the disk cache** (the same TTL as detail and files). The sidebar mounts only one panel at a time, so switching away and back re-reads once — measured 1.3s hot, 4.1s cold, while a cache hit is just one file read. **Sorting and install-state marking are deliberately kept outside the cache**: install state is a fact about this machine's disk, and caching the finished shelves would show a reader a shelf still offering "Install" for a skill he just installed. Clicking "Refresh" sends `refresh=1` to force a trip upstream. A failure of any one page only costs the entries that page itself brought; `sources` is returned along with the shelves, and the interface uses it to explain why one shelf is short.
- No curated catalog ships with the package: the list is the live result. The first screen therefore depends on upstream availability (both Discover and Market offer Retry rather than a blank page).
- ClawHub slugs are shared across authors. A detail request without `owner` returns 409 and the candidate author list this plugin throws when upstream is ambiguous; the panel carries the author along from the card or the detail page, and so avoids installing another author's bytes.
- **Only ClawHub resolves `owner` as a pin.** SkillHub's detail route already determines the account, and the `owner` parameter is not interpreted upstream, so no author-consistency check is done — doing it would reject every skill that is otherwise installable (a real defect in 0.1.0, see [CHANGELOG](./CHANGELOG.md)). The difference between the two providers is declared explicitly by `pinsOwner` rather than guessed.
- **SkillHub's offset pagination overlaps by one item at page boundaries.** Requesting the raw endpoint directly is the same, so it is upstream behaviour that the cursor layer cannot eliminate; the panel de-duplicates by id, so the reader never sees a duplicated card.
- **Categories come from the registry, not from this plugin's judgement.** The two registries each have their own taxonomy (SkillHub's 13 top-level categories + the sub-categories a publisher selects, ClawHub has its own `categories`), and **no mapping between them is done** — identical spelling is a coincidence, and treating `knowledge` as the same concept would be a fabricated correspondence. Category names exist only in the two languages upstream publishes; when the interface language is a third one, it falls back to the Chinese or English name, and then to the key.
- **ClawHub's list endpoint does not return categories.** Only search and detail carry `native.skill.categories`. So ClawHub's browse cards have no category chip, unless that entry happens to be a mirror of a search hit (in which case the SkillHub side fills it in — see `dedupe.ts`: only empty fields are filled, a value the original source already declared is never overwritten).
- **There is a batch of skills that install fine and can never be used, because the harness cannot read their SKILL.md.** DSH reads frontmatter with a real YAML parser and requires `name` to match `^[a-z0-9]+(?:-[a-z0-9]+)*$`; if it does not, **the whole skill is discarded** and only a log line remains. And such data does exist in the registries. **Sampling 30 real skills (15 from each source), 6 are discarded**:
  - `name` is not in lowercase-hyphen form: `Self-Improving + Proactive Agent`, `SkillScan`, `Git Assistant`, `LexAll·律师工具｜法律计算器`
  - no `---` frontmatter at all (the file starts straight with `# Title`): `agent-memory`, `taobaoke-tool`
  These skills used to be **installed silently** and then never appear in the `/` menu (a real defect before 0.1.10). Now the install is **refused beforehand with the reason stated**. The validation logic and the harness's own judgement were **compared item by item on a batch of real skills and agreed exactly** (30/30, zero disagreements).
- **So a refused "Install" is not necessarily a bug in this plugin**; look at the error message first: it will point out whether the `name` form is wrong, frontmatter is missing, or `description` contains an unquoted `": "`. All three are data problems on the registry side, and worth reporting upstream.

---

## Acceptance records

Verification results on the real desktop app. Recorded separately from the automated tests: tests prove a code path can run, what is recorded here is **what a person saw in the interface**.

### 0.1.0 — First load

**Environment**: DeepSeek Harness desktop `0.2.0-rc.2`, Windows, Node 24.21.0, `file:` install inside the profile.

**Observed**:

- A "Skills Market" entry appears in the sidebar, and clicking it mounts the panel normally (no white screen, no console errors)
- The home screen renders a two-source card grid of ClawHub and SkillHub, and the search box and the three filter dropdowns work
- Cards show source, version and downloads; a SkillHub card's security verdict shows as "Unknown" — **this is correct**, that registry only returns a security report on the detail endpoint
- Clicking "Install" opens a confirmation dialog listing source, author, version and security verdict, with the confirm button disabled until the acknowledgement is ticked
- **Defect**: after confirming, the install fails, reporting "the registry resolved a different author for this skill". Every SkillHub skill does this. Fixed in 0.1.1 (see [CHANGELOG](./CHANGELOG.md))

**Not verified** (not executed at the time): file preview, the security and changelog tabs, the installed list, uninstall.

### 0.1.1 — Re-check after the fix

**Environment**: as above, reinstalled into the profile with `pnpm install --force` and then restarted.

**Observed**:

- The SkillHub skill installs successfully, the write to disk completes
- The "Installed" tab lists that skill, tagged "From market"
- Uninstall succeeds, the directory is removed

**Not verified** (no observation recorded yet): the light theme, non-Windows platforms, the file preview and security tabs, how the empty and error states appear in the real interface. These paths are covered by automated tests, but no one has looked at them in the real interface.

### 0.1.2 — UI feedback

**Environment**: as above, the desktop app loading 0.1.1.

**Observed** (two problems the user fed back with screenshots):

- Every card's tag slot is empty — the category tags were "not implemented yet"
- Both dropdowns on the right of the filter bar show only "All", so you cannot tell what each one filters

The cause of the first one is not missing data but data that was never read: SkillHub's `tags` is `null` on the list endpoint, and the real categories are on `category` / `subCategories`. Fixed in 0.1.3 (see [CHANGELOG](./CHANGELOG.md)).

### 0.1.3 — Install failure

**Environment**: as above, the desktop app loading 0.1.3.

**Observed** (fed back by the user with a screenshot): installing `ppt-generator-skill` fails, and the toast at the bottom says only "publishing the skill failed", with no usable information at all.

**What the investigation found**: `~/.dsh/skills` was left with a `.skills-market-hub-install-w4aJou`, and it **could not be deleted** — `rd`, `rm`, `chmod`, `rename` all returned `EPERM`, while `dir` could list it. This is a directory stuck on a kernel handle.

Three defects, all fixed in 0.1.4:

- When the `rename` publish failed, Windows's `EPERM` (a handle held briefly) fell into the fallback branch and was reported as a generic disk error
- That failure had no retry at all — while the same call succeeds tens of milliseconds later
- The cleanup after a failed publish, `rm(...).catch(() => undefined)`, **swallowed its own failure**, so the stuck staging directory stayed behind and nobody knew

**Reproduction check**: installing `ppt-generator-skill` into the real skills root succeeds, is visible to the scan, and uninstalls cleanly. In other words this is an **intermittent** failure rather than a stable one — which fits the "handle race" diagnosis exactly, and also means that succeeding once does not prove it is fixed.

**Not verified**: how the interface behaves after the fix (needs a restart and another install attempt); whether that stuck directory can be deleted after restarting the desktop app.

> **⚠️ The sentence below is wrong, and 0.1.6 corrected it.** At the time I judged "it is harmless", on the grounds that a dot prefix is ignored by the scan — a judgement based on a **wrong model**: DSH walks every **directory** entry under the skills root and parses `<entry>/SKILL.md`, tolerating only `ENOENT`/`ENOTDIR`. That stuck directory was exactly why the whole harness failed to start. See the [0.1.5 entry](#015--installed-skills-do-not-appear-in-the--menu).

### 0.1.4 — Requirement change

**Requirement**: cards show stars; the installed list filters by source, with a source tag on every row.

**Implementation notes**: stars (`stars`) are published by both registries and the plugin had always normalized them, it had just never rendered them — so this is a display problem, not a data problem. On real data the two dimensions differ a lot: `self-improving-agent` has 484,749 downloads / 3,998 stars, while `skillscan` has 182,477 downloads / 41 stars.

**A deliberate choice**: the vast majority of skills on SkillHub have **0** stars, and that is the registry's own number, so it shows `0` rather than `—`. Drawing "nobody actually starred it" and "this registry does not provide it" as the same symbol is worse than showing the number.

**Not verified**: all of the above needs a look at the interface after a restart (0.1.5).

### 0.1.5 — Installed skills do not appear in the `/` menu

**Symptom**: the user installed `frontend-design`, and typing `/` did not show it; after a restart it still did not show, and the `/` menu had **only the built-in `office-*`**, not one user skill.

**First diagnosis (wrong)**: the skill name and the directory name disagree — the `superdesign/` directory says `name: frontend-design`, so it should be `/frontend-design`. That observation is itself correct (two of the three skills are like this: `ppt-generator-skill` → `/ppt-generator`), **but it was not the cause this time**.

**Second diagnosis (right)**: the desktop app's dialog crashed, and the log gives the exact mechanism:

```
dsh: fatal load failure: [Error: EPERM: operation not permitted,
  realpath 'C:\Users\admin\.dsh\skills\.skills-market-hub-install-w4aJou']
```

The staging directory left behind by that failed install in 0.1.3 **had been in the skills root the whole time**, and could not be deleted. When DSH resolved it, it got `EPERM` and failed fatally — so `/frontend-design` was not "not installed properly", it was that **the entire skill-discovery flow was broken by one leftover directory**.

**Fixed in 0.1.6**: the work directory moved beside the skills root, and only skills live in the scanned directory. After the fix, the measured discovery flow is back to normal:

```
discovery OK -> 3 skills
   /anything-to-notebooklm   /ppt-generator   /frontend-design
```

**A secondary failure I caused myself during the investigation (this has to be recorded)**: to test whether the skills root was writable, I created `.probe-writable` in it. That **reproduced the same bug** — after the delete failed it became a second bad entry and crashed DSH again (the `realpath '...\.probe-writable'` in the crash log was it). **Doing a write test inside a directory already known to be "fatal on a failed directory resolution" is itself manufacturing the same class of failure.** Experiments like this should only be done in `os.tmpdir()`.

### 0.1.7 / 0.1.8 / 0.1.9 — Discover page

**Requirement**: add a "Discover" page to the panel, placed ahead of "Market" and "Installed"; the categories include Featured, Trending, Official, New (or other suggestions, at most 5 categories); at most 10 skills per category; no search; one entry point that jumps to the Market interface. 0.1.8 added: loading is slow.

**Environment**: DeepSeek Harness desktop `0.2.0-rc.2`, Windows, plugin `0.1.12`.

**Observed** (five screenshots, checked against the requirements one by one):

| Shelf | The hint text in the interface | Number on the right | Observation |
| --- | --- | --- | --- |
| Featured | Two of three rankings, or it does not appear | Downloads | 9 rows visible, source and category tags render normally |
| Trending | Each registry's own hot list, alternating | Installs | entries from the two registries really do alternate |
| Official | Marked verified by the registry itself | Downloads | **only 1 entry**, with "Find more in the market →" at the bottom |
| New | Newest from each registry, alternating | Updated | shows a `2026/10/15` date |
| Most installed | By the install count the registry publishes | Installs | both sources mixed, in descending order of installs |

The remaining confirmed items:

- When the panel opens, the first screen is "Discover", the tab order is "Discover / Market / Installed", and "Discover" is selected
- All five shelves switch normally, at most 10 rows per shelf
- **The number on the right of every shelf matches that shelf's sort basis** — "New" shows a date, "Most installed" shows installs. This was the design point of 0.1.7: putting the same number (downloads) on every shelf makes people misread the sort basis
- The source tags (`clawhub` / `skillhub`) and the category tags sit side by side at real widths without being squeezed together
- **The "Official" shelf measured exactly 1 entry** — the requirement anticipated "may be empty", in reality it is "very short but not empty". It still holds its slot: it is the only shelf that answers "which ones has the registry itself endorsed"

**Still not verified** (these five screenshots do not cover it, do not treat it as passed):

- Row hover and click feedback; whether going into a detail and coming back still leaves you on the same shelf
- Whether "Find more in the market" really jumps to "Market" with an empty search box
- Whether the number on the right gets squashed in a narrow window
- That opening the panel **no longer requests `/skills`** (only `/discover`) — this needs checking in devtools' Network tab
- Contrast in the dark theme: row separators use `--dsw-alias-border-l1`, and the column headers are 10.5px small text
- **All of 0.1.8's loading-state observation items**: the first-screen skeleton, the speed on a cache hit (switching away and back should be noticeably faster), the shelves not disappearing before reappearing when "Refresh" is clicked
- **All of 0.1.9's install-dialog observation items**: clicking "Install" on the Discover page makes the dialog appear; the dialog contents match that row; when the same skill appears in two shelves, both switch to "Installed"

### Automated coverage compared

The part `pnpm check` runs and the manual observations above are complementary, not a substitute for each other. As of 0.1.12:

| Layer | Count | Description |
| --- | --- | --- |
| Offline tests | 375 | Includes normalization against real upstream response fixtures (categories, tags, security verdict, popularity), the install/uninstall lifecycle (a real temporary directory), **the invariant that the scanned directory holds skills only**, retries and branching of a failed publish, the installed-filter logic, controller races and pagination guards, real component rendering, the category-tag fallback chain, stale-build detection, **the sort rules of the five Discover shelves and degradation when "one registry is down"**, **cache hits and forced refresh on the Discover page**, **the write ordering of vocabulary reads**, **panel-level install-target resolution (three sources + two empty states)**, **the pre-install harness readability check**, **the same policy published in all three places, list/detail/uninstall**, **the installed mark cleared in three views at once after an uninstall** |
| Real upstream integration | 8 | Needs the network, skipped by default; includes one real install and uninstall, and reading the category vocabulary through to the card tags |
| Package closure | 15 | Whether the artifact can still load on its own after being installed into an empty directory |
| Contract checks | 14 | Manifest, patch layer, client purity, theme tokens, version consistency, peer set |

The category item illustrates the division of labour between the two kinds of coverage particularly well: **the offline tests all green while the live test failed**. The unit test filled the vocabulary by hand and never went over the network, so a wrong request path passed all the same; the live test hit the real registry and immediately found that `/api/categories` returns an empty 405. After fixing it, an offline test was added (pointing the base URL at a local HTTP server and asserting the request path) so that this class of error can be caught without the network next time — manual observation finds the problem, the live test locates the cause, the offline test cements the line of defence; none of the three steps can be dropped.

The failed-publish item is the counter-example: **a passing test does not mean the thing was tested**. Those failures are races, which cannot be produced on demand, and the first version of the test tried to patch the global `node:fs/promises` and was refused on the spot by the read-only module namespace. Only after switching to an explicit seam (`InstallOptions.fs`) did it actually get covered — a place you cannot get a test into usually means the code is missing a clear boundary, not that it does not need testing.

The installed-filter item is the other side of the same point: `renderToStaticMarkup` does not run event handlers, so static rendering **cannot** toggle a dropdown, and the filter logic cannot be tested that way. Once it was extracted into the pure function `filterInstalled` it could be driven directly — this was not a refactor done for the tests' sake; that logic was the only place with a judgement in it in that whole view.

**The skills-root invariant is the one that most needed to exist in the whole test suite.** What it asserts is not "how well the cleanup is done" but "whether the scanned directory holds non-skill entries" — and the latter decides whether the harness can start. This invariant **had been violated the whole time, only no test was watching it**: every test was verifying that **an install succeeds**, nobody had asked **whether what an install leaves behind gets in anything else's way**. Now the first test is that one: the moment the staging directory comes back into the skills root, it fails immediately.
