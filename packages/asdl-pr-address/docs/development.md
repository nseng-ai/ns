# asdl-pr-address development notes

Developer-facing implementation details for the `asdl-pr-address` package.

## Runtime dispatch

`pr-address` on `PATH` is a shim installed by `just install-pr-address` (it
renders `ts/packages/pr-address/scripts/pr-address-shim` to
`~/.local/bin/pr-address`, baking in the installing checkout as the canonical
fallback).

- inside an asdl checkout with `ts/packages/pr-address/src/cli.ts` → the
  enclosing checkout's TypeScript sources run, so each worktree exercises its
  own code
- everywhere else → the shim runs the baked canonical checkout's sources
- both cases need plain `node` (Node 24+) and an installed `ts/node_modules`
  (`just ts-install`); no PyPI or npm install happens
- the remaining legacy-Python fallback (a small set of usage-error envelope
  shapes) delegates to the local `pr-address-py` console script in a checkout,
  or to the pinned PyPI release via `uvx` otherwise

The Python console script is deliberately named `pr-address-py` so
`.venv/bin` does not shadow the TypeScript shim inside the repo.

## Updating the rollback pin

To move the legacy Python rollback pin, publish the new `asdl-pr-address`
release to PyPI first, then bump `LEGACY_PR_ADDRESS_VERSION` in
`ts/packages/pr-address/src/legacy-python.ts`. The pin must reference a release
that actually exists on PyPI; the original `0.1.0` pin never did. Manual
rollback runs `uvx --from asdl-pr-address==<pin> pr-address` directly.

## Local development

For working on this package itself:

```bash
git clone https://github.com/dagster-io/asdl
cd asdl
uv sync
```

The shim runs the enclosing checkout's TypeScript sources. Edits to
`packages/asdl-pr-address/` are only reached through the remaining usage-error
fallback; invoke the Python CLI directly with `uv run pr-address-py` when
debugging it. To run tests for just this package:

```bash
uv run pytest packages/asdl-pr-address
```

Or run the full suite from the repo root with `just`.

## Operation inventory

This Python package remains the compatibility implementation for the
`asdl pr-address ...` plugin, the explicit `pr-address-py` / pinned-`uvx`
rollback paths, and a small set of usage-error envelope shapes. Treat the public
skill, the `skills/pr-address/references/cli-*.md` reference files, source
registration,
scenario tests, and golden fixtures as stronger contract sources than this
developer overview when porting behavior.

### Current TypeScript-managed execution

Every `pr-address exec ...` operation and every operation `--json-schema` route
is TypeScript-managed, wherever the shim dispatches.

### Compatibility-backed behavior still required

Keep Python fallback for:

- invalid `--payload-mode` values for `get-feedback` and `prepare-run`, invalid
  `--stdout-mode` values for `stack-feedback-prep` and `stack-feedback-plan`,
  and non-integer `--body-chars` values for `summarize-feedback` (click
  usage-error rendering)
- the `asdl pr-address ...` plugin

The current legacy operation set, by category:

- **Feedback fetch / composite**: `get-feedback`, `summarize-feedback`,
  `prepare-run`
- **Classification / payload ergonomics**: `read-feedback-detail`,
  `read-feedback-details`, `classification-template`,
  `validate-feedback-classification`, `plan-feedback`
- **Batch / finalization**: `build-resolve-thread-batch-payload`,
  `record-batch-checkpoint`, `finalize-run`
- **Stack feedback**: `stack-feedback-prep`, `stack-feedback-plan`,
  `stack-feedback-diff-current`, `build-stack-resolve-thread-payloads`
- **Thread mutations**: `resolve-thread-with-reply`, `resolve-thread-batch`
  - `resolve-thread-with-reply` / `resolve-thread-batch` share canonical
    resolution modes: `fixed`, `pre_existing`, `explained`, and
    provenance-validated `planned` follow-up.
- **Replies / comments / reactions**: `reply-to-review`,
  `reply-to-discussion`

## Cutover and fallback retirement playbook

Retire fallback behavior one operation at a time. Before removing any Python
fallback route, require TypeScript tests or fixtures for success, negative,
validation, `--format json` envelope behavior, and any schema output that remains
part of the public contract. For live-effect operations, fake-backed gateway
tests must prove the mutation plan and result shape without writing to GitHub.
Payload-shape-sensitive helpers need golden or parity fixtures.

The distribution decision is recorded: `pr-address` is a machine-level PATH
shim over checkout sources, and `@asdl/pr-address` is not published to npm.
Manual `uvx --from asdl-pr-address==<pin> pr-address` remains the rollback path
to the published PyPI release. Do not broadly delete this package, and do not
replace the Python `asdl pr-address ...` plugin until TypeScript plugin wiring
is proven non-breaking for existing `asdl` users.

## Relationship to the `pr-address` skill

- The skill (`skills/pr-address/SKILL.md`) provides LLM-driven
  classification, batching, and orchestration.
- This package provides deterministic, testable operations that the skill
  invokes.
- The skill never pushes; this package never pushes.

## See also

- Skill source: `skills/pr-address/SKILL.md`
- clinkr (the dual-mode CLI framework used by every operation):
  `packages/asdl-core/src/asdl_core/clinkr/README.md`
