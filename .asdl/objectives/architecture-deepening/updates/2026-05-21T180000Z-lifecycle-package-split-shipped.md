# Semantic Update: Split `asdl_slots/lifecycle.py` into a `lifecycle/` package

## Summary

The first Round 2 candidate is shipped. The single 719-line `asdl_slots/lifecycle.py` module is replaced by a five-file `asdl_slots.lifecycle/` package:

- `lifecycle/outcomes.py` — shared dataclasses (`SlotCheckoutOutcome`, `SlotInitOutcome`, `SlotResizeOutcome`, `SlotFreeOutcome`, `SlotCompletedPrFreeOutcome`, `SlotCompletedPrFreePlan`, `SlotCompletedPrFreeEntry`, `SlotCompletedPrFreeAction`, `SlotLifecycleFailure`, `FreedSlot`).
- `lifecycle/pool.py` — `initialize_pool`, `resize_pool`, `build_init_plan`, `build_resize_plan`, the `MIN_POOL_SIZE` / `MAX_POOL_SIZE` constants, and the `InitPlan` / `ResizePlan` plan dataclasses.
- `lifecycle/checkout.py` — `checkout_branch`, `checkout_current`, the `ExecutableCheckoutPlan` union, and the private plan executor.
- `lifecycle/free.py` — `free_slots` and its private validators.
- `lifecycle/completed_pr_free.py` — `plan_completed_pr_free`, `execute_completed_pr_free_plan`, `outcome_from_completed_pr_free_plan`, `free_completed_pr_slots`, and private completed-PR free helpers.

The contract did not change: every public function returns the same `Slot<Op>Outcome | SlotLifecycleFailure` shape it did before, and the CLI handlers in `cli/slot/{checkout,free,init,resize}.py` plus `cli/slot/gt/free_stack.py` still call those entry points unchanged in behavior. Imports were rewritten to read from the canonical submodule (per the repo's no-re-exports rule); completed-PR free remains reachable through `slot free` rather than a separate command module.

No private helper was used across more than one submodule, so no `_shared.py` was needed: each operation's helpers move with that operation.

## Objective Impact

This completes the first **Round 2** roadmap row. The deletion test held: removing any submodule's responsibilities (pool, checkout, selected-slot free, completed-PR free) leaves a hole in the lifecycle state machine. The split is a directory-level mirror of the operation boundary that already existed inside the single file; it does not introduce a new seam, only a comfortable navigation boundary.

`tests/unit/test_lifecycle.py` remains a single file with updated imports. Splitting it across `tests/unit/lifecycle/test_{pool,checkout,free,completed_pr_free}.py` would require introducing a `conftest.py` with fixture-converted helpers (`_record`, `_inventory`, `_lifecycle_context`); that test-architecture change is intentionally out of scope here and can be revisited as a follow-up if the consolidated test file becomes hard to navigate.

## Follow-Ups

- Optional: convert the shared test helpers into pytest fixtures in `tests/unit/lifecycle/conftest.py` and split `test_lifecycle.py` along the same submodule boundaries.
- If a new lifecycle operation is added, place it in its own submodule (e.g., `lifecycle/<op>.py`) rather than appending to an existing one; introduce `lifecycle/_shared.py` only when the same helper is used by 2+ submodules.
