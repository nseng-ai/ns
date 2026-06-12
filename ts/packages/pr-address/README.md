# @asdl/pr-address

TypeScript implementation of the public `pr-address` standalone CLI.

This package owns the package boundary and direct Node CLI entrypoint for `pr-address`. All `pr-address exec ...` behavior is native TypeScript; the direct Python fallback has been retired.

## Current status

Invocation is TypeScript-native: the `pr-address` shim on `PATH` executes `node ts/packages/pr-address/src/cli.ts` from the enclosing asdl checkout when invoked inside one, and from the installing checkout everywhere else (see "Distribution" below). The legacy Python bridge and `asdl pr-address ...` plugin path have been retired.

Native local `exec` operation execution:

- Classification and planning: `classification-template`, `validate-feedback-classification`, `plan-feedback`
- Payload/finalization helpers: `build-resolve-thread-batch-payload`, `finalize-run`
- Read-only GitHub fetch helpers: `get-feedback` in both inline and default payload-artifact modes
- Payload detail and stack diff helpers: `read-feedback-detail`, `read-feedback-details`, `stack-feedback-diff-current`
- Stack orchestration helpers: `stack-feedback-prep`, `stack-feedback-plan`, `build-stack-resolve-thread-payloads`
- Batch checkpoint recovery: `record-batch-checkpoint` (validation plus checkpoint artifact writing)
- Composite run preparation and summary: `prepare-run` (inline and default payload-artifact modes, contested-thread reopen, restructured-files detection) and `summarize-feedback`
- Mutation helpers: `resolve-thread-with-reply`, `resolve-thread-batch`, `reply-to-review`, `reply-to-discussion`
- JSON Schema documents: `--json-schema` for every exec operation is served by TypeScript (`src/operation-schemas.ts`), with structural semantic parity against captured fixtures (`test/fixtures/json-schemas/`)

Unknown operations and invalid argument values fail natively with exit 2.

## Distribution

`pr-address` is distributed as a machine-level PATH shim that runs this package's sources directly; nothing is bundled or published:

- **Install**: `just install-pr-address` renders `scripts/pr-address-shim` to `~/.local/bin/pr-address`, baking in the installing checkout's path as the canonical checkout.
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

Public distribution is decided: `pr-address` is a PATH shim over checkout sources; `@asdl/pr-address` is not published to npm. Manual rollback to the historical published Python package remains available via `uvx --from asdl-pr-address==0.1.1 pr-address`.
