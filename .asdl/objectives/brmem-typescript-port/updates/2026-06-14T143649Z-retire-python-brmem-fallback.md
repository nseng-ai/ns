# Retired Python brmem fallback and deleted active package

Completed the retirement row for the `brmem` TypeScript port.

## What changed

- Deleted the legacy Python `packages/brmem` package from active source paths.
- Removed Python `brmem` from the root uv workspace, source table, dev dependencies, Ruff source/first-party configuration, pytest test paths, `packages/asdl-handoff` dependencies, and the publish package list.
- Regenerated `uv.lock`; the editable Python `brmem` package is no longer present.
- Deleted `ts/packages/brmem/test/gateways/python-parity.test.ts`, retiring the Python parity oracle after the TypeScript implementation had already proven storage parity.
- Removed the temporary `setup-python-uv` step from the TypeScript CI job; the TypeScript job no longer installs Python/uv solely for brmem parity tests.
- Moved active Branch Memory domain vocabulary from `packages/brmem/CONTEXT.md` to `ts/packages/brmem/CONTEXT.md` and updated `CONTEXT-MAP.md` plus active docs to point at the TypeScript package.
- Updated `ts/packages/brmem/README.md` and `skills/brmem/SKILL.md` so active docs no longer describe a retained Python fallback.
- Decoupled `asdl-handoff` from the deleted Python library by adding a handoff-owned Branch Memory seam over the public `brmem` CLI, with a package-local fake for tests.
- Preserved handoff per-Entry `updated_at` sorting by using direct read-only git plumbing (`git cat-file -e` and `git log -1 --format=%cI <snapshot-ref> -- <key>`) only inside the handoff adapter, because public `brmem check` exposes Snapshot head date rather than per-Entry change date.
- Made the handoff adapter ignore stale `.venv/bin/brmem` scripts when resolving the public `brmem` command. This matters under `uv run --project`, which prepends the repo venv and can otherwise shadow the TypeScript shim with a deleted Python console script.

## Rollback/reference

The rollback/reference source for the deleted Python package is in-repo git history at commit `44c3e9992b424c4b174ccaeb9f4567bb8f611dc1` (`Cut public brmem over to the TypeScript source shim`), the last known commit containing `packages/brmem` before this deletion. No external frozen artifact was needed.

## Validation evidence

Focused and final validation passed:

```text
uv lock --check
uv run pytest packages/asdl-handoff/tests tests/scenario/test_plugins.py -q
uv run ruff check packages/asdl-handoff tests/scenario/test_plugins.py
uv run ty check packages/asdl-handoff/src
pnpm --dir ts/packages/brmem run check
pnpm --dir ts/packages/brmem run test
pnpm --dir ts run check
pnpm --dir ts run test
just
```

Observed final `just` result: `1907 passed` Python tests, all Ruff/format/ty/dprint gates passed, and TypeScript workspace check/test passed (`181` TS test files, `2179` tests).

Real shim-backed handoff smoke passed against a throwaway git repo and temporary rendered TypeScript `brmem` shim:

- `brmem put resume-smoke.md --namespace handoff --branch feat/handoff --stdin` stored the handoff Entry.
- `uv run --project <repo> handoff list --all --format json` saw slug `resume-smoke` with Entry Locator `refs/brmem/ns/handoff/feat---handoff:resume-smoke.md`.
- `uv run --project <repo> handoff delete resume-smoke --branch feat/handoff --force --format json` deleted it and returned a commit.
- `uv run --project <repo> handoff gc --dry-run --format json` succeeded with no remaining candidates.

Public shim runtime smoke passed via a temporary rendered shim:

```text
runtime: typescript
entry_point: @asdl/brmem bin brmem -> ts/packages/brmem/src/cli.ts
```

## Follow-up left parked

Native-library rewiring for TypeScript consumers remains parked; existing TypeScript consumers continue to shell out to PATH `brmem` through the public TypeScript shim. Shared git ref/blob/tree gateway extraction also remains parked until a second consumer proves the seam.
