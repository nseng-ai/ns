# Operation Recovery Helper Implemented

## Summary

The narrow operation-state recovery outcome was implemented under `asdl-slots.lifecycle`. A new `operation_state` helper centralizes rebase, bisect, and unknown-operation recovery instructions plus the shared operation-in-progress message fragments needed by lifecycle commands.

`slot free`, `slot gc`, and shrink `slot resize` no longer carry duplicate rebase/bisect recovery mappings. Checkout keeps its branch-in-use failure wording command-specific, but rebase and bisect failures now share recovery instruction text from the same lifecycle helper. The implementation did not change Git occupancy facts, slot inventory derivation, dirty-worktree handling, persisted state, or core Git gateway policy.

## Objective Impact

The final roadmap row is complete. The Objective's selected outcome was implementation rather than parking: consolidate only drift-prone recovery/message policy, keep the helper tiny, and preserve the existing safety behavior that blocks, skips, or reports operation-held slots.

The open questions are resolved: checkout shares only recovery instruction text; targeted bisect coverage was added for lifecycle behavior that previously relied mostly on rebase scenario tests; no durable runner policy is needed because the Objective's semantic work is complete.

Validation evidence: targeted slot lifecycle tests passed; `just lint`, `just format-check`, `just ty`, and `just test` passed.

## Follow-Ups

None for this Objective. Future lifecycle commands that need rebase/bisect recovery wording should use `asdl_slots.lifecycle.operation_state` rather than duplicating operation-specific recovery text.
