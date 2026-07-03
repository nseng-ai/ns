# asdl-core Graphite Construction Context Localized

## Summary

Added `asdl_core.gt.construction.build_gt_gateway` as the canonical production construction surface for shared Graphite gateway consumers. The builder preserves existing lazy Graphite behavior by constructing `RealGtGateway` without eager `gt`, `git`, or metadata checks, so existing operation-time `GtCommandFailure`, `UntrackedBranch`, and domain result behavior remains owned by `GtGateway` operations.

The explicit Graphite-named `slot gt` production context now uses the shared construction path instead of directly constructing `RealGtGateway`. Generic `asdl-slots` context construction remains Graphite-free; Graphite runtime dependency construction stays behind the opt-in `slot gt` command contract.

Direct real-adapter references remain in the adapter implementation, real gateway tests, and construction tests where naming `RealGtGateway` is intentional.

Validation evidence:

- `uv run pytest packages/asdl-core/tests/gateways/test_gt_construction.py -q`
- `uv run pytest packages/asdl-core/tests/gateways/test_real_gt_gateway.py -q`
- `uv run pytest packages/asdl-core/tests/gateways/test_fake_gt_gateway.py -q`
- `uv run pytest packages/asdl-slots/tests/scenario/test_slot_gt_cli.py -q`
- `uv run pytest packages/asdl-slots/tests/scenario/test_slot_gt_free_stack_cli.py -q`
- `uv run pytest packages/asdl-core/tests -q`
- `uv run pytest packages/asdl-slots/tests -q`
- `just`

## Objective Impact

The roadmap row **Localize `asdl-core` production gateway construction** remains `[~]`. This branch completes the Graphite construction-locality slice for the current production `GtGateway` consumer while preserving the runtime Graphite dependency boundary.

The row remains partial because command-specific treatment of intentionally deferred direct `RealGitGateway()` construction in `aretro` and `asdl-pr-address` is still out of scope.

## Follow-Ups

- Revisit deferred direct `RealGitGateway()` construction in `aretro` and `asdl-pr-address` with command-specific context loading rather than forcing repo-required construction onto operations that should not need it.
