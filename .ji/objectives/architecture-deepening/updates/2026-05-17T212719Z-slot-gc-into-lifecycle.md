# Semantic Update: Move `slot gc` into lifecycle

## Summary

The `slot gc` sweep moved into `asdl_slots.lifecycle`. Lifecycle now owns the GC plan/execute split through `plan_gc`, `execute_gc_plan`, `outcome_from_gc_plan`, and the combined `garbage_collect_slots` helper. The old standalone `asdl_slots.gc` module was deleted, and the CLI no longer imports GC orchestration or inventory directly.

The `slot gc` CLI remains responsible for CLI-only concerns: loading context, validating `--dry-run` / `--force`, rendering previews/results, and interactive confirmation. Unit coverage for GC moved into `tests/unit/test_lifecycle.py`; scenario coverage remains black-box in `tests/scenario/test_slot_gc_cli.py`.

## Objective Impact

This ships the **Consolidate asdl-slots slot lifecycle** roadmap row. The mutating slot workflows now route through lifecycle semantic entry points: checkout, init, resize, free, and gc. The deletion test held for `gc`: deleting the old module left the CLI as a translation/rendering shell while lifecycle owns inventory classification, PR lookup handling, dirty-worktree skips, and detach execution.

Decision recorded: `slot list` and `slot goto` remain thin read-only inventory operations rather than lifecycle APIs. Their deletion-test signal is weaker than the mutating workflows, and adding lifecycle query helpers now would create an interface without enough leverage. Selector-specific inventory reads in `slot free` also remain CLI/Graphite selection seams unless a future query abstraction gets a second real caller.

## Follow-Ups

- No immediate follow-up for the asdl-slots lifecycle row; it is now shipped.
- If future slot commands need shared read/query behavior with more than one caller, revisit a lifecycle query API then rather than pre-emptively adding one now.
