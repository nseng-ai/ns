# Rebaseline: happy-path content landed and extension renames (aretro→retro, roaster→reviews)

Provenance: objective-refresh basis target=9fa6a502d from=trunk-HEAD

## Summary

A trunk-HEAD refresh verified the record against ground truth and found genuine
drift introduced after the record was last written (last objective-dir commit
`d40015b7f`). Five commits touched `docs-site/` since then; two carry durable
meaning for this Objective:

- **Real happy-path content landed** (`ef63f2c91`, "Add real Objective onboarding
  docs"): the placeholder prose in `docs-site/docs/get-started/installation.mdx`,
  `get-started/quickstart.mdx`, `concepts/objectives.mdx`, and `tools/objective.mdx`
  was replaced with real customer-facing, ns-first content aligned to the shipped
  `ns` surface, with the npm install path truthfully gated until `@nseng-ai/ns`
  publishes. Probe: those four files contain no `lorem`/`lorum`; the other 16
  corpus pages still do.
- **Extension renames** (`9cd176c1d` aretro→retro; `64e7a1ce7` roaster→reviews):
  the extension doc pages are now `docs-site/docs/tools/retro.mdx` and
  `.../reviews.mdx`; no `aretro`/`roaster` strings remain under `docs-site/`
  (build dirs excluded).

Re-verified unchanged and matching the record at HEAD: standalone Next.js
`16.2.6` + `@vercel/geistdocs` `1.7.3` (TypeScript `6.0.3`), no Astro/Starlight;
all machine routes present (`llms.txt`, `llms.mdx/[[...slug]]`, `agents.md`,
`sitemap.md`, `og/[...slug]`, `rss.xml`, `robots.ts`, `sitemap.ts`) plus
`proxy.ts`; `/api/search` via `createSearchRoute`; chat omitted
(`ai.enabled: false`, no `createChatRoute`); md-tracking wired to
`https://geistdocs.com/md-tracking`; both `vercel.json` files gated
(`ignoreCommand: "exit 0"`); identity factored into `lib/geistdocs/*`
(`productName`/`siteId` = `ns`, `siteDomain` = `nseng.ai`, `organizationName` =
`nonslop engineering`); `/extensions` gallery backed by `lib/extensions-catalog.ts`;
marketing home via `components/marketing-ui.tsx`.

Still open (verified, not stale): the top-level `docs/meta.json` still lists
`tools` and `skills` sections and the corpus retains `docs/tools/` and
`docs/skills/` folders — the Tools/Skills → kernel+extensions IA restructure has
not happened. `just docs-check` build-green is carried as the dated historical
claim (2026-07-03); it was not re-run in this refresh.

## Objective Impact

- Scope, Completion Criteria, and Decision Log corrected: extension pages are
  `retro`, `reviews`, `pr-address` (renamed from `aretro`/`roaster`).
- Assumptions, Risks, and the "Content prose readiness" Open Question updated:
  the happy-path slice is no longer placeholder — it carries real ns-first prose;
  only the remaining pages are still TODO/Lorum ipsum stubs.
- Roadmap content-corpus row (`[~]`) updated to record the four real happy-path
  pages while remaining pages stay stubbed; row stays `[~]` (partial).
- Roadmap IA-restructure row (`[ ]`) refreshed to shipped names and annotated
  that the top-level `docs/meta.json` still carries `tools`/`skills` — restructure
  unstarted.

## Follow-Ups

- Restructure the docs IA: dissolve `docs/tools/` and `docs/skills/` into kernel
  feature pages under Concepts and extension pages tied to `/extensions`; update
  `meta.json` trees and check for dead sidebar entries.
- Rewrite the remaining TODO/Lorum ipsum pages with accurate ns-first copy.
- Re-run the local render smoke and `just docs-check`; remove the Vercel gate only
  in an explicit launch slice sequenced behind the CLI rename.
