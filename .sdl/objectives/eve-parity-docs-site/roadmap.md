# Roadmap

## Work

- [x] Delete the existing Astro/Starlight `docs-site/` outright.
      Do not stage old content/assets as migration artifacts. Rely on git history and the Objective reference notes if prior `src/content/docs/**`, logo/favicon assets, sidebar IA, `vercel.json`, or `just docs-*` wiring need to be recovered while rebuilding.
- [x] Scaffold the geistdocs Next.js app skeleton at `docs-site/`.
      Standalone package (own lockfile, outside `ts/`) mirroring eve `apps/docs/`: `package.json` (next/fumadocs/`@vercel/geistdocs`), `next.config.ts` (`createMDX`), `source.config.ts`, `app/global.css` importing geistdocs styles, `app/[lang]/layout.tsx`, fonts. Evidence: `pnpm --dir docs-site run build` and `just docs-check` pass against the placeholder corpus.
- [~] Define site identity and information architecture.
  Baseline `geistdocs.tsx` (Logo, `github`, `nav`, `suggestions`, `siteId`, `title`, `prompt`, `translations={en}`), the SDL `agent{}` block, `lib/geistdocs/{config.tsx,source.ts}`, and top-level `meta.json` exist. Content directory is resolved to `docs-site/docs/`. The real docs sidebar IA now covers Get started, Concepts, Tools, Guides, and Skills with clean Fumadocs slugs; remaining work is launch-level positioning copy for the marketing home/site identity.
- [x] Port and restructure the content corpus into Fumadocs MDX.
      Rebuilt the user-facing sections the old Starlight site covered (Get started / Concepts / Tools / Guides / Skills) from git history into `.mdx` pages under `docs-site/docs/`. The corpus uses geistdocs frontmatter, per-folder `meta.json`, clean slugs, and no placeholder-only section indexes. Evidence: `pnpm --dir docs-site run build`, `just docs-check`, `just dprint-check`, stale-link greps, and build route artifact inspection passed for the migrated corpus.
- [x] Wire the AI-native + machine routes.
      Root and localized endpoints now serve `/llms.txt`, `/llms.mdx/[[...slug]]`, `/agents.md`, `/sitemap.md`, `/og/<slug>/image.png`, `/rss.xml`, `robots.txt`, `sitemap.xml`, and `.md`/`.mdx` per-page fetches from the current `docs-site/docs/` corpus. The Geistdocs proxy still owns docs Markdown negotiation and md-tracking remains wired through `siteId` + `md-tracking.ts`. Evidence: `pnpm --dir docs-site run build`, `just docs-check`, `just dprint-check`, and local smoke checks for root/localized machine routes plus `/docs/introduction.mdx` passed.
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
- Advanced/branded OG artwork beyond the simple generated SDL page cards.
- Real second language / translations (i18n scaffolding only for now).
- Advanced search tuning (custom Orama tokenizers, CJK, etc.).
- Folding `docs-site/` into a root pnpm workspace (only if standalone proves frictionful).
