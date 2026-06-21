# Lowercase Branding and Review Fixes

## Summary

The docs-site review-feedback follow-up normalized the public docs brand to lowercase `sdl` across the site shell, marketing home placeholder copy, metadata, OG cards, RSS feed, footer, README, and placeholder corpus. The same branch also hardens markdown request tracking so a missing `siteId` disables tracking rather than sending fallback telemetry, omits absent sitemap `lastModified` values instead of emitting `undefined`, and documents the intentional in-place Remark/MDAST mutation in `source.config.ts`.

Evidence: PR #1968 (`geistdocs-docs-site-review-feedback-fixes`) contains commit `e337c4720` on top of Graphite parent `docs-site-machine-routes-config-cleanup`; `just docs-check` passed after the changes.

## Objective Impact

The site identity slice advanced: brand casing is now resolved to lowercase `sdl` across the docs-site public surfaces and generated metadata. It is still not launch-ready positioning copy because the home page and published page bodies intentionally remain Lorem Ipsum/TODO placeholders.

The marketing home slice is now in progress rather than untouched: a buildable static home exists and carries the chosen lowercase brand, but it still needs real sdl positioning, tagline, and any missing eve-style home components/polish.

The machine-route slice remains complete and gained additional confidence from the tracking, sitemap, and Remark transformer review fixes.

## Follow-Ups

- Replace the Lorem Ipsum/TODO published docs pages with accurate sdl documentation before treating the content corpus as launch-ready.
- Replace the marketing home placeholder copy with launch-ready sdl positioning/tagline and decide whether to add the remaining eve-style file-tree, installer, CTA, and metadata polish.
- Wire Geistdocs search while continuing to omit AI chat.
- Resolve the integrations/gallery direction.
- Complete Vercel/repo launch wiring and docs-site README/AGENTS refresh.
