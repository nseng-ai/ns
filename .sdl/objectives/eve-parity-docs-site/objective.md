# eve-parity docs site

## Thesis

Replace SDL's existing Astro/Starlight documentation site with a from-scratch
Next.js + Fumadocs site built on Vercel's `@vercel/geistdocs` package, closely
mimicking the `vercel/eve` documentation site (`apps/docs`). The goal is high
visual and structural fidelity to eve's docs — its geistdocs chrome, AI-native
machine routes, marketing home, and integrations gallery — adapted to SDL's
product surface (the `sdl` umbrella, its CLIs, and its public skills).

The current `docs-site/` (Astro + Starlight) is deleted and rebuilt; its curated
content corpus is preserved as migration input, not as a stack to extend.

## Scope

**Stack migration (rip-and-replace).**

- Delete the existing `docs-site/` Astro/Starlight app in full.
- Build a new `docs-site/` as a Next.js App-Router app on Fumadocs +
  `@vercel/geistdocs` (publicly on npm, currently `1.7.3`), structurally
  mirroring `vercel/eve` `apps/docs/`.
- Keep the directory name `docs-site/` (already SDL's convention and erk's; the
  modern monorepo alternative would be `apps/docs/`, but `docs-site/` is the
  chosen name).
- Keep it a **standalone package** with its own lockfile, outside the `ts/`
  pnpm workspace — matching how the current `docs-site/` and erk's `docs-site/`
  are wired. (Revisit only if standalone causes real friction; see Open
  Questions.)

**Content/docs split (unchanged, already correct).**

- Internal engineering docs stay in the repo-root `docs/` (ADRs, surveys,
  retrospectives, system reports). They are NOT published.
- Published site content lives inside `docs-site/` (Fumadocs MDX corpus). eve
  keeps content at root `docs/` and the app at `apps/docs/`; SDL cannot use that
  split because root `docs/` is occupied by internal docs, so content lives
  under `docs-site/` (exact sub-path TBD — see Open Questions).

**eve features to reproduce (in scope).**

- geistdocs reader: Navbar, sidebar nav (`meta.json` order with `---`
  separators), docs layout, footer, MDX components, Geist + Geist Mono fonts,
  Geist shiki code theme, mermaid, the `remarkNormalizeCodeLang` fence-label
  fix.
- **Search** via geistdocs `createSearchRoute` (Orama-backed).
- **AI-native / machine routes**: `/llms.txt` (full corpus), `/llms.mdx/<slug>`
  (per-page Markdown), `/agents.md` (agent instructions), `/sitemap.md`,
  `/og/<slug>`, `/rss.xml`, `robots`, `sitemap.ts`. Every page fetchable as
  raw `.md`/`.mdx`.
- The `agent{}` config block in `geistdocs.tsx`: product metadata
  (name/description/category/audience/useCases) + literal agent `instructions`
  authored for SDL (point agents at `/llms.mdx/...`, `/sitemap.md`, `/llms.txt`,
  and SDL CLI `--json`/Clinkr JSON envelopes for verification).
- **md-tracking telemetry: LEFT ON** (phones home to `geistdocs.com/md-tracking`
  keyed by `siteId`). Per explicit decision to maximize eve parity.
- **i18n scaffolding: KEPT** — eve's `app/[lang]` route structure and
  `translations = { en: { displayName: "English" } }`, English-only for now,
  with the `npx @vercel/geistdocs translate` script available but unused.
- **Marketing home page**: eve-style hero, file-tree, feature grid, installer +
  CTA, OG/Twitter metadata — adapted to SDL positioning. Skips eve's
  per-feature animated visuals (`components/visuals/*`).
- **Integrations / gallery page**: included as a structural mirror of eve's
  integrations gallery. What it catalogs for SDL is an Open Question (eve sources
  identity from a workspace `@vercel/eve-catalog`; SDL has no equivalent —
  candidate: SDL tools + public skills).

**Deployment & repo integration.**

- Vercel deployment, reusing the current `docs-site/vercel.json` wiring model;
  keep deploys gated (`ignoreCommand: "exit 0"`) until the site is launch-ready.
- Rewire `just docs-dev` / `docs-build` / `docs-check` recipes to the Next.js
  app (`next dev --turbo` / `next build` / type+lint check).
- Update `docs-site/README.md` and any AGENTS.md note describing the docs split.

## Non-Goals

- **No AI chat assistant.** Do not wire geistdocs `createChatRoute` or the chat
  widget. (This is the one eve feature intentionally dropped; it needs a model
  provider + key and adds runtime cost/complexity.)
