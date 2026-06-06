# Landed Architecture Review: Slot Occupancy Locality

## Thesis

Slot lifecycle safety should have a clear local home for occupancy decisions involving checked-out branches, rebases, bisects, dirty worktrees, and recovery messages. The archived landed-architecture review identified this as a still-valid but lightly drifted seam; this child Objective owns the current-code re-baseline and any resulting implementation, documentation, or parking decision.

The re-baseline found that the core state model already has reasonable locality: `asdl-core` owns generic Git worktree occupancy facts, and `asdl-slots.inventory` derives slot-local branch and operation facts from them. The remaining locality question was narrower: mutating slot lifecycle commands repeated operation-state recovery instructions and operation-in-progress messages. That drift-prone recovery policy is now consolidated under `asdl-slots.lifecycle` without broadening the state model or moving slot-specific policy into `asdl-core`.

## Scope

This Objective covers slot occupancy locality for managed slot worktrees and related Git operation states:

- How `asdl-core` represents worktree occupancy, including checked-out, rebase, and bisect states.
- How `asdl-slots.inventory` derives slot-local branch and operation facts from Git worktree occupancy.
- How mutating `asdl-slots` lifecycle commands allocate, free, protect, skip, or recover occupied slots for `slot checkout`, `slot checkout --current`, `slot free`, `slot gc`, and shrinking `slot resize`.
- How display consumers such as `slot list` and `slot goto` surface operation state without owning lifecycle safety policy.
- Whether operation-state recovery-message and operation-in-progress handling should stay command-local, be documented as sufficiently local, or be consolidated into a tiny `asdl-slots.lifecycle` helper.
- Dirty-worktree handling as adjacent lifecycle safety evidence, not the core rebase/bisect occupancy seam.

## Non-Goals

- Do not treat this Objective as a generic `asdl-slots` feature backlog.
- Do not change Git, Graphite, cmux, or planned-branch behavior except where slot occupancy safety directly requires it.
- Do not invent persisted branch-to-slot state; the current design derives slot state from Git worktrees unless the review produces explicit evidence that this assumption must change.
- Do not move slot-specific lifecycle recovery policy into `asdl-core`; `asdl-core` should stay focused on generic Git facts unless a future review finds a generic Git-level policy need.
- Do not make routine validation, waiting for CI, or full-repo checks standalone roadmap work.
- Do not mirror progress back into the umbrella Objective after this child has been created.

## Completion Criteria

This Objective is complete when:

- the slot occupancy locality review has been re-baselined against current code and representative tests;
- the roadmap records the selected semantic slices from the re-baseline;
- the selected outcome has either been implemented with evidence, documented as already local enough, or explicitly parked with rationale;
- if implementation is selected, the slice stays narrow: a lifecycle-level operation recovery/message helper plus representative tests, without redesigning Git gateway or inventory state unless new evidence requires it;
- assumptions and risks below have been updated through Semantic Updates as evidence changes.

## Assumptions and Risks

Assumptions:

- Git worktree facts remain the authoritative source for slot occupancy; no separate slot occupancy registry is needed.
- `asdl-core` owns generic `WorktreeOccupancy` facts, including checked-out, rebase, and bisect states.
- `asdl-slots.inventory` is the right local home for deriving slot records from core Git facts, including `SlotRecord.operation` for rebase/bisect worktrees.
- Rebase and bisect states are the important non-ordinary occupancy cases to preserve during lifecycle operations.
- Dirty-worktree checks remain adjacent lifecycle safety policy; they should be reviewed for interactions but not folded into the core operation-state occupancy model by default.
- The shared policy home is under `asdl-slots.lifecycle`, not in CLI renderers or the core Git gateway.
- The archived umbrella review was provenance for this child Objective, not a binding implementation mandate; current code and tests decided the narrow helper implementation.

Risks:

- The risk that safety checks remain scattered enough for future lifecycle commands to drift is reduced by centralizing rebase/bisect recovery instructions and shared operation-in-progress message fragments in `asdl-slots.lifecycle.operation_state`.
- The recovery-message drift risk is reduced for `free`, `gc`, shrink `resize`, and checkout rebase/bisect branch-in-use failures; checkout keeps command-specific branch-in-use wording while sharing only recovery instruction text.
- The premature-abstraction risk was mitigated by keeping the helper small and pure, without a lifecycle state machine, persisted registry, Git gateway redesign, or inventory refactor.
- Representative tests now cover the helper and targeted rebase/bisect behavior across checkout, free, gc, and shrink resize; existing inventory and checkout-planning tests continue to cover operation fact derivation and allocation behavior.
- Dirty-worktree safety remains adjacent lifecycle behavior and was not folded into the rebase/bisect recovery helper.

## Open Questions

None. Checkout shares recovery instruction text while preserving command-specific branch-in-use wording; targeted bisect coverage was added where lifecycle behavior had mostly rebase scenario coverage; no runner policy is needed because the selected narrow outcome completes the Objective.

## Closure

Completed. The current implementation keeps generic Git occupancy facts in `asdl-core`, slot-local operation derivation in `asdl-slots.inventory`, and slot-specific operation recovery policy in a tiny `asdl-slots.lifecycle.operation_state` helper. `slot free`, `slot gc`, shrink `slot resize`, and checkout rebase/bisect branch-in-use failures now share the centralized recovery instruction source while preserving command-specific safety behavior and wording where appropriate.

Evidence: local branch diff against Graphite parent `landed-architecture-review-slot-occupancy-locality`; targeted slot lifecycle tests passed; `just lint`, `just format-check`, `just ty`, and `just test` passed. No persisted slot occupancy registry, broad state-model refactor, or `asdl-core` recovery-policy move was introduced.
