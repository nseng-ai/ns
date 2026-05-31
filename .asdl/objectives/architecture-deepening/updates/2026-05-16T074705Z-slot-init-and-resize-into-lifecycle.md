# Semantic Update: Move `slot init` and `slot resize` orchestration into `lifecycle`

## Summary

The `slot init` and `slot resize` orchestration was lifted out of the CLI and into `asdl_slots.lifecycle`. Two new semantic entry points now exist: `initialize_pool(slots_ctx, target_size)` and `resize_pool(slots_ctx, target_size)`. Both own the full sequence — size validation → `build_slot_inventory` → invariant check → `ensure_slots_metadata_dir` → `build_init_plan` / `build_resize_plan` → execute via `add_detached_worktree` / `remove_worktree` — and return a `SlotInitOutcome | SlotLifecycleFailure` or `SlotResizeOutcome | SlotLifecycleFailure` discriminated union. The shared `SlotLifecycleFailure(error_type, message)` introduced for `checkout` was reused unchanged for the new `invalid_size`, `pool_already_initialized`, and `resize_unsafe` variants.

`cli/slot/init.py` dropped from 88 → ~70 lines and `cli/slot/resize.py` from 138 → ~88 lines. Both are now translation/rendering shells: parse Click params, `Ensure.fail` on `NoRepoSentinel`, dispatch to the lifecycle entry point, translate the union into either a rendered result model or a `ClinkrExit.failure(...)`. The local `_validate_removals` helper that previously lived in `cli/slot/resize.py` moved into `lifecycle.py` as a private helper, where it now sits next to the only caller that needs it.

The unit tests in `tests/unit/test_lifecycle.py` grew with 12 new cases covering `initialize_pool` (happy path with metadata-dir ensure, `pool_already_initialized`, `invalid_size` below min and above max) and `resize_pool` (grow-from-empty, no-op at target, shrink removes highest unassigned, `resize_unsafe` for assigned slots and for dirty slots, assigned-priority-over-dirty, `invalid_size` below min and above max). All 29 existing scenario tests in `tests/scenario/test_slot_init_cli.py` and `tests/scenario/test_slot_resize_cli.py` pass without modification — the byte-identical-CLI invariant held. The `_lifecycle_context` fixture grew one optional kwarg (`file_status_by_path`) to support the dirty-slot scenarios; no other test infrastructure changes were needed.

## Objective Impact

Continued progress on the **Consolidate asdl-slots slot lifecycle** roadmap row, still `[~]`. The deletion test held for both ops: `cli/slot/init.py` and `cli/slot/resize.py` no longer import `build_slot_inventory`, `build_init_plan`, `build_resize_plan`, `ensure_slots_metadata_dir`, `generate_slot_name`, `SlotRecord`, or the `MIN_POOL_SIZE` / `MAX_POOL_SIZE` constants. Lifecycle is now the sole module that reaches into the pure-data planners — exactly the shape the roadmap row predicted ("intermediate dataclasses become implementation details"). The intentional invariant on close — every slot CLI op should look like `slot checkout` post-refactor — now holds for `checkout`, `init`, and `resize`.

Completed-PR free, selected-slot free, and `list` still call `build_slot_inventory` / `ensure_slots_metadata_dir` directly from their CLI ops. They remain to be migrated before the row can be marked shipped. The `SlotLifecycleFailure(error_type, message)` shape has now absorbed three operations' worth of failure variants without growing or sprouting subclasses, which is a positive signal for the union's stability — both free paths can fold in without redesigning it.

The open-list rule for `list` remains undecided: it does not mutate, so the deletion-test signal there is weaker. Defer the decision until `gc` and `free` settle; if both produce lifecycle-shaped operations that naturally also expose pool-state queries, fold `list` in then.

## Follow-Ups

- Migrate `slot free` next: it sits between `init`/`resize` in complexity (single-slot mutation, no planner) but shares the inventory-build + invariant-check + git-mutation shape. Likely lifecycle entry point: `free_slot(slots_ctx, slot_name_or_branch)` returning `SlotFreeOutcome | SlotLifecycleFailure`.
- Migrate completed-PR free after selected-slot free: it has the richest CLI shape (multi-record sweep with selection predicates) and will probably surface the first `SlotLifecycleFailure` variants that don't fit cleanly under the current shape — that's the moment to decide whether the union grows fields, splits per-op, or both.
- Decide whether `slot list` joins the migration or stays as a thin inventory read once both free paths land. Record the rationale either way so the row can close.
- After all CLI ops migrate, revisit whether `checkout_planning.py` and `inventory.py` should be folded into `lifecycle` as private modules or stay as separate pure-data files that only lifecycle imports.
