# Published Docs Corpus Ported

## Summary

The former published Starlight corpus has been ported into the standalone Next.js/Fumadocs/geistdocs app under `docs-site/docs/`.

The migrated corpus now covers Get started, Concepts, Tools, Guides, and Skills with `.mdx` pages, clean Fumadocs slugs, per-folder `meta.json` ordering, and no placeholder-only section indexes. Small corpus-tied `geistdocs.tsx` metadata updates corrected the GitHub owner to `dagster-io` and refreshed suggestions for the migrated docs.

Validation passed with `pnpm --dir docs-site run build`, `just docs-check`, `just dprint-check`, stale-link/stale-frontmatter greps, and build artifact route inspection for all intended docs pages.

## Objective Impact

The content-corpus roadmap slice is complete. The real sidebar IA now covers the old published sections in the new app, and the `md` vs. `mdx` question is resolved for this migrated corpus: all published docs pages in this slice use `.mdx`.

The broader Objective remains open. Search, AI-native machine routes, marketing home polish, integrations/gallery decisions, and Vercel launch readiness are still separate roadmap slices.

## Follow-Ups

- Wire the AI-native and machine routes: `/llms.txt`, `/llms.mdx/[[...slug]]`, `/agents.md`, `/sitemap.md`, OG, RSS, robots, and sitemap.
- Wire geistdocs search while continuing to omit AI chat.
- Resolve and implement the integrations/gallery direction.
- Finish launch-level marketing home and positioning copy.
