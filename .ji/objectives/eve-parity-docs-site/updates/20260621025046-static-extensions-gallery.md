# Static Extensions Gallery

## Summary

The docs site now includes a static extensions gallery route at `docs-site/app/[lang]/extensions/page.tsx` and a docs-site-local catalog source at `docs-site/lib/extensions-catalog.ts`.

The page uses a Vercel/geistdocs-style presentation: minimal hero, quiet borders, featured cards, grouped all-extension sections, command hints, source-path hints, and sparse badges. Navigation now points to `Extensions` instead of the nonexistent generic integrations route, and the home page plus footer link to the gallery.

Validation passed with `just docs-check`. A chat-surface grep still found no `createChatRoute` usage or chat route; only the intentional `ai.enabled: false` setting and existing docs-page table-of-content flags matched.

## Objective Impact

The extensions-gallery roadmap slice is complete. The previous data-source risk is narrowed: the implementation starts with a local catalog module and does not introduce a shared package or registry dependency.

The broader Objective remains open for launch-ready docs prose, additional marketing-home polish, Vercel/repo launch wiring, and any later decision to deepen extension copy or move catalog data after real reuse pressure appears.

## Follow-Ups

- Keep the catalog copy minimal until the broader published-docs prose rewrite happens.
- Finish launch-level marketing home/site identity copy and any remaining eve-style static home polish.
- Complete docs-site repo/Vercel integration and README/AGENTS refresh with deploys still gated until launch.
