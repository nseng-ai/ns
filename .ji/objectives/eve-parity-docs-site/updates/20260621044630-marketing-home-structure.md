# Marketing Home Structure

## Summary

The docs-site marketing home now has the remaining non-content static structure planned for this Objective: an eve-style hero layout, file-tree preview, installer/code-command preview, CTA band, and page metadata/OG/Twitter basics.

This intentionally did not rewrite the final marketing positioning or the published docs corpus. The hero remains placeholder-grade and the new sections use minimal operational labels so launch copy can still be decided in a later content/identity slice.

Validation passed with `pnpm --dir docs-site run build`, `just docs-check`, and `just dprint-check`.

## Objective Impact

The marketing home structure roadmap row is complete. The Objective's remaining launch blockers are now concentrated in launch-level site identity/positioning copy and the TODO/Lorem Ipsum published docs rewrite, not home-page structure.

## Follow-Ups

- Decide and apply launch-ready sdl positioning/tagline/site identity copy.
- Rewrite the TODO/Lorem Ipsum published docs pages with accurate sdl documentation.
- Run final local smoke over home, docs reader/search, `/llms.txt`, `/agents.md`, and a per-page `/llms.mdx/<slug>` before closing the Objective.
