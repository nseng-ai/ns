# Rebaseline: ji→ns rename landed and @nseng-ai/ns published — launch is no longer rename-gated

Provenance: objective-refresh basis target=c1cb8d5d3 from=trunk-HEAD

## Summary

A trunk-HEAD refresh verified the record against ground truth and corrected two
launch-sequencing claims that had been true when written and have since been
overtaken by events, plus one small scope detail:

- **The CLI rename landed.** The record's Thesis said "the CLI is `ji` today and
  becomes `ns` soon; launch stays gated behind the actual CLI rename." The
  `rename-ji-to-ns` Objective is closed (`closed.md` present; its `## Closure`
  records the hard cutover: `ns` invocation surface, `.ns/` state root,
  `@nseng-ai/ns` publish target). Probe: `ts/packages/hosts/ns/package.json` is
  `@nseng-ai/ns` `0.1.2` with `bin.ns`. The "Future-name docs" risk is resolved;
  launch gating now rests entirely on the launch-bar decision and the Claude Code
  stranger verification owned by `ship-objectives-to-customers` (its rows 32/38
  remain open).
- **`@nseng-ai/ns` is published.** The record claimed "npm install truthfully
  gated until `@nseng-ai/ns` publishes." Probe: `npm view @nseng-ai/ns version`
  returns `0.1.2`; `ship-objectives-to-customers` records a registry-backed
  checkout-free smoke at `0.1.1` and `checkout-free-sdl-distribution` closed
  2026-07-06. Consequence flipped: `installation.mdx`'s "not yet published to
  npm" callout is now the stale side. Its removal stays owned by
  `ship-objectives-to-customers` (gate holds until a real global/`npx` install is
  verified; a bare-core unbundle/republish row is still open there).
- **`translate` script removed.** The Scope i18n bullet said the
  `npx @vercel/geistdocs translate` script was "available but unused"; commit
  `f636e910b` removed it from `docs-site/package.json`. The `[lang]` scaffolding
  and English-only `translations` remain (verified in
  `lib/geistdocs/site-identity.ts`). Also: `docs/ns-naming-brief.md` now exists,
  resolving the Non-Goals note that a ji-naming-brief successor was needed.

Re-verified unchanged at HEAD (`c1cb8d5d3`): standalone Next.js `16.2.6` +
`@vercel/geistdocs` `1.7.3` (TypeScript `6.0.3`); machine routes under
`app/[lang]/` plus root `robots.ts`/`sitemap.ts` and `proxy.ts`; `/api/search`
via `createSearchRoute`; chat omitted (`enabled: false`, no `createChatRoute`);
md-tracking to `https://geistdocs.com/md-tracking`; both `vercel.json` files
gated (`ignoreCommand: "exit 0"`); `just docs-dev/docs-build/docs-check`
recipes; identity modules (`productName`/`siteId` = `ns`, `nseng.ai`, `nonslop
engineering`, nav `nseng-ai/ns`); `/extensions` gallery +
`lib/extensions-catalog.ts` + `components/marketing-ui.tsx`; extension pages
`retro`/`reviews`/`pr-address` with no `aretro`/`roaster` strings; north-star
rewritten (software-factory enemy, nonslop thesis). Happy-path pages
(`installation`, `quickstart`, `concepts/objectives`, `tools/objective`) remain
lorem-free and have tracked product changes since the last refresh (the
`ns objective archive` removal in `98ea5dec8` and the cmux/subagents
extensions-catalog renames). Still open, verified not stale: 16 of 20 corpus
pages carry lorem/TODO stubs, and top-level `docs/meta.json` still lists
`tools`/`skills` — the kernel+extensions IA restructure is unstarted.
`just docs-check` build-green remains the dated historical claim (2026-07-03);
not re-run in this refresh.

## Objective Impact

- Thesis and the "Future-name docs" risk rebaselined: the site's future-name bet
  resolved in its favor; launch is no longer rename-gated.
- Assumptions and the content-corpus roadmap row corrected: the npm-publish gate
  fired — the stale artifact is now the installation page's callout, owned by
  `ship-objectives-to-customers`.
- Launch-bar Open Question narrowed: the north-star-rewrite sub-question is
  resolved (rewrite landed with the chrome rebrand); hide/rewrite/mark-immature
  and must-stay-private remain undecided.
- Completion state unchanged: IA restructure `[ ]` and content corpus `[~]`
  remain the open rows; no closure.

## Follow-Ups

- Restructure the docs IA (dissolve `tools`/`skills` into kernel Concepts pages
  and extension pages) — decide the minimal launch slice first.
- Rewrite the remaining 16 TODO/Lorum ipsum pages with accurate ns-first copy.
- Coordinate with `ship-objectives-to-customers` on dropping the installation
  "not yet published" callout once the global/`npx` install path is verified
  against the bare-core republish.