- **No per-feature animated home visuals** (eve's `(home)/components/visuals/*`).
  A polished but static home is sufficient.
- **No second language / real translations.** i18n scaffolding only.
- **No changes to the internal `docs/` tree.** Its contents, organization, and
  purpose are out of scope; this Objective only consumes a snapshot of the
  existing curated site content as migration input.
- **No new shared content catalog package** (no SDL analogue of
  `@vercel/eve-catalog`) unless the integrations gallery decision demands it.
- Not adopting geistdocs for any purpose beyond the docs site (no coupling of
  `ts/` runtime packages to geistdocs/Vercel).

## Completion Criteria

- The Astro/Starlight `docs-site/` is gone; `docs-site/` is a Next.js +
  `@vercel/geistdocs` app.
- `pnpm --dir docs-site run build` (or the equivalent `just docs-build`)
  succeeds, and `just docs-check` is green.
- Local run renders, at minimum: the marketing home, a docs reader page with
  working sidebar + search, `/llms.txt`, `/agents.md`, and a per-page
  `/llms.mdx/<slug>`.
- The published content corpus covers at least the sections the current site
  covers (Get started, Concepts, Tools, Guides, Skills), restructured into the
  geistdocs frontmatter schema + `meta.json`, with no orphaned/dead sidebar
  entries.
- The `agent{}` instructions block and nav/identity reflect SDL (not eve
  placeholder text).
- Vercel build configuration is present and deploys remain gated until
  explicitly launched.

## Assumptions and Risks

**Assumptions**

- `@vercel/geistdocs` is usable by a non-Vercel-owned, standalone repo project
  (it is public on npm and eve consumes it as a normal dependency). If
  geistdocs hard-requires Vercel platform context that can't be satisfied
  locally/in CI, this assumption is wrong and the plan needs revision.
- The existing curated Starlight content (`docs-site/src/content/docs/**`) is
  good enough source material to port; rewriting prose is expected but the
  information architecture largely carries over.
- A standalone (non-workspace) Next.js app coexists fine alongside the `ts/`
  pnpm workspace, as the current standalone Astro app already does.
- Keeping md-tracking on (an external call to `geistdocs.com`) is acceptable
  despite SDL's "composability / no hidden coupling" principle, because it is an
  explicit, owner-approved parity decision.

**Risks**

- **geistdocs coupling / lock-in.** geistdocs is Vercel-specific and evolves on
  its own cadence; SDL's first design principle is "composability, no hidden
  coupling." Mitigation: confine all geistdocs usage to `docs-site/`; no `ts/`
  package depends on it. Not yet de-risked.
- **Stack addition.** Brings Next.js + React + Tailwind v4 into a repo that is
  otherwise CLIs + Vitest. Increases dependency surface and maintenance. Accepted
  cost of the rip-and-replace decision.
- **Integrations gallery has no obvious data source.** eve's is catalog-backed;
  SDL has nothing equivalent. Risk of building chrome with no content. Mitigation:
  resolve the Open Question before building the page; the page may shrink to a
  tools/skills index or be parked.
- **Loss of working site during migration.** Deleting the Astro app before the
  Next.js app reaches parity leaves SDL without a buildable docs site mid-stream.
  Mitigation: sequence so the new app reaches a buildable skeleton early; the old
  site is in git history if rollback is needed.
- **md-tracking telemetry** sends page-fetch events off-repo to a third party.
  Owner-approved, but record it as a known external dependency.

## Open Questions

- **Content directory location.** eve uses root `docs/` + `apps/docs` with
  `source.config.ts` pointing `dir: "../../docs"`. SDL can't use root `docs/`.
  Where does the MDX corpus live — `docs-site/content/`, `docs-site/docs/`, or
  co-located under `docs-site/app`? (Leaning: a top-level `docs-site/content/`
  or `docs-site/docs/` dir that `source.config.ts` points at.)
- **Integrations gallery content.** What does it catalog for SDL? Options:
  (a) SDL tools (slot, brmem, pr-address, aretro, objective, roaster, …),
  (b) public agent skills, (c) drop the page and treat as a Non-Goal. Resolve
  before building.
- **Workspace membership.** Keep `docs-site/` fully standalone (own lockfile),
  or fold it into a root pnpm workspace alongside `ts/`? Standalone matches
  today; a root workspace would dedupe tooling but is a larger structural change.
- **Site identity/positioning copy** — tagline, hero headline, `siteId`,
  production URL/domain. eve: "The Framework for Building Agents" / "Like Next.js
  for web apps, but for agents." SDL needs its own.
- **`md` vs `mdx`** default for content files, and which eve `source.config.ts`
  niceties to carry (mermaid, last-modified plugin behavior on Vercel shallow
  checkouts, the fence-label normalizer).

## Background & Decision Log

Origin: user asked to investigate `vercel/eve`'s doc site and mimic it for SDL.

Decisions captured during the framing conversation:

1. **Scope** — "Site + content, no AI chat." Reader + sidebar + search + home,
   no chat assistant. (md-tracking was initially also excluded, then explicitly
   re-enabled in decision 5.)
2. **Foundation** — use `@vercel/geistdocs` directly (not plain Fumadocs), for
   exact eve fidelity.
3. **Naming** — published site dir is `docs-site/` (SDL's existing convention;
   also erk's). Internal docs stay in root `docs/`.
4. **Build strategy** — delete the existing Astro/Starlight `docs-site/` and
   build fresh on geistdocs, rather than evolving the Astro site.
5. **Parity flips** — toward maximal eve fidelity: KEEP `[lang]` i18n
   scaffolding, INCLUDE an integrations gallery, LEAVE md-tracking telemetry ON.
   Home keeps eve structure but skips per-feature animated visuals.

## Reference: eve docs architecture (`vercel/eve` `apps/docs`)

Investigated at `~/code/githubs/vercel/eve` (origin `github.com/vercel/eve`).

- **Stack**: Next.js (App Router) + Fumadocs (`fumadocs-core` 16.9, `fumadocs-mdx`
  14, `fumadocs-ui`) wrapped by `@vercel/geistdocs`. Tailwind v4, Geist fonts,
  Vercel Analytics + Speed Insights + Blob (OG image).
- **Content/app split**: content at repo-root `docs/` (46 `.mdx` + 22 `.md` +
  10 `meta.json`); app at `apps/docs/`. `source.config.ts` points
  `dir: "../../docs"`. `README.md` files in content dirs are excluded from build.
  `meta.json` drives sidebar order using `"---"` separators; a `url:` frontmatter
  field can override a page's routing slug.
- **Thin-wrapper pattern**: route files are ~5–10 lines delegating to geistdocs
  factories:
  - `createChatRoute` → `app/api/chat` (AI chat) — SDL SKIPS this.
  - `createSearchRoute` → `app/api/search` (Orama search).
  - `createLlmsRoute` → `/llms.txt`; `createDocsMarkdownRoute` →
    `/llms.mdx/[[...slug]]`.
  - `createAgentsRoute` → `/agents.md`; `createSitemapMarkdownRoute` →
    `/sitemap.md`.
  - `Navbar`, `GeistdocsProvider`, `styles.css` imported from the package.
- **Identity** lives in `geistdocs.tsx`: `Logo`, `github`, `nav`, `suggestions`,
  the `agent{}` block (product metadata + literal agent `instructions`),
  `title`, `prompt`, `translations`, `siteId` ("agent-framework"). Wired into
  `lib/geistdocs/config.tsx` via `defineConfig` and `lib/geistdocs/source.ts`
  via `createSource`.
- **AI-native design**: the `agent{}` instructions tell agents to fetch
  `/llms.mdx/getting-started`, use `/sitemap.md` to locate pages, `/llms.txt`
  for the full corpus, and verify with CLI `--json`. `md-tracking.ts` POSTs to
  `geistdocs.com/md-tracking` on Markdown fetches.
- **Custom (non-package) code is small**: marketing home (`(home)/` — hero,
  `FileTree`, `FeatureGrid`, `CTA`, `Installer`, animated `visuals/*`),
  integrations gallery (backed by workspace `@vercel/eve-catalog`),
  `footer.tsx` / `installer.tsx` / `mdx-components.tsx` (~187 lines total),
  and `source.config.ts` niceties (mermaid, Geist shiki theme,
  `remarkNormalizeCodeLang` for `384:401:path.ts`-style fence labels,
  `last-modified` plugin disabled on Vercel shallow checkouts).
- **OG is currently static** in eve (`og.ts` returns a Blob URL; dynamic
  per-page OG is TODO'd out). SDL can mirror static OG initially.
- eve has redirects (`/docs` → `/docs/introduction`) and a `docs:check` CI step
  validating frontmatter + nav.
- eve content sections: `introduction`, `getting-started`, then feature pages
  (`agent-config`, `instructions`, `tools`, `skills`, `channels`, `connections`,
  `sandbox`, `subagents`, `schedules`, `evals`), then `guides`, `concepts`,
  `reference`, `tutorial`.
- eve has **no internal-docs directory**: all contributor/design knowledge lives
  in a single root `AGENTS.md`, `CONTRIBUTING.md`, `README.md`, and per-package
  `README.md`/`CHANGELOG.md`. (This is why SDL keeps internal `docs/` separate.)

## Reference: existing SDL docs-site (to be deleted)

At `docs-site/` today — Astro 6 + Starlight (`@astrojs/starlight` 0.39.2),
package `sdl-docs`, standalone (own `pnpm-lock.yaml`, outside `ts/`), Vercel-
wired with deploys disabled via `ignoreCommand: "exit 0"`.

Reusable migration inputs (preserve before deleting):

- Content corpus `docs-site/src/content/docs/**` — already curated, user-facing,
  and structurally close to eve:
  - `index.mdx`, `start/{quickstart,installation}.md`
  - `concepts/{umbrella,conventions,objectives}.md`
  - `tools/{slot,brmem,pr-address,aretro,objective,roaster}.md`
  - `guides/{parallel-branches,context-across-sessions,addressing-pr-feedback}.md`
  - `skills/{index,brmem,pr-address,branch-retro,objective}.md`
- `src/assets/logo.svg`, `public/favicon.svg`.
- Sidebar IA (in `astro.config.mjs`): Get started / Concepts / Tools / Guides /
  Skills — port this ordering into geistdocs `meta.json`.
- `starlight-llms-txt` config (projectName, description, `customSets` for
  Concepts/Tools/Skills) — informs the geistdocs llms config.
- Geist + Geist Mono fonts and GitHub code themes already in use.
- `vercel.json` deployment model and `just docs-*` recipe names.
