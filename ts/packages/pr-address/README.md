# @asdl/pr-address

TypeScript implementation of the public `pr-address` standalone CLI.

Every `pr-address exec ...` operation, every `--json-schema` route, and all envelope rendering is TypeScript-owned. The in-repo Python `asdl-pr-address` package is deleted; rollback is the frozen published PyPI artifact (`asdl-pr-address==0.1.1` via `uvx`), not in-repo code.

## Invocation surfaces

Local checkout invocation is TypeScript-first: `skills/pr-address/scripts/pr-address-run` executes `node ts/packages/pr-address/src/cli.ts` unless `ASDL_PR_ADDRESS_MODE` forces another path. Installed/prod skill invocation executes the checked-in self-contained bundle at `skills/pr-address/scripts/pr-address.bundle.mjs` (see "Bundled distribution" below). The `asdl pr-address ...` plugin is retired; the standalone `pr-address` CLI is the only invocation surface.

## Bundled distribution

Installed skills are copies of `skills/pr-address/`, so the prod execution path ships inside that directory as a checked-in, self-contained artifact:

- **Artifact**: `skills/pr-address/scripts/pr-address.bundle.mjs` — single-file ESM bundle (sources plus `zod`), runnable by plain `node` with no `node_modules`. It is generated; never hand-edit it.
- **Bundler**: `esbuild` (package devDependency, version pinned by the pnpm lockfile), driven by `scripts/bundle.ts`. The output is deterministic for a given source tree and esbuild version: stable banner, pinned `absWorkingDir`, no timestamps.
- **Node floor**: the bundle targets `node24`, matching the workspace `engines` floor (`>=24.12.0`).
- **Refresh story**: the bundle is checked in, not built on install. Regenerate it with `pnpm --dir ts/packages/pr-address run bundle` (or `just bundle-pr-address`) whenever package sources change. The freshness test in `test/wrapper/pr-address-bundle.test.ts` rebuilds the bundle and compares bytes, so a stale checked-in artifact fails `pnpm run test` / CI rather than silently shipping old behavior.
- **Rollback**: `ASDL_PR_ADDRESS_MODE=legacy-python` runs the published legacy Python package via `uvx --from asdl-pr-address==0.1.1`. The earlier `0.1.0` pin was never published to PyPI and never worked.

## Local usage

From the repo root:

```bash
node ts/packages/pr-address/src/cli.ts --help
skills/pr-address/scripts/pr-address-run --help
skills/pr-address/scripts/pr-address-run exec prepare-run --payload-session-id pr-address-demo --format json
```

In a local checkout, `skills/pr-address/scripts/pr-address-run` defaults to the TypeScript sources. Wrapper modes:

- `ASDL_PR_ADDRESS_MODE=local` (or `ts-local`) forces the checkout TypeScript sources.
- `ASDL_PR_ADDRESS_MODE=prod` forces the checked-in bundle (`skills/pr-address/scripts/pr-address.bundle.mjs`), which is also the default outside a checkout.
- `ASDL_PR_ADDRESS_MODE=legacy-python` is the rollback mode: `uvx --from asdl-pr-address==0.1.1`.

## Contract fixtures

Python-generated parity fixtures are checked into `test/fixtures/` (including the golden contract snapshots under `test/fixtures/golden/v1/`). They are the durable contract reference now that the Python implementation is deleted; update them only when a contract change is intentional, and review diffs case-by-case.

Intentional divergence from the deleted Python CLI: the three former click usage-error shapes (invalid `--payload-mode`, invalid `--stdout-mode`, non-integer `--body-chars`) now render the package's standard `invalid_request` machine envelopes instead of click usage text.

## Validation

```bash
pnpm --dir ts --filter @asdl/pr-address run check
pnpm --dir ts --filter @asdl/pr-address run test
```

Broader workspace validation:

```bash
pnpm --dir ts run check
pnpm --dir ts run test
```

## Distribution

Installed/prod mode executes the checked-in bundled artifact shipped inside the skill; `@asdl/pr-address` is not published to npm. Rollback to the published Python package stays available through `ASDL_PR_ADDRESS_MODE=legacy-python` against the frozen PyPI release.
