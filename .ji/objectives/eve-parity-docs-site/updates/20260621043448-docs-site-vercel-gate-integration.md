# Docs Site Vercel Gate Integration

## Summary

The docs-site repo/Vercel integration slice is complete.

Root `vercel.json` now supports Vercel projects whose Root Directory is the repository root by installing and building the standalone `docs-site` package while declaring the Next.js framework. `docs-site/vercel.json` now supports Vercel projects whose Root Directory is `docs-site` with package-local install/build commands and the same Next.js framework declaration.

Both Vercel configs intentionally retain `ignoreCommand: "exit 0"`, so Vercel deploys remain launch-gated. The old Astro/Starlight `dist` output directory override has been removed and was not replaced with a hard-coded `.next` output directory; Vercel's Next.js framework integration owns output behavior.

`docs-site/README.md` now documents the root `just docs-dev/docs-build/docs-check` command surface, direct `pnpm --dir docs-site ...` equivalents, the standalone non-`ts`-workspace package boundary, the production-build validation baseline (`check` is `next build`), both Vercel Root Directory modes, launch-gate removal rules, and `NEXT_PUBLIC_SITE_URL` guidance. A scoped `docs-site/AGENTS.md` now records the published/internal docs split, standalone package boundary, command surface, and intentional deploy gate for future agents.

Validation passed with `pnpm --dir docs-site run build`, `just docs-check`, and `just dprint-check`.

## Objective Impact

The repo/Vercel integration roadmap row is complete. The Objective now has launch-gated Next-native deployment wiring and clear local/operator docs without moving `docs-site/` into the root `ts/` workspace or expanding the docs-site check surface beyond the current production build.

The broader Objective remains open because publishable docs prose and launch-level marketing/site identity copy remain incomplete.

## Follow-Ups

- Keep `ignoreCommand: "exit 0"` in both Vercel configs until an explicit launch slice removes the gate.
- Choose the final Vercel Root Directory mode and canonical `NEXT_PUBLIC_SITE_URL` value during launch configuration.
- Rewrite the TODO/Lorum ipsum published docs pages with accurate sdl documentation.
- Replace the marketing home placeholder copy with launch-ready sdl positioning/tagline and remaining home polish.
