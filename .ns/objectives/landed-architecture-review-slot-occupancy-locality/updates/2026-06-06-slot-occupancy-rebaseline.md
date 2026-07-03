# Slot Occupancy Re-Baseline

## Summary

The slot occupancy locality review was checked against current code and existing test evidence before assuming production changes. Current state has a clear fact/derivation split: `asdl-core` owns generic `WorktreeOccupancy` facts for checked-out, rebase, and bisect states, while `asdl-slots.inventory` derives slot-local `SlotRecord.branch` and `SlotRecord.operation` from those facts.

Mutating lifecycle paths apply the centralized facts consistently: checkout rejects branches already held by checked-out/rebase/bisect worktrees; `slot free` blocks operation-in-progress before detaching; `slot gc` skips operation-in-progress before freeing; and shrinking `slot resize` refuses to remove slots with operations in progress. Free/gc/pool already share recovery wording through `asdl-slots.lifecycle.release_target`; checkout branch-in-use recovery wording remains command-local. `slot list` and `slot goto` are display consumers that surface operation state without owning lifecycle safety policy. Dirty-worktree checks remain adjacent safety behavior, not the core rebase/bisect occupancy seam.

The selected follow-up is intentionally narrow: decide from a reviewable verification artifact whether checkout should share existing recovery instruction text, or park the topic with explicit sign-off.

## Objective Impact

The roadmap now separates current-code inspection evidence from the final locality decision. The remaining work is a narrow operation-state recovery outcome: either extend existing lifecycle recovery-message helpers where checkout should share recovery instruction text, or park the topic with a named verification artifact or explicit sign-off.

Assumptions and risks were sharpened to distinguish branch occupancy from dirty-worktree safety and to balance two competing risks: checkout-specific recovery wording may drift from existing lifecycle helper policy, but premature abstraction could make simple slot commands harder to understand.

## Follow-Ups

- Carry forward the bisect coverage question as a required verification point: the closing artifact must identify at least one fake-gateway bisect case for lifecycle behavior already covered by rebase, or name the equivalent existing coverage.
