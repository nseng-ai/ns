# Rebaseline: ns chrome rebrand and north-star rewrite landed

Provenance: objective-refresh basis target=8fdc6f50661d8df81024bbcce3c722fb7411441d from=trunk-HEAD

## Summary

A trunk-style rebaseline verified the record against HEAD (`141ac24d`; the branch
adds only a skills-policy commit over trunk). The docs-site infrastructure matches
the record, and the identity work the roadmap still framed as "remaining" has in
fact landed.

Verified at HEAD:

- `docs-site/` is a standalone Next.js `16.2.6` + `@vercel/geistdocs` `1.7.3` app
  (TypeScript pinned `6.0.3`); no Astro/Starlight files remain.
- Machine routes all present (`llms.txt`, `llms.mdx/[[...slug]]`, `agents.md`,
  `sitemap.md`, `og/[...slug]`, `rss.xml`, `robots.ts`, `sitemap.ts`), plus
  `docs-site/proxy.ts`; `/api/search` via `createSearchRoute`; chat omitted
  (`ai.enabled: false`, no `createChatRoute`); md-tracking wired to
  `https://geistdocs.com/md-tracking`; both `vercel.json` files gated
  (`ignoreCommand: "exit 0"`); `just docs-dev/docs-build/docs-check` recipes; the
  `/extensions` gallery with `lib/extensions-catalog.ts`; the marketing home
  structure with `components/marketing-ui.tsx`.
- Identity config factored into `docs-site/lib/geistdocs/` modules (not eve's
  single `geistdocs.tsx`).

Correction (stale → rebaselined): the roadmap identity row listed "rewrite
`docs/north-star.md`" and "apply the ns chrome rebrand" as remaining work. Both
landed in the commit "Rebrand docs site for ns and align north-star copy to
nonslop engineering" (same commit that last rewrote this record):
`docs/north-star.md` is rewritten around the software-factory enemy and the
nonslop thesis; `site-identity.ts` now sets `productName: "ns"`, `siteId: "ns"`
(previously `"ns-docs"`), `siteDomain: "nseng.ai"`, `organizationName: "nonslop
engineering"`; `nav.ts` uses `owner: "nseng-ai"`, repo `ns`; the `agent{}` block
in `ai-assistant.ts` derives name/instructions from `productName`/
`organizationName`; and the home hero copy reads `ns — the kernel for nonslop
engineering` with a north-star-derived description.

Still open (verified, not stale): the published corpus is intentionally
TODO/Lorum ipsum placeholder prose, and the top-level `docs/meta.json` still lists
`tools` and `skills` sections — the Tools/Skills → kernel+extensions IA
restructure has not happened.

## Objective Impact

- Roadmap identity row flipped `[~]` → `[x]`: identity is resolved and the chrome
  rebrand (north-star rewrite, `site-identity`/`nav`/`ai-assistant`/home-hero) has
  landed. Remaining identity-adjacent work is the docs-corpus rebrand and the IA
  restructure, which live in their own rows.
- Completion criterion "the `agent{}` instructions block and nav/identity reflect
  ns" is now met and probe-backed.
- Not complete: the corpus IA still carries Tools/Skills top-level sections and
  placeholder prose, so the "restructured IA, no orphaned entries" criterion is
  unmet. Two rows remain — IA restructure `[ ]` and content-corpus rewrite `[~]`.
- Build-green (`just docs-check`) is carried as a dated historical claim
  (2026-07-03); it was not re-run in this refresh.

## Follow-Ups

- Restructure the docs IA: dissolve `docs/tools/` and `docs/skills/` into kernel
  feature pages under Concepts and extension pages tied to `/extensions`; update
  `meta.json` trees and check for dead sidebar entries.
- Rewrite the TODO/Lorum ipsum published pages with accurate ns-first copy derived
  from the rewritten `docs/north-star.md`.
- Run the local render smoke and remove the Vercel gate only in an explicit launch
  slice sequenced behind the CLI rename.
