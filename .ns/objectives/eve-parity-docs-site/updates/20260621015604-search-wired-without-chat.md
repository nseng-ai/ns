# Search Wired Without Chat

## Summary

The docs-site now exposes the root Geistdocs search endpoint at `/api/search` via `createSearchRoute`, using the existing `config` and `geistdocsSource` wrappers.

AI chat remains intentionally omitted: `ai.enabled: false` is set in the Geistdocs config, no `createChatRoute` usage was added, and no `app/api/chat` route exists.

Evidence: `just docs-check` passed, the Next.js build output lists `/api/search`, and grep checks found only the new search route plus the explicit chat disable flag. Browser-level search smoke was not performed in this implementation session.

## Objective Impact

The search roadmap slice is complete. The docs reader now has the server route that the package search dialog queries, while the Objective's Non-Goal of omitting interactive AI chat remains enforced in configuration and route surface.

The broader Objective remains open for launch-ready docs prose, marketing home copy/polish, the integrations/gallery decision, and Vercel/repo launch wiring.

## Follow-Ups

- Rewrite the TODO/Lorum ipsum published docs pages with accurate sdl documentation.
- Replace the marketing home placeholder copy with launch-ready sdl positioning/tagline and remaining home polish.
- Resolve whether the integrations/gallery page catalogs tools, public skills, or is dropped.
- Complete Vercel/repo launch wiring and docs-site README/AGENTS refresh.
