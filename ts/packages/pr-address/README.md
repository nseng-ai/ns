# @asdl/pr-address

TypeScript implementation of the public `pr-address` standalone CLI.

This package owns the package boundary and direct Node CLI entrypoint for `pr-address`. Every `pr-address exec ...` operation — including argv parsing, usage errors, and every `--json-schema` route — executes in TypeScript. Genuinely unknown `pr-address exec <operation>` names are rejected by clinkr as raw stderr exit-2 usage errors, the same as any other unknown command.

## Operations

Invocation is TypeScript-first: the `pr-address` shim on `PATH` executes `node ts/packages/pr-address/src/cli.ts` from the enclosing asdl checkout when invoked inside one, and from the installing checkout everywhere else (see "Distribution" below).

TypeScript-managed local `exec` operation execution:

- Classification and planning: `classification-template`, `validate-feedback-classification`, `plan-feedback`
- Payload/finalization helpers: `build-resolve-thread-batch-payload`, `finalize-run`
- Read-only GitHub fetch helpers: `get-feedback` in both inline and default payload-artifact modes
- Payload detail and stack diff helpers: `read-feedback-detail`, `read-feedback-details`, `stack-feedback-diff-current`
- Stack orchestration helpers: `stack-feedback-preflight`, `stack-feedback-prep`, `stack-feedback-plan`, `stack-feedback-thread-state`, `build-stack-resolve-thread-payloads`
- Batch checkpoint recovery: `record-batch-checkpoint` (validation plus checkpoint artifact writing)
- Composite run preparation and summary: `prepare-run` (inline and default payload-artifact modes, contested-thread reopen, restructured-files detection) and `summarize-feedback`
- Mutation helpers: `resolve-thread-with-reply`, `resolve-thread-batch`, `reply-to-review`, `reply-to-discussion`
- JSON Schema documents: `--json-schema` for every exec operation is served by TypeScript (`src/operation-schemas/index.ts`), with structural semantic parity against captured Python fixtures (`test/fixtures/json-schemas/`)

Argv usage errors (unknown/missing options, excess arguments, non-integer values, invalid `--payload-mode`/`--stdout-mode`/`--format` choices) are rendered by commander in TypeScript as raw stderr exit-2 errors.

## Distribution

`pr-address` is distributed as a machine-level PATH shim that runs this package's sources directly; nothing is bundled or published:

- **Install**: `just install-pr-address` renders the shared TypeScript source CLI shim template to `~/.local/bin/pr-address`, baking in the installing checkout's path as the canonical fallback.
- **Dispatch**: inside an asdl checkout (any worktree), the shim runs that checkout's `ts/packages/pr-address/src/cli.ts`, so each worktree exercises its own code. Everywhere else it runs the baked canonical checkout's sources.
- **Requirements**: `node` (Node 24+, matching the workspace `engines` floor) and `pnpm install` having been run in the checkout's `ts/` directory (`just ts-install`). The shim fails with a clear message when either checkout is unusable.
- **Rollback**: run the independently published `asdl-pr-address` package manually via `uvx --from asdl-pr-address==0.1.1 pr-address`. That release lives on PyPI and is unrelated to the in-repo TypeScript sources.

Shim dispatch behavior is covered by `test/wrapper/pr-address-shim.test.ts`.

## Local usage

From the repo root:

```bash
node ts/packages/pr-address/src/cli.ts --help
pr-address --help  # via the installed shim, dispatches to this checkout
pr-address exec prepare-run --harness-session-id pr-address-demo --format json
```

Validate classification JSON without creating repo scratch files:

```bash
printf '%s' "$CLASSIFICATION_JSON" \
  | pr-address exec validate-feedback-classification \
      --pr-number <pr-number> \
      --format json
```

`validate-feedback-classification --classification-file <path>` hard-fails when `<path>` resolves inside the current git worktree. Use stdin, `--classification-json`, or a file outside the worktree.

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

## Distribution decisions

Public distribution is decided: `pr-address` is a PATH shim over checkout sources; `@asdl/pr-address` is not published to npm.
