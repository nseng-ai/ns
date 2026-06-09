# @asdl/pr-address

TypeScript migration scaffold for the public `pr-address` standalone CLI.

This package establishes the TypeScript package boundary, direct Node CLI entrypoint, and local wrapper routing for `pr-address`. It is **not** a full operation port yet: unported `pr-address exec ...` operations delegate directly to the legacy Python CLI until each operation is ported and covered by parity tests.

## Current migration status

Local checkout invocation is TypeScript-first: `skills/pr-address/scripts/pr-address-run` executes `node ts/packages/pr-address/src/cli.ts` unless `ASDL_PR_ADDRESS_MODE` forces another path. Installed/prod skill invocation executes the checked-in self-contained bundle at `skills/pr-address/scripts/pr-address.bundle.mjs` (see "Bundled distribution" below). Only the `asdl pr-address ...` plugin remains a Python-backed compatibility path.

TypeScript-managed local `exec` operation execution after the current stack:

- Classification and planning: `classification-template`, `validate-feedback-classification`, `plan-feedback`
- Payload/finalization helpers: `build-resolve-thread-batch-payload`, `finalize-run`
- Read-only GitHub fetch helpers: `get-pr-for-branch`, `get-reviews`, `get-review-comments`, `get-discussion-comments`, plus `get-feedback` in both inline and default payload-artifact modes
- Payload detail and stack diff helpers: `read-feedback-detail`, `read-feedback-details`, `stack-feedback-diff-current`
- Stack orchestration helpers: `stack-feedback-prep`, `stack-feedback-plan`, `build-stack-resolve-thread-payloads`
- Batch checkpoint recovery: `record-batch-checkpoint` (validation plus checkpoint artifact writing)
- Composite run preparation and summary: `prepare-run` (inline and default payload-artifact modes, contested-thread reopen, restructured-files detection) and `summarize-feedback`
- Mutation helpers: `resolve-thread`, `resolve-thread-with-reply`, `resolve-thread-batch`, `unresolve-thread`, `add-review-thread-reply`, `reply-to-review`, `reply-to-discussion`, `add-issue-comment`, `add-reaction`
- JSON Schema documents: `--json-schema` for every exec operation is served by TypeScript (`src/operation-schemas.ts`), with structural semantic parity against captured Python fixtures (`test/fixtures/json-schemas/`)

Compatibility-backed behavior that must stay in place for now:

- Invalid `--payload-mode` values for `get-feedback` and `prepare-run`, invalid `--stdout-mode` values for `stack-feedback-prep` and `stack-feedback-plan`, and non-integer `--body-chars` values for `summarize-feedback` (click usage-error rendering)
- The Python `asdl pr-address ...` plugin

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

In a local checkout, `skills/pr-address/scripts/pr-address-run` defaults to this TypeScript scaffold. Wrapper modes:

- `ASDL_PR_ADDRESS_MODE=local` (or `ts-local`) forces the checkout TypeScript sources.
- `ASDL_PR_ADDRESS_MODE=prod` forces the checked-in bundle (`skills/pr-address/scripts/pr-address.bundle.mjs`), which is also the default outside a checkout.
- `ASDL_PR_ADDRESS_MODE=python-local` forces the local legacy Python package via `uv run` for debugging.
- `ASDL_PR_ADDRESS_MODE=legacy-python` is the rollback mode: `uvx --from asdl-pr-address==0.1.1`.

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

## Fallback retirement

The direct Python fallback exists only for the migration window. It must not call the `pr-address-run` wrapper, because the wrapper is now TypeScript-default in local checkouts and wrapper delegation would risk recursion.

Retire fallback behavior only per proven operation. Required evidence before removing a fallback path:

1. TypeScript scenario tests cover the public success, negative, validation, and `--format json` envelope behavior.
2. Gateway-backed tests prove live-effect operations without writing to GitHub.
3. Golden/parity fixtures cover payload-shape-sensitive helpers.
4. Any advertised `--json-schema` output is served by TypeScript or intentionally documented as removed.
5. Wrapper tests prove local, forced legacy, and prod modes still route predictably.

Public distribution is decided: installed/prod mode executes the checked-in bundled artifact shipped inside the skill; `@asdl/pr-address` is not published to npm. Rollback to the published Python package stays available through `ASDL_PR_ADDRESS_MODE=legacy-python` until the Python compatibility package and the Python `asdl pr-address ...` plugin are retired by an explicit later decision.
