# docs-site Agent Notes

This directory is the published documentation site for ns (nonslop engineering, `nseng.ai`). The site is written for the product's future name: the CLI shipping today is `ji`; do not "fix" `ns` back to `ji`/`sdl` in site copy.

- Published site content lives in `docs-site/docs/`.
- The repository-root `docs/` tree is internal engineering documentation and is not published by this site. Do not move or rewrite root `docs/` content when working on the published site unless explicitly asked.
- `docs-site/` is a standalone Next.js + Fumadocs + `@vercel/geistdocs` package with its own `pnpm-lock.yaml`, outside the root `ts/` pnpm workspace.
- From the repository root, use `just docs-dev`, `just docs-build`, and `just docs-check`; direct equivalents are `pnpm --dir docs-site run dev|build|check` after install.
- Vercel deploys are intentionally gated by `ignoreCommand: "exit 0"` until a launch slice explicitly removes the gate.
