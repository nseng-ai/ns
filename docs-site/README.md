# ns docs site

## Purpose and content boundary

This is ns's published documentation site. It is a standalone Next.js App Router + Fumadocs app using `@vercel/geistdocs`.

Published content lives under `docs-site/docs/`. The repository-root `docs/` tree is internal engineering documentation and is not published by this site.

## Local development

From the repository root, use the root `just` recipes as the intended local command surface:

```bash
just docs-dev
just docs-build
just docs-check
```

Direct package equivalents are:

```bash
pnpm --dir docs-site install
pnpm --dir docs-site run dev
pnpm --dir docs-site run build
pnpm --dir docs-site run check
```

## Validation baseline

`docs-site/package.json` currently defines `check` as `next build`. That is intentional: for this launch-gated site slice, the production Next.js build is the docs-site validation baseline.

Do not add a separate docs-site lint, format, or TypeScript-only toolchain unless a later slice explicitly introduces one.

## Package/workspace boundary

`docs-site/` has its own `pnpm-lock.yaml` and package metadata. It is outside the repository's root `ts/` pnpm workspace.

Keep the site standalone unless a future change explicitly decides to move it into a broader workspace.

## Vercel deployment

The repository supports two Vercel Root Directory modes so launch configuration can choose the operational shape later.

### Mode A: Vercel Root Directory = repository root

Use the root `vercel.json`. It runs install and build commands against the standalone `docs-site` package:

```bash
pnpm --dir docs-site install --frozen-lockfile
pnpm --dir docs-site run build
```

### Mode B: Vercel Root Directory = `docs-site`

Use `docs-site/vercel.json`. It runs package-local install and build commands:

```bash
pnpm install --frozen-lockfile
pnpm run build
```

### Launch gate

Both Vercel configs intentionally contain:

```json
"ignoreCommand": "exit 0"
```

Vercel treats exit code `0` from `ignoreCommand` as "skip this build," so deploys remain gated until launch-ready. Remove that property from both configs only during an explicit launch slice.

The old Astro/Starlight `dist` output directory setting is no longer used. Do not replace it with a hard-coded `.next` output directory; Vercel's Next.js framework integration owns the output behavior.

### Production URL and access settings

Set `NEXT_PUBLIC_SITE_URL` when the deployed site needs a canonical production origin for metadata, feeds, sitemap, robots, and related generated URLs. Local development falls back to `http://localhost:3000`.

Deployment Protection / Vercel Authentication is a Vercel project setting, not a `vercel.json` setting.
