# Autobranch CLI entry and skill

## Semantic Update

`/code:autobranch` moved from orphan `NONE` to `FULL` parity.

Implementation evidence:

- `@asdl/ccc` now ships a `ccc` bin with a hidden agent-facing `ccc exec autobranch` operation.
- The CLI delegates to the existing CCC autobranch orchestration for both dirty-worktree and latest-commit transactions instead of duplicating the stash/Graphite/recovery logic.
- Pi `/code:autobranch` remains a thin adapter importing the same CCC core.
- `code-autobranch` is installed as an internal first-party skill and delegates to `ccc exec autobranch`.
- `ts/packages/ccc/test/scenario/autobranch-cli.test.ts` covers CLI help/version/runtime, hidden `exec` help, dirty-worktree success, latest-commit success, requested slugs, unknown-argument behavior, and failure exit codes/stderr.

Surface decision:

- CCC skill-invoked operations should use the hidden `ccc exec` subgroup when the operation is agent-facing rather than a human top-level command.
- This update adds only `ccc exec autobranch`; it does not add a public `ccc autobranch` alias.
- Future CCC push-down rows for land and cmux dispatch should reuse the `ccc` bin / hidden `exec` precedent unless a later design explicitly chooses a public alias.

Validation:

- `pnpm --dir ts --filter @asdl/ccc run check` passed.
- `pnpm --dir ts --filter @asdl/ccc run test` passed.
- `pnpm --dir ts --filter @asdl/pi-extensions run test` passed.
- `just ts-check` passed.
- `just ts-test` passed.
- `ccc --help` and `ccc exec autobranch --help` passed as non-mutating manual smoke checks.
- `uv run areg check` passed for the new skill/lockfile entry.
- `just dprint-check` passed.

Remaining follow-ups:

- Stack landing and cmux dispatch rows still need CLI+skill push-down.
- `/cp-preview` and `/code:changes` still need FULL or WAIVED parity decisions.
