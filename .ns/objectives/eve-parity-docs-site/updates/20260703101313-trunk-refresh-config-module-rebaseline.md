# Trunk Refresh: Config Module Rebaseline

Provenance: objective-refresh basis target=5668ac5630b2bab397ef85b9e4cfe4d5cd84c420 from=trunk-HEAD

## Summary

A trunk rebaseline verified the record against current ground truth and corrected structural drift introduced by post-slice refactors.

Verified at trunk HEAD: `docs-site/` is a standalone Next.js + `@vercel/geistdocs` 1.7.3 app (TypeScript pinned 6.0.3); `just docs-check` (package `check` = `next build`) passes fresh on 2026-07-03; all machine routes, `/api/search` via `createSearchRoute`, `ai.enabled: false` with no `createChatRoute`, md-tracking to `geistdocs.com/md-tracking` with `siteId: "sdl-docs"`, both launch-gated Vercel configs (`ignoreCommand: "exit 0"`), the `just docs-*` recipes, `docs-site/README.md`/`AGENTS.md`, the `/extensions` gallery with `lib/extensions-catalog.ts`, and the marketing home structure all exist as recorded. The published corpus (Get started / Concepts / Tools / Guides / Skills, `.mdx` + `meta.json`) is still intentionally TODO/Lorum ipsum placeholder prose.

Corrected: SDL's Geistdocs identity no longer lives in a single `geistdocs.tsx` file. Commits after the last update (notably "Refactor docs-site hero, Geistdocs config, and page metadata handling" and "Introduce shared marketing UI primitives and harden extension catalog metadata") factored it into `docs-site/lib/geistdocs/` modules (`config.tsx`, `source.ts`, `site-identity.ts`, `ai-assistant.ts`, `brand.tsx`, `nav.ts`, `fonts.ts`, `machine-routes.ts`, `md-tracking.ts`, `og-image.tsx`, `rss.ts`, `url.ts`) and extracted shared marketing primitives into `components/marketing-ui.tsx`. The roadmap identity row and decision log now record this file shape; behavioral eve-parity targets are unchanged.

## Objective Impact

The record's stale "remaining parity" wording (search, home, integrations, launch wiring still pending) is rebaselined: those slices are complete and re-verified. Remaining Objective work is concentrated in two `[~]` rows — the published-corpus prose rewrite (placeholders confirmed still present) and launch-level identity/positioning copy (tagline, hero headline, production `NEXT_PUBLIC_SITE_URL`; `siteId` carries working value `sdl-docs`). The unvalidated remainder of the geistdocs-usability assumption is narrowed to an actual ungated Vercel deploy.

## Follow-Ups

- Rewrite the TODO/Lorum ipsum published docs pages with accurate sdl copy.
- Decide launch identity copy: tagline, hero headline, production URL/domain.
- Run the local render smoke (home, docs reader + search, `/llms.txt`, `/agents.md`, `/llms.mdx/<slug>`) before any closure decision, and remove the Vercel gate only in an explicit launch slice.
