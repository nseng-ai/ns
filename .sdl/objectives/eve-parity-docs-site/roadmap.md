# Roadmap

## Work

- [x] Delete the existing Astro/Starlight `docs-site/` outright.
      Do not stage old content/assets as migration artifacts. Rely on git history and the Objective reference notes if prior `src/content/docs/**`, logo/favicon assets, sidebar IA, `vercel.json`, or `just docs-*` wiring need to be recovered while rebuilding.
- [x] Scaffold the geistdocs Next.js app skeleton at `docs-site/`.
      Standalone package (own lockfile, outside `ts/`) mirroring eve `apps/docs/`: `package.json` (next/fumadocs/`@vercel/geistdocs`), `next.config.ts` (`createMDX`), `source.config.ts`, `app/global.css` importing geistdocs styles, `app/[lang]/layout.tsx`, fonts. Evidence: `pnpm --dir docs-site run build` and `just docs-check` pass against the placeholder corpus.
- [~] Define site identity and information architecture.
  Baseline `geistdocs.tsx` (Logo, `github`, `nav`, `suggestions`, `siteId`, `title`, `prompt`, `translations={en}`), the SDL `agent{}` block, `lib/geistdocs/{config.tsx,source.ts}`, and top-level `meta.json` exist. Content directory is resolved to `docs-site/docs/`. Remaining work: sharpen final site identity/copy and complete the real sidebar IA while porting content.
- [ ] Port and restructure the content corpus into Fumadocs MDX.
      Rebuild the user-facing sections the old Starlight site covered (Get started / Concepts / Tools / Guides / Skills), using git history and the Objective notes as reference rather than a staged copy. Convert into the geistdocs frontmatter schema + per-folder `meta.json`; decide `md` vs `mdx`; carry the `source.config.ts` niceties (mermaid, fence-label normalizer, shiki Geist theme). Rewrite prose where it referenced Astro/Starlight specifics.
      Evidence: docs reader renders every sidebar entry with no orphans; `just docs-build` succeeds.
- [ ] Wire the AI-native + machine routes.
      `/llms.txt`, `/llms.mdx/[[...slug]]`, `/agents.md`, `/sitemap.md`, `/og/<slug>` (static OG initially), `/rss.xml`, `robots`, `sitemap.ts`, and the `.md`/`.mdx` per-page fetch. Keep md-tracking telemetry ON (`siteId` + `md-tracking.ts`).
- [ ] Wire search; explicitly omit AI chat.
      geistdocs `createSearchRoute` (Orama). Do NOT add `createChatRoute` or the chat widget (Non-Goal).
- [ ] Build the marketing home page.
      eve-style hero, file-tree, feature grid, installer + CTA, OG/Twitter metadata — SDL positioning/tagline. No per-feature animated visuals.
- [ ] Build the integrations / gallery page (pending content decision).
      Resolve what it catalogs for SDL (tools, public skills, or drop — see Open Questions), then build the gallery + detail presentation. May move to Parked if the content decision is "drop."
- [ ] Integrate with the repo and Vercel deploy.
      Rewire `just docs-dev/docs-build/docs-check` to the Next.js app; settle workspace membership (standalone vs root workspace); update `vercel.json` (keep deploys gated via `ignoreCommand` until launch); refresh `docs-site/README.md` and the AGENTS.md docs-split note; fix `.gitignore` (`.next/`, etc.).
      Evidence: `pnpm --dir docs-site run build` + `just docs-check` green; local run serves home, a docs page with sidebar+search, `/llms.txt`, `/agents.md`, and a `/llms.mdx/<slug>`.

## Parked

- AI chat assistant (`createChatRoute` + chat widget) — deliberately deferred; needs a model provider + key.
- Dynamic per-page OG image generation (eve itself parks this behind a static OG image).
- Real second language / translations (i18n scaffolding only for now).
- Advanced search tuning (custom Orama tokenizers, CJK, etc.).
- Folding `docs-site/` into a root pnpm workspace (only if standalone proves frictionful).
