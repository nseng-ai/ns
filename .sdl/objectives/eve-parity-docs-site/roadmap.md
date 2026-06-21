# Roadmap

## Work

- [x] Delete the existing Astro/Starlight `docs-site/` outright.
      Do not stage old content/assets as migration artifacts. Rely on git history and the Objective reference notes if prior `src/content/docs/**`, logo/favicon assets, sidebar IA, `vercel.json`, or `just docs-*` wiring need to be recovered while rebuilding.
- [x] Scaffold the geistdocs Next.js app skeleton at `docs-site/`.
      Standalone package (own lockfile, outside `ts/`) mirroring eve `apps/docs/`: `package.json` (next/fumadocs/`@vercel/geistdocs`), `next.config.ts` (`createMDX`), `source.config.ts`, `app/global.css` importing geistdocs styles, `app/[lang]/layout.tsx`, fonts. Evidence: `pnpm --dir docs-site run build` and `just docs-check` pass against the placeholder corpus.
- [x] Wire the AI-native + machine routes.
      Root and localized endpoints now serve `/llms.txt`, `/llms.mdx/[[...slug]]`, `/agents.md`, `/sitemap.md`, `/og/<slug>/image.png`, `/rss.xml`, `robots.txt`, `sitemap.xml`, and `.md`/`.mdx` per-page fetches from the current `docs-site/docs/` corpus. The Geistdocs proxy still owns docs Markdown negotiation and md-tracking remains wired through `siteId` + `md-tracking.ts`. Follow-up review fixes verified that Geistdocs does not expose replacement URL/proxy helpers, simplified site-origin handling to the platform `URL` API, and made localized machine-route bypasses use the Geistdocs language list. Evidence: `pnpm --dir docs-site run build`, `just docs-check`, `just dprint-check`, local smoke checks for root/localized machine routes plus `/docs/introduction.mdx`, and later `pnpm --dir docs-site run check` passed.
- [x] Wire search; explicitly omit AI chat.
      Root `/api/search` is wired with geistdocs `createSearchRoute` against the existing docs source. AI chat remains intentionally omitted: `ai.enabled: false` is set, no `createChatRoute` usage exists, and no chat route was added. Evidence: `just docs-check` passed and search/chat grep checks found only the search route plus the explicit disable flag.
- [~] Define site identity and information architecture.
  Baseline `geistdocs.tsx` (Logo, `github`, `nav`, `suggestions`, `siteId`, `title`, `prompt`, `translations={en}`), the sdl `agent{}` block, `lib/geistdocs/{config.tsx,source.ts}`, and top-level `meta.json` exist. Content directory is resolved to `docs-site/docs/`. The real docs sidebar IA now covers Get started, Concepts, Tools, Guides, and Skills with clean Fumadocs slugs. Lowercase `sdl` branding is normalized across the docs site UI, metadata, OG/RSS output, and placeholder corpus. Non-content infrastructure and gallery work should happen before launch-copy rewrites; remaining identity work is launch-level positioning copy for the marketing home/site identity.
- [~] Build the marketing home page structure.
  A buildable static home page exists and now uses the lowercase `sdl` brand, but its marketing copy is intentionally Lorem Ipsum. Prioritize structure and infrastructure before content polish: missing eve-style file-tree, installer, CTA, and OG/Twitter polish may proceed while final sdl positioning/tagline copy remains deferred. No per-feature animated visuals.
- [ ] Build the extensions gallery page.
      Replace the former generic integrations/gallery direction with an extensions gallery. Build the route, data/config shape, listing/detail presentation, and nav integration around extensions rather than tools, public skills, or generic integrations. Prefer a docs-site-local source of truth unless implementation proves a shared catalog is necessary. Keep placeholder/minimal entry copy acceptable until the content rewrite phase.
- [ ] Integrate with the repo and Vercel deploy.
      Harden `just docs-dev/docs-build/docs-check` for the standalone Next.js app; keep workspace membership standalone unless real friction appears; update `vercel.json` while keeping deploys gated via `ignoreCommand` until launch; refresh `docs-site/README.md` and add any scoped docs-site AGENTS note for the docs split; fix generated/cache ignore behavior such as `.next/` if needed.
      Evidence: `pnpm --dir docs-site run build` + `just docs-check` green; local run serves home, a docs page with sidebar+search, `/llms.txt`, `/agents.md`, and a `/llms.mdx/<slug>`.
- [~] Port and restructure the content corpus into Fumadocs MDX.
  The Fumadocs IA, `.mdx` file set, frontmatter shape, per-folder `meta.json`, and clean slugs are in place for Get started, Concepts, Tools, Guides, and Skills. The prior generated prose has intentionally been replaced with obvious TODO/Lorum ipsum placeholders. This content rewrite is deliberately deferred while the Objective focuses on remaining non-content infrastructure, home structure, and extensions-gallery work.

## Parked

- AI chat assistant (`createChatRoute` + chat widget) — deliberately deferred; needs a model provider + key.
- Advanced/branded OG artwork beyond the simple generated SDL page cards.
- Real second language / translations (i18n scaffolding only for now).
- Advanced search tuning (custom Orama tokenizers, CJK, etc.).
- Folding `docs-site/` into a root pnpm workspace (only if standalone proves frictionful).
