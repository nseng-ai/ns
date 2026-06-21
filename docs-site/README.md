# sdl docs site

This is sdl's published documentation site. It is a standalone Next.js + Fumadocs app using `@vercel/geistdocs`, with its own lockfile outside the `ts/` pnpm workspace.

Published content lives under `docs-site/docs/`. The repository-root `docs/` tree is internal engineering documentation and is not published by this site.

## Development

```bash
pnpm --dir docs-site install
pnpm --dir docs-site run dev
pnpm --dir docs-site run build
```

Vercel deploys remain gated by `vercel.json` until launch-ready.
