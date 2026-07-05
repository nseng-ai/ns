# Local `ns` CLI Bundle and Foreign-Repo Smoke

## Summary

Implemented the first local checkout-free package artifact around the `@ns/cli` host wrapper:

- `@ns/cli` is now the source owner for a generated local `@nseng-ai/ns` package artifact; the workspace package remains `@ns/cli` and the generated publish root carries the external package name.
- Added an esbuild bundle path for the `ns` CLI. First-party `@ns/*` code is bundled into `bin/ns.js`; public runtime dependencies remain external in the generated manifest (`jiti`, `zod`, `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`).
- Added deterministic local package assembly and smoke scripts: `build:bundle`, `pack:local`, and `smoke:checkout-free`.
- Added preinstalled catalog loader thunks so bundled Objective commands load in-process instead of dynamically importing `@ns/objective/...` package specifiers at runtime. The specifier-only path remains available for source/dev and extension scenarios.
- Copied the branch-context prompt asset required by the bundled Objective dependency closure into the local artifact instead of relying on a source-tree relative path.

No `npm publish` was run.

## Objective Impact

This advances both the loader and artifact rows from not-started to in-progress. The local tarball smoke proves the current artifact can be installed into a throwaway git repo outside the source checkout and run:

```bash
pnpm --dir ts --filter @ns/cli run smoke:checkout-free
```

The smoke performs `npm install <local @nseng-ai/ns tarball>` in a temp foreign repo and verifies `ns objective list --help` plus `ns objective list --format md --minimal` through the installed `node_modules/.bin/ns` entrypoint.

The artifact is deliberately a single first-party bundle for this first local package slice. That de-risks checkout-free Objective usage without forcing final registry topology decisions; multi-package publication remains available for later release packaging.

## Follow-Ups

- Extend smoke/release evidence from local tarball to the eventual real npm package install path.
- Decide whether additional first-party capability commands join the bundled preinstalled catalog before publication.
- Keep release automation and actual `npm publish` parked until explicitly authorized.
- Continue validating that runtime assets used by bundled first-party code are copied into the package artifact rather than read from checkout-relative source paths.
