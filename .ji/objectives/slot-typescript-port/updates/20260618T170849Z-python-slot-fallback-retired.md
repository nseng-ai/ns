# Python Slot Fallback Retired

## Summary

Retired the dormant Python `asdl-slots` fallback. The repository now presents the TypeScript `@asdl/slot` standalone CLI as the only active `slot` implementation.

Rollback reference before deletion: `9164ef9ea562`.

Prerequisite evidence inspected before deletion:

- `.asdl/objectives/slot-typescript-port/roadmap.md` already marked the command-surface, OS-coupled shell/completion, public docs/distribution cutover, and hidden `slot gt exec stack-map-branches` rows complete.
- `updates/20260618T112132Z-slot-shell-parity-distribution-cutover.md` records real-shell parity, TypeScript source-shim distribution, Python active-surface removal, and full `just check` validation.
- `updates/20260618T125016Z-stack-map-branches-typescript-port.md` records the hidden `slot gt exec stack-map-branches` TypeScript port and live consumer evidence.

## Objective Impact

- Deleted `packages/asdl-slots/`, including the dormant Python source, tests, README, and package-local configuration.
- Removed the stale root Ruff exclude for `packages/asdl-slots/` from `pyproject.toml`.
- Updated active user docs under `docs-site/` to direct users to the TypeScript source-shim install model (`just install-slot`, with `just ts-install` or `pnpm --dir ts install` when dependencies are missing) instead of `uv tool install asdl-slots` or `asdl slot`.
- Updated `ts/packages/slot/README.md` to remove dormant Python fallback references while retaining the standalone-only / no TypeScript `asdl.plugins` boundary.
- Updated `docs/vcs-evaluation-jujutsu.md` to describe the current TypeScript `slot` internals instead of the retired Python package path.
- Updated `tests/scenario/test_plugins.py` so the wrong-shape plugin discovery test still uses a loadable non-plugin target (`click:Group`) without importing the retired package.
- Updated the root agent scenario-test example from the retired package path to an active Python package path.
- Marked the fallback-retirement roadmap row complete.

Validation run for this update:

- `uv lock --check`: pass.
- `just python-check`: pass.
- `just python-test`: pass, 795 tests.
- `just dprint-check`: pass.
- `just docs-check`: pass, Astro reported 0 errors / 0 warnings / 0 hints.
- `just check`: pass, including agent-instructions check, Ruff, ty, dprint, TypeScript check/test (265 files / 2718 tests), and Python tests (795 tests).

Retained references:

- Historical Objective/prework/inventory/update files still mention `packages/asdl-slots`, `asdl_slots`, or `asdl slot` as provenance for the port. They were intentionally left unchanged.
- `CONTEXT-MAP.md` still contains `packages/asdl-slots` domain-language entries. Per repository domain-language rules, this was not edited incidentally; it should be handled by a focused context rebaseline if desired.

## Follow-Ups

- The next open `slot-typescript-port` Objective row is to feed lessons into the umbrella porting playbook and reconcile the migration ledger.
- Consider a focused domain-language rebaseline for `CONTEXT-MAP.md` / any slot `CONTEXT.md` references now that the Python fallback directory is deleted.
