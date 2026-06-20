# Roadmap

## Work

- [ ] Capture reusable assets from the existing Astro/Starlight `docs-site/`, then delete the Astro app.
  Preserve `src/content/docs/**`, `src/assets/logo.svg`, `public/favicon.svg`, the sidebar IA from `astro.config.mjs`, and the `vercel.json`/`just docs-*` wiring model as migration inputs. Then remove the Astro/Starlight implementation in full.
- [ ] Scaffold the geistdocs Next.js app skeleton at `docs-site/`.
  Standalone package (own lockfile, outside `ts/`) mirroring eve `apps/docs/`: `package.json` (next/fumadocs/`@vercel/geistdocs`), `next.config.ts` (`createMDX`), `source.config.ts`, `app/global.css` importing geistdocs styles, `app/[lang]/layout.tsx`, fonts. Reach a buildable skeleton early to avoid a long no-site window.
- [ ] Define site identity and information architecture.
  Author `geistdocs.tsx` (Logo, `github`, `nav`, `suggestions`, `siteId`, `title`, `prompt`, `translations={en}`) and the `agent{}` block written for SDL; wire `lib/geistdocs/{config.tsx,source.ts}`; resolve the content directory location (Open Question) and write the top-level `meta.json` sidebar order from the existing Starlight IA.
- [ ] Port and restructure the content corpus into Fumadocs MDX.
  Migrate the curated Starlight content (Get started / Concepts / Tools / Guides / Skills) into the geistdocs frontmatter schema + per-folder `meta.json`; decide `md` vs `mdx`; carry the `source.config.ts` niceties (mermaid, fence-label normalizer, shiki Geist theme). Rewrite prose where it referenced Astro/Starlight specifics.
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
