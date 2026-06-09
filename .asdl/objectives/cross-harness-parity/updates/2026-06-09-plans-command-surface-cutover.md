# Plans Command Surface Cutover

## Summary

Saved plan authoring now uses the `plans` command/skill surface: `/plans:write`, `/plans:grill-and-write`, `plans-write`, `plans exec write`, `plans exec resolve`, and `write_saved_plan_file`. Planned-branch branch creation and implementation loading remain under `/planned-branch:*` and `planned-branch exec create/load-plan`.

## Objective Impact

The parity table now distinguishes Saved plan authoring from planned-branch attachment/implementation. `/plans:write`, `write_saved_plan_file`, `/planned-branch:create`, and `/planned-branch:impl` have cross-harness CLI/skill paths; `/plans:grill-and-write` remains a Pi-native structured grilling UI over the same Saved plan artifact.

## Follow-Ups

- Revisit `/planned-branch:up-and-impl` separately if cmux launch orchestration needs a shared CLI boundary.
