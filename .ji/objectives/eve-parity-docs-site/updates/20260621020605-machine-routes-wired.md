# Machine Routes Wired

## Summary

The standalone Next.js/geistdocs `docs-site/` now exposes the AI-native and machine-readable route slice for the migrated published corpus.

Root and localized endpoints serve the full corpus (`/llms.txt`, `/en/llms.txt`), focused page Markdown (`/llms.mdx/<slug>`, `/en/llms.mdx/<slug>`), SDL agent instructions (`/agents.md`, `/en/agents.md`), sitemap Markdown, RSS, `robots.txt`, `sitemap.xml`, and generated per-page OG images. The existing docs Markdown negotiation path also remains active for `/docs/<slug>.mdx` through the Geistdocs proxy.

Validation passed with `pnpm --dir docs-site run build`, `just docs-check`, `just dprint-check`, and local smoke checks covering root/localized machine routes, `/docs/introduction.mdx`, RSS/XML/robots, and root/localized OG image routes.

## Objective Impact

The AI-native + machine-routes roadmap slice is complete. This further de-risks the migration gap: the new app now has the migrated corpus plus the machine endpoints agents need, while search, marketing home polish, integrations/gallery direction, and launch wiring remain separate Objective work.

A small implementation adaptation was needed: Geistdocs' default-locale i18n proxy redirects `/en/*` paths to root paths by default, so the proxy now narrowly bypasses default-locale machine routes and lets those route handlers answer directly. Root `/llms.txt` md-tracking remains wired through the Geistdocs proxy.

The earlier parked note about dynamic per-page OG is superseded for this slice by simple generated SDL page cards; any future OG work is now advanced/branded artwork, not route existence.

## Follow-Ups

- Wire Geistdocs search while continuing to omit AI chat.
- Finish launch-level marketing home/site identity and positioning copy.
- Resolve and implement the integrations/gallery direction.
- Complete Vercel/repo launch wiring and docs-site README/AGENTS refresh.
