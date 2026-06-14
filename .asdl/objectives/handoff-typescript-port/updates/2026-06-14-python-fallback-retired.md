# Python Fallback and Plugin Path Retired

## Summary

Retired the historical Python `asdl-handoff` fallback package and removed the old `asdl handoff` plugin path from active workspace, config, tests, publish, and context inventory. The durable public surface is now the standalone TypeScript-backed `handoff` command; create and pickup remain Pi/skill workflows.

Rollback/reference commit recorded before deletion: `c7953b640c94fad4182df35c277fe19dfbe5eca7`.

Fresh inventory before deletion found no active user-facing `asdl handoff` instructions. The only match was the TypeScript shim comment in `ts/packages/handoff/scripts/handoff-shim`:

```bash
rg -n "\basdl handoff\b" README.md docs src packages ts .agents skills tests justfile pyproject.toml CONTEXT-MAP.md
# ts/packages/handoff/scripts/handoff-shim:2:# handoff — runs the asdl handoff TypeScript CLI from source.
```

Deletion/config/test changes:

- Deleted `packages/asdl-handoff/**`.
- Removed `asdl-handoff` from root `pyproject.toml` workspace members, sources, optional plugin dependencies, dev dependencies, Ruff source paths, Ruff first-party names, and pytest testpaths.
- Regenerated `uv.lock`, removing the `asdl-handoff` package and dependency entries.
- Removed `--package asdl-handoff` from the root `justfile` publish recipe while preserving the TypeScript `install-handoff` shim recipe.
- Removed handoff-specific plugin smoke imports/tests from `tests/scenario/test_plugins.py`, leaving unrelated plugin discovery coverage intact.
- Removed the historical Python handoff context entry from `CONTEXT-MAP.md` and adjusted directly stale Python workspace/context counts.

Post-deletion inventory for active paths is empty:

```bash
rg -n "asdl-handoff|asdl_handoff|packages/asdl-handoff" pyproject.toml justfile tests src packages ts CONTEXT-MAP.md uv.lock || true
# no output
```

Focused validation passed:

```bash
uv lock --check
uv run pytest tests/scenario/test_plugins.py
pnpm --dir ts/packages/handoff run check
pnpm --dir ts/packages/handoff run test
just install-handoff
handoff --runtime
handoff list --format json
```

`handoff --runtime` reports `runtime: typescript` with entry point `@asdl/handoff bin handoff -> ts/packages/handoff/src/cli.ts`; `handoff list --format json` returns a successful JSON machine envelope.

Broad validation passed after this Objective update. The first `just` run failed only on a dprint formatting check in `docs/pi/README.md`; per repo policy, `just dprint-fix` formatted that file and the rerun passed:

```bash
just dprint-fix
just
```

Final `just` evidence included root agent-instruction test, Ruff check/format check, ty check, dprint check, TypeScript workspace check/test (`191` Vitest files, `2242` tests), and Python pytest excluding integration (`1912` tests).

An SDL checkpoint captured the coherent deletion slice: `ef480bd01 [cp] Remove asdl-handoff workspace package`.

## Objective Impact

The roadmap row “Retire the Python fallback and remove the `asdl handoff` plugin path” is complete. The Python package/plugin fallback is no longer an active workspace/package/test/publish path, and the standalone `handoff` command remains TypeScript-backed.

The Objective remains open. The next row is to feed lessons and completion evidence into the umbrella TypeScript migration Objective and close this child Objective when ready; that umbrella update is intentionally out of scope for this deletion slice.

## Follow-Ups

- Run final broad validation after this Semantic Update and roadmap edit.
- Feed Handoff lessons into `.asdl/objectives/port-asdl-toolkit-to-typescript/` in the next explicit slice.
