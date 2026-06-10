# @asdl/pr-address

TypeScript migration scaffold for the public `pr-address` standalone CLI.

This package establishes the TypeScript package boundary, direct Node CLI entrypoint, and local wrapper routing for `pr-address`. It is **not** a full operation port yet: unported `pr-address exec ...` operations delegate directly to the legacy Python CLI until each operation is ported and covered by parity tests.

## Current migration status

Local checkout invocation is TypeScript-first: `skills/pr-address/scripts/pr-address-run` executes `node ts/packages/pr-address/src/cli.ts` unless `ASDL_PR_ADDRESS_MODE` forces another path. Installed/prod skill invocation and the `asdl pr-address ...` plugin remain Python-backed compatibility paths.

TypeScript-managed local `exec` operation execution after the current stack:

- Classification and planning: `classification-template`, `validate-feedback-classification`, `plan-feedback`
- Payload/finalization helpers: `build-resolve-thread-batch-payload`, `finalize-run`
- Read-only GitHub fetch helpers: `get-pr-for-branch`, `get-reviews`, `get-review-comments`, `get-discussion-comments`, plus `get-feedback` in both inline and default payload-artifact modes
- Payload detail and stack diff helpers: `read-feedback-detail`, `read-feedback-details`, `stack-feedback-diff-current`
- Stack orchestration helpers: `stack-feedback-prep`, `stack-feedback-plan`, `build-stack-resolve-thread-payloads`
- Batch checkpoint recovery: `record-batch-checkpoint` (validation plus checkpoint artifact writing)
- Composite run preparation and summary: `prepare-run` (inline and default payload-artifact modes, contested-thread reopen, restructured-files detection) and `summarize-feedback`
- Mutation helpers: `resolve-thread`, `resolve-thread-with-reply`, `resolve-thread-batch`, `unresolve-thread`, `add-review-thread-reply`, `reply-to-review`, `reply-to-discussion`, `add-issue-comment`, `add-reaction`

Compatibility-backed behavior that must stay in place for now:

- Invalid `--payload-mode` values for `get-feedback` and `prepare-run`, invalid `--stdout-mode` values for `stack-feedback-prep` and `stack-feedback-plan`, and non-integer `--body-chars` values for `summarize-feedback` (click usage-error rendering)
- Any operation-specific `--json-schema` path not yet served by TypeScript
- Installed/prod wrapper mode and the Python `asdl pr-address ...` plugin

## Local usage

From the repo root:

```bash
node ts/packages/pr-address/src/cli.ts --help
skills/pr-address/scripts/pr-address-run --help
skills/pr-address/scripts/pr-address-run exec prepare-run --payload-session-id pr-address-demo --format json
```

In a local checkout, `skills/pr-address/scripts/pr-address-run` defaults to this TypeScript scaffold. Use `ASDL_PR_ADDRESS_MODE=python-local` (or `legacy-python`) to force the local legacy Python fallback for debugging. `ASDL_PR_ADDRESS_MODE=prod` remains the pinned PyPI Python path until a later npm/prod cutover.

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

Public distribution cutover requires an explicit decision after npm/bin packaging, installed-skill wrapper behavior, rollback mode, and plugin compatibility are proven. Until then, keep the Python compatibility package and Python `asdl pr-address ...` plugin intact.
