# asdl-core Graphite Metadata Reader Disposed

## Summary

The Graphite remainder of the `asdl-core` domain output converters/readers roadmap row is now represented as landed Objective state. Graphite SQLite metadata-store reading moved out of `asdl_core.gt.real_gateway` into the focused reader module `asdl_core.gt.metadata_reader`.

`RealGtGateway` now keeps subprocess-backed `gt` operations plus git common-dir/current-branch probing local to the real adapter, then delegates metadata DB stack conversion to `read_stack_from_metadata_db`. The reader owns named-column schema validation, row normalization, malformed children metadata warnings, ancestor and first-child descendant walks, Graphite trunk-marker warnings, and conversion to `StackInfo`, `UntrackedBranch`, or `GtCommandFailure`.

## Files Changed

- `packages/asdl-core/src/asdl_core/gt/metadata_reader.py` adds the focused metadata-store reader.
- `packages/asdl-core/src/asdl_core/gt/real_gateway.py` delegates `stack()` metadata reading and sheds SQLite/JSON graph-walk helpers.
- `packages/asdl-core/tests/unit/test_gt_metadata_reader.py` adds pure reader coverage for schema, stack graph, warnings, malformed metadata, and failure behavior.
- `packages/asdl-core/tests/gateways/test_real_gt_gateway.py` now focuses Graphite stack coverage on git probing, missing metadata path wiring, and subprocess/failure adapter boundaries.
- `.asdl/objectives/architecture-deepening-priority-roadmap/roadmap.md` marks the `asdl-core` converter/readers row complete.

## Validation

Passed:

- `uv run pytest packages/asdl-core/tests/unit/test_gt_metadata_reader.py packages/asdl-core/tests/gateways/test_real_gt_gateway.py -q`
- `uv run pytest packages/asdl-core/tests/gateways/test_gt_construction.py packages/asdl-core/tests/gateways/test_fake_gt_gateway.py packages/asdl-core/tests/unit/test_gt_types.py -q`
- `uv run pytest packages/asdl-core/tests -q`
- Python portions of `just`: `ruff check`, `ruff format --check`, `dprint check`, and `ty check`
- Review-only dignified-Python subagent reported no actionable findings.

Full `just` still fails in unrelated TypeScript package `ts/packages/ccc/src/worktree-status.ts` with pre-existing `TS18048: 'result.stdout' is possibly 'undefined'` errors.

## Objective Impact

The roadmap row **Add domain output converters/readers for `asdl-core` real adapters** moves to `[x]`. Git output conversion, GitHub response mapping, and Graphite metadata reading now each have domain-specific conversion/reader locality and focused tests without introducing a generic parser dumping ground.

The next active roadmap row is **Deepen `asdl-pr-address` feedback snapshot and prepare-run policy**.
