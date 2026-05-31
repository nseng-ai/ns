# Semantic Update: Move completed-PR free into lifecycle

## Summary

The completed-PR slot free sweep moved into `asdl_slots.lifecycle`. Lifecycle now owns the completed-PR free plan/execute split through `plan_completed_pr_free`, `execute_completed_pr_free_plan`, `outcome_from_completed_pr_free_plan`, and the combined `free_completed_pr_slots` helper. The old standalone orchestration module was deleted, and the CLI no longer imports sweep orchestration or inventory directly.

The command-line surface remains responsible for CLI-only concerns: loading context, handling `--dry-run` / confirmation-skip flags, rendering previews/results, and interactive confirmation. Unit coverage for the completed-PR free sweep moved into `tests/unit/test_lifecycle.py`; scenario coverage remains black-box in `tests/scenario/test_slot_free_completed_pr_cli.py`.

## Objective Impact

This ships the **Consolidate asdl-slots slot lifecycle** roadmap row. The mutating slot workflows now route through lifecycle semantic entry points: checkout, init, resize, selected-slot free, and completed-PR free. The deletion test held for completed-PR free: deleting the old standalone orchestration left the CLI as a translation/rendering shell while lifecycle owns inventory classification, PR lookup handling, dirty-worktree skips, and detach execution.

Decision recorded: `slot list` and `slot goto` remain thin read-only inventory operations rather than lifecycle APIs. Their deletion-test signal is weaker than the mutating workflows, and adding lifecycle query helpers now would create an interface without enough leverage. Selector-specific inventory reads in `slot free` also remain CLI/Graphite selection seams unless a future query abstraction gets a second real caller.

## Follow-Ups

- No immediate follow-up for the asdl-slots lifecycle row; it is now shipped.
- If future slot commands need shared read/query behavior with more than one caller, revisit a lifecycle query API then rather than pre-emptively adding one now.
