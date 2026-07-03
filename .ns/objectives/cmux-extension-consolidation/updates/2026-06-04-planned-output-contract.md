# Planned branch output contract unified

## Summary

Completed the `planned-branch-output` contract slice. A new top-level `planned-branch-output.ts` module owns the custom message type, `PlannedBranchEvidence` shape, `formatPlanBranchEvidence`, and structured `extractPlannedBranchEvidence(details)` parser. `planned-branch-extension.ts`, `cmux/slot-dispatch-plan.ts`, and `cmux/slot-open-branch.ts` now use that shared contract.

## Objective Impact

The planned-output contract roadmap row is complete. The module-location open question is resolved for this objective: the owning module lives at the pi-extensions top level because both planned-branch extension code and cmux command code consume the UI message contract. `slot-open-branch.ts` no longer infers branch selections from text-only human output; structured `details.evidence` is the single inference contract. Evidence: local branch diff against `cmux-extension-consolidation/canonical-helpers`; `just ts-check`, `just ts-test`, and `git diff --check` passed.

## Follow-Ups

- Continue with the `openBranchInCmuxSlot` orchestrator slice.
- The Objective remains open: the shared slot orchestrator and final naming normalization are still outstanding.
