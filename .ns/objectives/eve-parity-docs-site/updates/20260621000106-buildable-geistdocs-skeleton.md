# Buildable Geistdocs Skeleton

## Summary

The replacement `docs-site/` now has a standalone Next.js App Router + Fumadocs + `@vercel/geistdocs` skeleton with its own `package.json`, `pnpm-lock.yaml`, local pnpm build-script policy, `next.config.ts`, `source.config.ts`, `[lang]` layout, Geist fonts, geistdocs provider/config/source wiring, a placeholder home page, and a placeholder `docs-site/docs/` corpus.

`pnpm --dir docs-site run build` and `just docs-check` both pass against the scaffold.

## Objective Impact

The scaffold roadmap slice is complete. The old-site deletion risk is partially de-risked: SDL no longer has the full published docs corpus in the new app, but it does have a buildable replacement docs app instead of a no-site gap.

Two open design points are now resolved for the durable plan:

- Published Fumadocs content lives in `docs-site/docs/`.
- `docs-site/` stays standalone outside the `ts/` workspace, with a local `pnpm-workspace.yaml` only for pnpm's build-script allowlist.

The site identity / information architecture slice is in progress because baseline `geistdocs.tsx`, `agent{}` metadata, and top-level nav exist, but final copy and real sidebar/content IA still need the content migration.

## Follow-Ups

- Port the real Get started / Concepts / Tools / Guides / Skills corpus into `docs-site/docs/`.
- Add AI-native machine routes and search after the source/content shape is stable.
- Revisit final SDL positioning copy, `github` owner/repo metadata, and any production URL details before launch.
