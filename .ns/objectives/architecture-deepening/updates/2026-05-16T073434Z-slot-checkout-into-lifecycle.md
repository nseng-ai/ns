# Semantic Update: Move `slot checkout` orchestration into `lifecycle`

## Summary

The `slot checkout` orchestration was lifted out of the CLI and into `asdl_slots.lifecycle`. Two semantic entry points now exist: `checkout_branch(slots_ctx, branch_name, *, new_branch, base)` and `checkout_current(slots_ctx)`. Both own the full sequence — `ensure_slots_metadata_dir` → `build_slot_inventory` → `plan_checkout` / `plan_current_checkout` → execute — and return a `SlotCheckoutOutcome | SlotLifecycleFailure` discriminated union. `cli/slot/checkout.py` dropped to a translation/rendering shell: it parses Click params, dispatches to one of the two lifecycle entry points, and translates the union into either a rendered `SlotCheckoutResult` or a `ClinkrExit.failure(...)`. The local `_ExecutedCheckout`, `_pool_full_failure`, and `_execute_plan` helpers that previously lived in the CLI module are gone; their behavior is internal to lifecycle.

`checkout_planning.py` survives unchanged as a pure-data module producing `ReuseAssignment | BranchInMainWorktree | AssignToSlot | PoolFull` and the `CurrentCheckoutPlan` triage values. It is no longer imported by any CLI op — only by `lifecycle` — which is the shape the roadmap row predicted ("intermediate dataclasses become implementation details").

The unit tests in `tests/unit/test_lifecycle.py` were extended with checkout flows: pool-full failures, branch-creation paths, base-missing / branch-missing / branch-exists guards, detached-HEAD and dirty-worktree triage, reuse and main-worktree assignments, and the `--current` flow.

## Objective Impact

Partial progress on the **Consolidate asdl-slots slot lifecycle** roadmap row. Marked `[~]` with a status note. The deletion test held for `checkout`: the CLI orchestrator collapsed, the planning module is now reached only through one caller, and the cross-module invariants ("ensure metadata dir before inventory, plan before mutate, return a sum type the CLI can render") finally live in one place.

`init`, `resize`, `free`, `gc`, and `list` still import `build_slot_inventory` / `ensure_slots_metadata_dir` (and `build_init_plan` / `build_resize_plan` for the planners) from their CLI ops. They remain to be migrated before this row can be marked shipped. The intentional shape on close: every slot CLI op should look like `slot checkout` post-refactor — a thin translation layer over a semantic operation on `lifecycle`.

The roadmap row description named the four semantic operations (`checkout`, `init`, `resize`, `gc`); the open list rule allows surfacing `free` and `list` as adjacent shallowness if their CLI orchestrators turn out to share the same shape. Decide on inclusion when migrating them rather than pre-emptively expanding the row.

## Follow-Ups

- Migrate `slot init` and `slot resize` next: they already call `build_init_plan` / `build_resize_plan` plus an inventory build, so the lifecycle entry points should be straightforward (`initialize_pool(slots_ctx, size)` / `resize_pool(slots_ctx, size)`).
- Migrate `slot gc` and `slot free` once init/resize land; their interaction with `SlotInventory` is heavier and may produce richer `SlotLifecycleFailure` variants worth getting right after the simpler ops settle the union shape.
- Decide whether `slot list` belongs in the lifecycle migration or stays as a thin inventory read. It does not mutate; the deletion test there is weaker.
- After all CLI ops migrate, revisit whether `checkout_planning.py` and `inventory.py` should be folded into `lifecycle` as private modules or stay as separate pure-data files that only lifecycle imports.
