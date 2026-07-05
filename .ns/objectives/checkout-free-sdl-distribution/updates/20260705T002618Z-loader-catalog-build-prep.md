# Semantic Update — Loader catalog and local build prep

## Summary

Implemented the checkout-free loader rewrite slice for Objective discovery while preserving source-checkout development behavior:

- Added installed-runtime Objective command metadata in `ts/packages/kernel/src/extensions/first-party-catalog.ts` so `ns objective ...` routes are discoverable without a repo-local `.ns/extensions/objective` manifest.
- Added explicit command module references (`file` vs `package`) and package-specifier selected loading. First-party Objective catalog entries import selected commands lazily from `@ns/objective/ns/commands/<name>`.
- Kept project/global `.ns/extensions` precedence unchanged; project Objective manifests override the preinstalled Objective metadata.
- Replaced selected package shim loading with host package resolution for simple `export { default } from "@ns/...";` shims, avoiding checkout-source aliases in the user-extension Jiti path.
- Removed the hard-coded CCC/core/capability-kit checkout alias map from the default user-extension Jiti loader; the remaining source-checkout package scan is explicitly source-dev-only and is not required for installed Objective discovery.
- Added a local non-publishing kernel build shape via `ts/packages/kernel/tsconfig.dist.json` and `pnpm --dir ts --filter @ns/kernel run build:local`; `private: true` and publish ownership remain unchanged.

## Evidence

Focused and repo gates run in this worktree:

```bash
pnpm --dir ts exec vitest run --config vitest.config.ts \
  packages/kernel/test/unit/sdk-module-loader.test.ts \
  packages/kernel/test/unit/extension-registry.test.ts \
  packages/kernel/test/unit/first-party-catalog.test.ts \
  packages/kernel/test/unit/extension-loader.test.ts

pnpm --dir ts exec vitest run --config vitest.integration.config.ts \
  packages/kernel/test/integration/sdk-module-loader.test.ts \
  packages/kernel/test/integration/extension-loader-cli.test.ts \
  packages/kernel/test/integration/repo-local-extension-manifest-parity.test.ts

just ts-format-check
just ts-lint
just ts-check
just ts-test
just ts-test-integration
pnpm --dir ts --filter @ns/kernel run build:local
```

Final results:

- `just ts-format-check`: pass.
- `just ts-lint`: pass.
- `just ts-check`: pass.
- `just ts-test`: 422 files / 4114 tests passed.
- `just ts-test-integration`: 29 files / 114 tests passed.
- `build:local`: `tsc -p tsconfig.dist.json` passed and emitted local `dist` output.

Specific behavior evidence added to tests:

- Foreign repo with no `.ns/extensions` can show `ns objective list --help` from preinstalled Objective metadata.
- Project `.ns/extensions/objective` manifest overrides the preinstalled Objective route.
- `NS_KERNEL_DISABLE_FIRST_PARTY_EXTENSIONS=1` remains covered by existing registry behavior.
- Catalog parity checks ensure Objective metadata matches the package-owned Objective descriptor and contains no `@ns/ccc/*` entries.
- Source-dev first-party package discovery remains available in checkout tests, but Objective installed discovery no longer depends on source-root scanning.

## Remaining follow-ups

- Final npm package owner and package graph decision (`@ns/kernel` directly vs wrapper) remains open.
- Publish metadata, `private` flips, `files`/`exports` final shape, and actual npm install verification remain open.
- Broader first-party command catalog ownership remains open. The current source-dev scan preserves checkout behavior for non-Objective first-party commands; installed distribution should eventually get generated/package-owned metadata rather than hand-maintained kernel tables.
- Actual checkout-free machine/no-repo install smoke remains for the later build/publish row.
