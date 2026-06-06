# asdl-slots Release Workflow Deepened

## Summary

Added `asdl_slots.lifecycle.release` as the release-focused lifecycle module for `slot free` and `slot gc` orchestration. Cleanup policy, PR lookup handling, local branch cleanup decisions, explicit free planning/execution, GC classification/execution, cleanup result attachment, cleanup error counting, and partial failure behavior now live in the lifecycle release module instead of being split across free/gc modules.

The existing `lifecycle/free.py` and `lifecycle/gc.py` public functions remain as compatibility wrappers, while the `slot free` and `slot gc` CLI modules import the presentation-free release interface directly. CLI code still owns selector resolution, confirmation, rendering, Clinkr exits, and JSON result models.

## Objective Impact

Completes the roadmap row for deepening the `asdl-slots` release/free/gc workflow. Direct release workflow unit tests now cover explicit release planning/execution, cleanup ordering and stop-on-error behavior, PR and local branch cleanup edge cases, GC planning, dry-run outcome construction, execution rechecks for dirty/operation-held slots, and cleanup error accounting.

Validation evidence:

- `uv run pytest packages/asdl-slots/tests/unit/test_release_workflow.py -q`
- `uv run pytest packages/asdl-slots/tests/unit/test_lifecycle.py -q`
- `uv run pytest packages/asdl-slots/tests/scenario/test_slot_free_cli.py -q`
- `uv run pytest packages/asdl-slots/tests/scenario/test_slot_gc_cli.py -q`
- `uv run pytest packages/asdl-slots/tests -q`

## Follow-Ups

- Keep compatibility wrappers in `lifecycle/free.py` and `lifecycle/gc.py` until downstream imports can be audited or migration is explicitly desired.
- CLI scenario tests remain intentionally conservative; they can be pruned further only after reviewers are comfortable with the direct release workflow coverage.
