# Roadmap

## Work

- [x] Delete the existing Astro/Starlight `docs-site/` outright.
      Do not stage old content/assets as migration artifacts. Rely on git history and the Objective reference notes if prior `src/content/docs/**`, logo/favicon assets, sidebar IA, `vercel.json`, or `just docs-*` wiring need to be recovered while rebuilding.
- [x] Scaffold the geistdocs Next.js app skeleton at `docs-site/`.
      Standalone package (own lockfile, outside `ts/`) mirroring eve `apps/docs/`: `package.json` (next/fumadocs/`@vercel/geistdocs`), `next.config.ts` (`createMDX`), `source.config.ts`, `app/global.css` importing geistdocs styles, `app/[lang]/layout.tsx`, fonts. Evidence: `pnpm --dir docs-site run build` and `just docs-check` pass against the placeholder corpus.
- [x] Wire the AI-native + machine routes.
      Root and localized endpoints serve `/llms.txt`, `/llms.mdx/[[...slug]]`, `/agents.md`, `/sitemap.md`, `/og/<slug>/image.png`, `/rss.xml`, `robots.txt`, `sitemap.xml`, and `.md`/`.mdx` per-page fetches from the current `docs-site/docs/` corpus. The Geistdocs proxy (`docs-site/proxy.ts`) owns docs Markdown negotiation and md-tracking remains wired through `siteId` + `lib/geistdocs/md-tracking.ts`. Follow-up review fixes verified that Geistdocs does not expose replacement URL/proxy helpers, simplified site-origin handling to the platform `URL` API, and made localized machine-route bypasses use the Geistdocs language list. Evidence: `pnpm --dir docs-site run build`, `just docs-check`, `just dprint-check`, local smoke checks for root/localized machine routes plus `/docs/introduction.mdx`, and later `pnpm --dir docs-site run check` passed.
- [x] Wire search; explicitly omit AI chat.
      Root `/api/search` is wired with geistdocs `createSearchRoute` against the existing docs source. AI chat remains intentionally omitted: `ai.enabled: false` is set in `lib/geistdocs/config.tsx`, no `createChatRoute` usage exists, and no chat route was added. Evidence: `just docs-check` passed and search/chat grep checks found only the search route plus the explicit disable flag (re-verified 2026-07-03).
- [~] Define site identity and information architecture.
  The identity baseline exists, factored into `docs-site/lib/geistdocs/` modules rather than eve's single `geistdocs.tsx`: `site-identity.ts` (`title`, `translations={en}`, `siteId: "sdl-docs"`, `siteUrl`), `ai-assistant.ts` (the sdl `agent{}` block, `prompt`, `suggestions`), `brand.tsx` (`Logo`), `nav.ts` (`github`, `nav`), wired through `config.tsx` (`defineConfig`) and `source.ts`. Content directory is resolved to `docs-site/docs/` with top-level and per-folder `meta.json`. The real docs sidebar IA covers Get started, Concepts, Tools, Guides, and Skills with clean Fumadocs slugs. Lowercase `sdl` branding is normalized across the docs site UI, metadata, OG/RSS output, and placeholder corpus. Remaining identity work is launch-level positioning copy: tagline, hero headline, and the production URL/domain (`NEXT_PUBLIC_SITE_URL`).
- [x] Build the marketing home page structure.
      The static home page has the non-content eve-style structure this Objective wanted: hero, feature cards, file-tree preview, installer/code-command preview, CTA band, and page metadata/OG/Twitter basics. A later refactor extracted shared marketing UI primitives into `docs-site/components/marketing-ui.tsx` (`MarketingHero`, `Card`, `CtaLink`, `PreviewPanel`) without changing the structure. Final sdl positioning/tagline copy remains deliberately deferred and the page still avoids per-feature animated visuals. Evidence: `pnpm --dir docs-site run build`, `just docs-check`, and `just dprint-check` passed.
- [x] Build the extensions gallery page.
      The docs site has a static `/extensions` route at `app/[lang]/extensions/page.tsx`, a docs-site-local catalog module at `docs-site/lib/extensions-catalog.ts`, featured/all-extension card sections, workflow categories, command/source hints, and nav/home/footer discovery. The gallery catalogs extensions rather than generic integrations and keeps copy intentionally minimal until the content rewrite phase. Evidence: `just docs-check` passed; chat-omission grep still finds only `ai.enabled: false`, with no chat route or `createChatRoute` usage.
- [x] Integrate with the repo and Vercel deploy.
      Root `just docs-dev/docs-build/docs-check` remain the local command surface for the standalone Next.js app, with `docs-check` delegating to the package `check` script (`next build`). Root-mode and `docs-site`-root Vercel configs are Next-native, remove Astro `dist` output assumptions, and keep deploys gated via `ignoreCommand: "exit 0"` until launch. `docs-site/README.md` and scoped `docs-site/AGENTS.md` document the standalone package boundary, published/internal docs split, validation baseline, dual Vercel modes, launch gate, and `NEXT_PUBLIC_SITE_URL` guidance.
      Evidence: `pnpm --dir docs-site run build`, `just docs-check`, and `just dprint-check` passed; `just docs-check` re-verified green on trunk 2026-07-03 after the post-slice config/helper refactors and the `.sdl`→`.ns` cutover.
- [~] Port and restructure the content corpus into Fumadocs MDX.
  The Fumadocs IA, `.mdx` file set, frontmatter shape, per-folder `meta.json`, and clean slugs are in place for Get started, Concepts, Tools, Guides, and Skills. The page prose is intentionally stubbed with obvious TODO/Lorum ipsum placeholders (still present as of 2026-07-03). With the non-content infrastructure, home structure, extensions gallery, and Vercel integration rows now complete, this content rewrite — together with launch identity copy — is the main remaining Objective work.

## Parked

- AI chat assistant (`createChatRoute` + chat widget) — deliberately deferred; needs a model provider + key.
- Advanced/branded OG artwork beyond the simple generated SDL page cards.
- Real second language / translations (i18n scaffolding only for now).
- Advanced search tuning (custom Orama tokenizers, CJK, etc.).
- Folding `docs-site/` into a root pnpm workspace (only if standalone proves frictionful).
