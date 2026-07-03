# Semantic Update: Move `slot free` mutation into `lifecycle`

## Summary

The `slot free` detachment workflow was lifted into `asdl_slots.lifecycle.free_slots`. The lifecycle entry point now owns the state validation and mutation path for freeing one or more slots: build the current inventory, combine selector preflight errors with assigned/clean checks, choose trunk, detach each selected worktree to trunk, and return `SlotFreeOutcome | SlotLifecycleFailure`. It also handles mid-loop state changes and git failures with partial-failure messages that name already-freed slots.

`cli/slot/free.py` now resolves user selectors and renders results, then delegates the actual freeing to `free_slots`. `cli/slot/gt/free_stack.py` also delegates stack-derived slot releases to the same lifecycle entry point, passing the Graphite trunk explicitly so the operation does not rediscover it through plain git. Both wrappers still perform their own inventory reads for selector or stack branch matching; that is CLI/Graphite-specific selection work rather than the slot mutation itself.

Unit coverage in `tests/unit/test_lifecycle.py` now covers empty no-op, single-slot detach, ordered batch detach, unassigned and dirty targets, combined selector preflight plus state errors, and mid-loop detach failures that report partial completion.

## Objective Impact

Continued progress on the **Consolidate asdl-slots slot lifecycle** roadmap row, still `[~]`. The deletion test held for the mutating part of `free`: direct detach orchestration left the CLI layer and became one lifecycle operation with the same `Slot<Op>Outcome | SlotLifecycleFailure` shape used by checkout/init/resize. The roadmap status was updated to include `free` among the consolidated operations.

The row is not complete yet. `slot gc` remains the remaining mutating command with direct inventory-driven orchestration outside lifecycle. `slot goto` and `slot list` still read inventory directly, but their read-only shape continues to make the deletion-test signal weaker than for mutating operations. `slot free` also intentionally keeps selector-specific inventory reads in the CLI and Graphite wrappers; that should be revisited only if the post-`gc` lifecycle surface suggests a cleaner read/query boundary.

## Follow-Ups

- Migrate `slot gc` next. It is now the last clearly mutating slot operation outside lifecycle and should exercise whether `SlotLifecycleFailure(error_type, message)` remains sufficient for multi-record sweep behavior.
- After `gc`, decide explicitly whether `slot list` and `slot goto` belong in lifecycle or should remain thin inventory reads, and record the rationale so this roadmap row can close.
- Revisit whether selector/stack inventory reads in `slot free` are acceptable CLI-specific selection seams or should move behind a lifecycle query helper once the `gc` shape is known.
