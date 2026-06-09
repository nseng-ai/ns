# asdl-pr-address development notes

Developer-facing implementation details for the `asdl-pr-address` package.

## Runtime dispatch

The installed skill ships a wrapper at `<skill-dir>/scripts/pr-address-run`
that selects how `pr-address` runs. `<skill-dir>` is the directory containing
the installed `SKILL.md`; common locations are `skills/pr-address/` in a repo
checkout and `.agents/skills/pr-address/` in an installed skill mirror.

- inside an asdl checkout with `ts/packages/pr-address/src/cli.ts` → the local
  TypeScript sources run by default
- outside a checkout → the wrapper runs the checked-in self-contained bundle
  shipped next to it (`<skill-dir>/scripts/pr-address.bundle.mjs`) with plain
  `node` (Node 24+); no PyPI or npm install happens
- the remaining legacy-Python fallback (a small set of usage-error envelope
  shapes) delegates to the local Python CLI in a checkout, or to the pinned
  PyPI release via `uvx` otherwise

Override when you want to force a specific path:

- `ASDL_PR_ADDRESS_MODE=local` or `ts-local` forces the local TypeScript
  sources.
- `ASDL_PR_ADDRESS_MODE=prod` forces the bundled artifact.
- `ASDL_PR_ADDRESS_MODE=python-local` forces the local legacy Python CLI for
  debugging and compatibility checks.
- `ASDL_PR_ADDRESS_MODE=legacy-python` is the rollback mode: it runs the pinned
  published release via `uvx --from asdl-pr-address==<pin>`.

## Updating the prod bundle and the rollback pin

Installed/prod behavior ships as a checked-in bundle. After changing
`ts/packages/pr-address` sources, regenerate it and commit the result:

```bash
just bundle-pr-address
# or: pnpm --dir ts/packages/pr-address run bundle
```

A freshness test (`ts/packages/pr-address/test/wrapper/pr-address-bundle.test.ts`)
fails CI when the checked-in bundle is stale.

To move the legacy Python rollback pin, publish the new `asdl-pr-address`
release to PyPI first, then bump `ASDL_LEGACY_PYTHON_VERSION` in
`skills/pr-address/scripts/pr-address-run` and `LEGACY_PR_ADDRESS_VERSION` in
`ts/packages/pr-address/src/legacy-python.ts` (they must stay in sync), and
regenerate the bundle. The pin must reference a release that actually exists on
PyPI; the original `0.1.0` pin never did.

## Local development

For working on this package itself:

```bash
git clone https://github.com/dagster-io/asdl
cd asdl
uv sync
```

The wrapper auto-detects the checkout and runs the TypeScript sources by
default. Edits to `packages/asdl-pr-address/` are only reached through the
remaining usage-error fallback; force the Python CLI explicitly with
`ASDL_PR_ADDRESS_MODE=python-local` when debugging wrapper dispatch. To run tests
for just this package:

```bash
uv run pytest packages/asdl-pr-address
```

Or run the full suite from the repo root with `just`.

## Operation inventory

This Python package remains the compatibility implementation for the explicit
`python-local` / `legacy-python` rollback modes and a small set of usage-error
envelope shapes. The `asdl pr-address ...` plugin is retired; the standalone
`pr-address` CLI is the only invocation surface. Treat the public
skill, `skills/pr-address/references/cli-reference.md`, source registration,
scenario tests, and golden fixtures as stronger contract sources than this
developer overview when porting behavior.

### Current TypeScript-managed execution

Every `pr-address exec ...` operation and every operation `--json-schema` route
is TypeScript-managed, in both local-checkout and bundled prod invocation.

### Compatibility-backed behavior still required

Keep Python fallback for:

- invalid `--payload-mode` values for `get-feedback` and `prepare-run`, invalid
  `--stdout-mode` values for `stack-feedback-prep` and `stack-feedback-plan`,
  and non-integer `--body-chars` values for `summarize-feedback` (click
  usage-error rendering)

The current legacy operation set, by category:

- **Feedback fetch / composite**: `get-feedback`, `summarize-feedback`,
  `prepare-run`, `get-pr-for-branch`, `get-reviews`,
  `get-review-comments`, `get-discussion-comments`
- **Classification / payload ergonomics**: `read-feedback-detail`,
  `read-feedback-details`, `classification-template`,
  `validate-feedback-classification`, `plan-feedback`
- **Batch / finalization**: `build-resolve-thread-batch-payload`,
  `record-batch-checkpoint`, `finalize-run`
- **Stack feedback**: `stack-feedback-prep`, `stack-feedback-plan`,
  `stack-feedback-diff-current`, `build-stack-resolve-thread-payloads`
- **Thread mutations**: `resolve-thread`, `resolve-thread-with-reply`,
  `resolve-thread-batch`, `unresolve-thread`, `add-review-thread-reply`
  - `resolve-thread-with-reply` / `resolve-thread-batch` share canonical
    resolution modes: `fixed`, `pre_existing`, `explained`, and
    provenance-validated `planned` follow-up.
- **Replies / comments / reactions**: `reply-to-review`,
  `reply-to-discussion`, `add-issue-comment`, `add-reaction`

## Cutover and fallback retirement playbook

Retire fallback behavior one operation at a time. Before removing any Python
fallback route, require TypeScript tests or fixtures for success, negative,
validation, `--format json` envelope behavior, and any schema output that remains
part of the public contract. For live-effect operations, fake-backed gateway
tests must prove the mutation plan and result shape without writing to GitHub.
Payload-shape-sensitive helpers need golden or parity fixtures.

The distribution decision is recorded: installed/prod skill invocation executes
the checked-in bundle shipped inside the skill, and `@asdl/pr-address` is not
published to npm. `ASDL_PR_ADDRESS_MODE=legacy-python` remains the rollback path
to the published PyPI release. The `asdl pr-address ...` plugin is retired
outright (not shimmed or ported); the standalone `pr-address` CLI is the only
invocation surface. Do not broadly delete this package while the rollback modes
and remaining usage-error fallback still depend on it.

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
