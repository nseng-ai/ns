# Publish-ready @nseng-ai/ns package dry run

## Summary

The `@nseng-ai/ns` host manifest now owns the publishable npm package boundary for the `ns` CLI while the actual dry-run package root remains generated under `dist/publish`.

## Evidence

- `ts/packages/hosts/ns-cli/package.json` is no longer private, declares the public `bin` as prebuilt `bin/ns.js`, includes package `files`, `engines.node >=24.12.0`, and exposes `publish:dry-run`.
- `scripts/prepare-local-package.mjs` derives generated publish metadata from the source manifest, asserts the source manifest is publish-oriented, and writes only public runtime dependencies with concrete catalog versions into `dist/publish/package.json`.
- The generated package still contains the prebuilt CLI, branch-context prompt asset, README, and package metadata only; no workspace dependency specs are emitted.
- `scripts/smoke-checkout-free.mjs` now verifies an installed tarball's `.bin/ns` resolves to packaged `bin/ns.js`, that the packaged CLI starts with a Node shebang, and that it does not include source-checkout shim markers such as `run_checkout` or `ts/node_modules`.
- The developer source shim remains in place for checkout installs; the npm package boundary bypasses it.

## Local verification

Ran successfully on 2026-07-05 UTC:

```bash
pnpm --dir ts --filter @nseng-ai/ns run pack:local
pnpm --dir ts --filter @nseng-ai/ns run smoke:checkout-free
pnpm --dir ts --filter @nseng-ai/ns run publish:dry-run
pnpm --dir ts --filter @nseng-ai/ns run test
just ts-format-check
just ts-lint
just ts-check
just dprint-check
```

`publish:dry-run` ran `npm publish --dry-run ./dist/publish` and did not perform a real registry publish.

## Follow-up

The final npm publish/global or `npx` registry install row remains open; this update only proves the local publish package boundary through npm dry run.
