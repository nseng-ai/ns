# Delete Old Docs Site Outright

## Summary

The migration no longer needs a separate asset/content preservation step before removing the Astro/Starlight `docs-site/`. The old site can be deleted outright; if specific content, assets, sidebar wiring, Vercel config, or `just docs-*` behavior is needed later, recover it from git history and the Objective reference notes.

The existing `docs-site/` directory was removed as the first implementation slice.

## Objective Impact

The roadmap's first slice is complete and simplified: deletion happened without staging migration artifacts. The content-porting slice now treats the old Starlight corpus as recoverable reference material rather than a copied migration input.

The loss-of-working-site risk remains active until a buildable Next.js/geistdocs skeleton exists, so the next useful slice is to scaffold the new standalone `docs-site/` app quickly.

## Follow-Ups

- Scaffold the standalone Next.js + Fumadocs + `@vercel/geistdocs` app under `docs-site/`.
- Use git history only as needed for old Starlight content/assets/wiring reference.
