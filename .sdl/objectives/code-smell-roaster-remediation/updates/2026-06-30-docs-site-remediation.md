# Docs Site Smell Remediation

## Summary

Remediated the `docs-site` code-smell cluster's four confirmed findings without changing published docs routes or generated site behavior:

- `MarketingHero` now owns the shared home/extensions hero structure and class strings, with each page supplying its copy, CTAs, and side-panel preview.
- Geistdocs configuration was split by responsibility into focused brand, nav/GitHub, AI assistant, and site identity modules; `config.tsx` composes those modules and root `geistdocs.tsx` remains a compatibility re-export surface.
- The extension category descriptor generic coverage-check machinery was removed, leaving the simple descriptor list plus duplicate-category guard.
- `getPageMetadata` now centralizes page metadata defaults for OG image and RSS generation.

Validation passed: `pnpm --dir docs-site run check` and `just dprint-check`.

## Objective Impact

The four `references/docs-site.md` findings are now dispositioned as fixed in `roadmap.md`:

- Duplicated Code in home/extensions hero markup: fixed by `MarketingHero`.
- Divergent Change in `geistdocs.tsx`: fixed by splitting config ownership into focused modules while preserving exports.
- Speculative Generality in extension category descriptors: fixed by removing one-use recursive generic coverage types.
- Duplicated Code in OG/RSS metadata access: fixed by `getPageMetadata`.

This reduces the open no-disposition backlog by one docs-site cluster while preserving docs-site behavior.

## Follow-Ups

No docs-site follow-up is known. Future docs-site landing pages should use `MarketingHero` for this hero layout, and future Geistdocs config additions should extend the focused modules instead of expanding root `geistdocs.tsx`.
