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
- [x] Define the ns site identity and apply the chrome rebrand.
      Identity is resolved: the product is `ns` (== nonslop), lowercase always, domain `nseng.ai`, `siteId: "ns"`, org "nonslop engineering", positioning = ns kernel + extension ecosystem with the software factory as the enemy; copy derives from the north star, not a tagline workshop. The copy source `docs/north-star.md` was rewritten as the deeper repositioning (software-factory enemy, nonslop thesis, kernel+extensions architecture). The chrome rebrand landed (commit "Rebrand docs site for ns and align north-star copy to nonslop engineering"): `lib/geistdocs/site-identity.ts` (`productName: "ns"`, `siteId: "ns"`, `siteDomain: "nseng.ai"`, `organizationName: "nonslop engineering"`), `nav.ts` (`owner: "nseng-ai"`, repo `ns`), the `agent{}` block in `ai-assistant.ts` (name/instructions derived from `productName`/`organizationName`), and the marketing home hero copy (`ns — the kernel for nonslop engineering`, description derived from the north star). The identity baseline is factored into `docs-site/lib/geistdocs/` modules rather than eve's single `geistdocs.tsx`: `site-identity.ts`, `ai-assistant.ts`, `brand.tsx`, `nav.ts`, wired through `config.tsx` (`defineConfig`) and `source.ts`. Content directory is resolved to `docs-site/docs/`. Remaining identity-adjacent work is the docs-corpus rebrand and the Tools/Skills → kernel+extensions IA restructure, tracked in the next two rows.
- [ ] Restructure the docs IA for kernel + extensions.
      Dissolve the Tools and Skills top-level sections: slot/objectives/branch memory become kernel feature pages under Concepts (brmem drops to an internals mention), `aretro`/`roaster`/`pr-address` become extension pages tied to the `/extensions` gallery (with real catalog entries), and skills are documented as part of their extensions. Update `meta.json` trees and check for dead sidebar entries and stale internal links.
  - Launch-slice note (2026-07-05): decide first whether the happy-path launch (see the launch row below) needs this full restructure or only a minimal Get-Started slice, with the rest following post-launch. The Pi-style extension model decided in `ship-objectives-to-customers` (bare core + `ns install`) reinforces the kernel+extensions IA direction.
- [x] Build the marketing home page structure.
      The static home page has the non-content eve-style structure this Objective wanted: hero, feature cards, file-tree preview, installer/code-command preview, CTA band, and page metadata/OG/Twitter basics. A later refactor extracted shared marketing UI primitives into `docs-site/components/marketing-ui.tsx` (`MarketingHero`, `Card`, `CtaLink`, `PreviewPanel`) without changing the structure. Final sdl positioning/tagline copy remains deliberately deferred and the page still avoids per-feature animated visuals. Evidence: `pnpm --dir docs-site run build`, `just docs-check`, and `just dprint-check` passed.
- [x] Build the extensions gallery page.
      The docs site has a static `/extensions` route at `app/[lang]/extensions/page.tsx`, a docs-site-local catalog module at `docs-site/lib/extensions-catalog.ts`, featured/all-extension card sections, workflow categories, command/source hints, and nav/home/footer discovery. The gallery catalogs extensions rather than generic integrations and keeps copy intentionally minimal until the content rewrite phase. Evidence: `just docs-check` passed; chat-omission grep still finds only `ai.enabled: false`, with no chat route or `createChatRoute` usage.
- [x] Integrate with the repo and Vercel deploy.
      Root `just docs-dev/docs-build/docs-check` remain the local command surface for the standalone Next.js app, with `docs-check` delegating to the package `check` script (`next build`). Root-mode and `docs-site`-root Vercel configs are Next-native, remove Astro `dist` output assumptions, and keep deploys gated via `ignoreCommand: "exit 0"` until launch. `docs-site/README.md` and scoped `docs-site/AGENTS.md` document the standalone package boundary, published/internal docs split, validation baseline, dual Vercel modes, launch gate, and `NEXT_PUBLIC_SITE_URL` guidance.
      Evidence: `pnpm --dir docs-site run build`, `just docs-check`, and `just dprint-check` passed; `just docs-check` re-verified green on trunk 2026-07-03 after the post-slice config/helper refactors and the `.sdl`→`.ns` cutover.
- [~] Port and restructure the content corpus into Fumadocs MDX.
  The Fumadocs `.mdx` file set, frontmatter shape, per-folder `meta.json`, and clean slugs are in place; the page prose is intentionally stubbed with obvious TODO/Lorum ipsum placeholders (still present as of 2026-07-05). With the non-content infrastructure, home structure, extensions gallery, and Vercel integration rows now complete, the rewrite is unblocked and written **ns-first**: all prose and command examples use `ns` (the future name; the binary is `ji` today), grounded in the rewritten `docs/north-star.md`. Do it on top of the kernel/extensions IA restructure row, not the old Get started/Concepts/Tools/Guides/Skills shape.

- [ ] Decide the launch bar for non-happy-path content (see the 2026-07-05 Open
      Question): hide vs rewrite vs mark-immature for the rest of the corpus, any
      must-stay-private pages, and whether launch waits on the north-star rewrite.
- [ ] Remove the Vercel launch gate and go live on nseng.ai.
      Drop `ignoreCommand: "exit 0"` from the Vercel config(s), confirm production
      project/domain wiring (`NEXT_PUBLIC_SITE_URL`), deploy, and smoke the live site —
      happy-path pages, search, and the machine routes (`/llms.txt`, per-page `.mdx`).
  - Notes: gated on `ship-objectives-to-customers`' Claude-Code stranger verification
    passing and the launch-bar decision above; the happy-path content itself is owned
    there.

## Parked

- AI chat assistant (`createChatRoute` + chat widget) — deliberately deferred; needs a model provider + key.
- Advanced/branded OG artwork beyond the simple generated SDL page cards.
- Real second language / translations (i18n scaffolding only for now).
- Advanced search tuning (custom Orama tokenizers, CJK, etc.).
- Folding `docs-site/` into a root pnpm workspace (only if standalone proves frictionful).
