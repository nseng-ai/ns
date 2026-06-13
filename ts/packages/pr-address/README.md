# @asdl/pr-address

TypeScript implementation of the public `pr-address` standalone CLI.

This package owns the package boundary and direct Node CLI entrypoint for `pr-address`. Every `pr-address exec ...` operation executes in TypeScript; the legacy Python CLI remains only as a compatibility fallback for a few click usage-error shapes (see "Compatibility-backed behavior" below).

## Current migration status

Invocation is TypeScript-first: the `pr-address` shim on `PATH` executes `node ts/packages/pr-address/src/cli.ts` from the enclosing asdl checkout when invoked inside one, and from the installing checkout everywhere else (see "Distribution" below). Only the `asdl pr-address ...` plugin remains a Python-backed compatibility path.

TypeScript-managed local `exec` operation execution:

- Classification and planning: `classification-template`, `validate-feedback-classification`, `plan-feedback`
- Payload/finalization helpers: `build-resolve-thread-batch-payload`, `finalize-run`
- Read-only GitHub fetch helpers: `get-feedback` in both inline and default payload-artifact modes
- Payload detail and stack diff helpers: `read-feedback-detail`, `read-feedback-details`, `stack-feedback-diff-current`
- Stack orchestration helpers: `stack-feedback-preflight`, `stack-feedback-prep`, `stack-feedback-plan`, `build-stack-resolve-thread-payloads`
- Batch checkpoint recovery: `record-batch-checkpoint` (validation plus checkpoint artifact writing)
- Composite run preparation and summary: `prepare-run` (inline and default payload-artifact modes, contested-thread reopen, restructured-files detection) and `summarize-feedback`
- Mutation helpers: `resolve-thread-with-reply`, `resolve-thread-batch`, `reply-to-review`, `reply-to-discussion`
- JSON Schema documents: `--json-schema` for every exec operation is served by TypeScript (`src/operation-schemas.ts`), with structural semantic parity against captured Python fixtures (`test/fixtures/json-schemas/`)

Compatibility-backed behavior that must stay in place for now:

- Invalid `--payload-mode` values for `get-feedback` and `prepare-run`, invalid `--stdout-mode` values for `stack-feedback-preflight`, `stack-feedback-prep`, and `stack-feedback-plan`, and non-integer `--body-chars` values for `summarize-feedback` (click usage-error rendering)
- The Python `asdl pr-address ...` plugin

## Distribution

`pr-address` is distributed as a machine-level PATH shim that runs this package's sources directly; nothing is bundled or published:

- **Install**: `just install-pr-address` renders `scripts/pr-address-shim` to `~/.local/bin/pr-address`, baking in the installing checkout's path as the canonical fallback.
- **Dispatch**: inside an asdl checkout (any worktree), the shim runs that checkout's `ts/packages/pr-address/src/cli.ts`, so each worktree exercises its own code. Everywhere else it runs the baked canonical checkout's sources.
- **Requirements**: `node` (Node 24+, matching the workspace `engines` floor) and `pnpm install` having been run in the checkout's `ts/` directory (`just ts-install`). The shim fails with a clear message when either checkout is unusable.
- **Rollback**: run the published legacy Python package manually via `uvx --from asdl-pr-address==0.1.1 pr-address`. The earlier `0.1.0` pin was never published to PyPI and never worked.

Shim dispatch behavior is covered by `test/wrapper/pr-address-shim.test.ts`.

## Local usage

From the repo root:

```bash
node ts/packages/pr-address/src/cli.ts --help
pr-address --help  # via the installed shim, dispatches to this checkout
pr-address exec prepare-run --payload-session-id pr-address-demo --format json
```

For debugging the legacy Python implementation directly, use `uv run pr-address-py` (the console script is deliberately not named `pr-address` so the shim is not shadowed by `.venv/bin`).

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

The direct Python fallback exists only for the migration window. It must call the `pr-address-py` console script, never plain `pr-address`, because `pr-address` on PATH is the TypeScript shim and delegation to it would recurse.

Retire fallback behavior only per proven operation. Required evidence before removing a fallback path:

1. TypeScript scenario tests cover the public success, negative, validation, and `--format json` envelope behavior.
2. Gateway-backed tests prove live-effect operations without writing to GitHub.
3. Golden/parity fixtures cover payload-shape-sensitive helpers.
4. Any advertised `--json-schema` output is served by TypeScript or intentionally documented as removed.
5. Shim tests prove checkout dispatch and the canonical fallback still route predictably.

Public distribution is decided: `pr-address` is a PATH shim over checkout sources; `@asdl/pr-address` is not published to npm. Rollback to the published Python package stays available via `uvx --from asdl-pr-address==0.1.1 pr-address` until the Python compatibility package and the Python `asdl pr-address ...` plugin are retired by an explicit later decision.
