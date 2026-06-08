# Slot Occupancy Re-Baseline

## Summary

The slot occupancy locality review was re-baselined against current code and representative tests before assuming production changes. Current state has a clear fact/derivation split: `asdl-core` owns generic `WorktreeOccupancy` facts for checked-out, rebase, and bisect states, while `asdl-slots.inventory` derives slot-local `SlotRecord.branch` and `SlotRecord.operation` from those facts.

Mutating lifecycle paths apply the centralized facts consistently: checkout rejects branches already held by checked-out/rebase/bisect worktrees; `slot free` blocks operation-in-progress before detaching; `slot gc` skips operation-in-progress before freeing; and shrinking `slot resize` refuses to remove slots with operations in progress. `slot list` and `slot goto` are display consumers that surface operation state without owning lifecycle safety policy. Dirty-worktree checks remain adjacent safety behavior, not the core rebase/bisect occupancy seam.

The selected follow-up is intentionally narrow and is tracked in the Objective roadmap instead of broadening into a state-model refactor.

## Objective Impact

The roadmap now records the grilling/re-baseline and locality decision as complete. The remaining work is a narrow operation-state recovery outcome: either implement a tiny lifecycle helper for rebase/bisect recovery instructions and operation-in-progress messages, or park the topic with rationale that centralized facts, consistent mutating behavior, and representative tests make command-local wording sufficient.

Assumptions and risks were sharpened to distinguish branch occupancy from dirty-worktree safety and to balance two competing risks: repeated recovery policy may drift across lifecycle commands, but premature abstraction could make simple slot commands harder to understand.

## Next Action

Resolve the narrow operation-state recovery outcome in the Objective roadmap: either implement the lifecycle helper with any targeted coverage it exposes, or explicitly park the topic with rationale.
