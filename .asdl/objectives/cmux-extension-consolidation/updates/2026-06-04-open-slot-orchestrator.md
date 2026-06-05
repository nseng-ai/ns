# cmux slot opening orchestrator extracted

## Summary

Completed the shared slot-opening orchestrator slice. `openBranchInCmuxSlot` now owns the common checkout-slot, worktree-description, cmux-workspace-open, notification, and failure-formatting tail. `cmux-dispatch`, `cmux-slot:open-branch`, and `cmux-slot:dispatch-plan` now produce their branch/launch inputs and delegate the shared tail to the orchestrator.

## Objective Impact

The orchestrator roadmap row is complete. Workspace descriptions are now uniform `repo/branch` values across the three cmux workspace-opening commands, including the intended `cmux-dispatch` behavior change. The duplicate saved-plan checkout mismatch block and the dead success-to-info `present()` downgrade were removed. Evidence: local branch diff against `cmux-extension-consolidation/planned-output-contract`; `just ts-check`, `just ts-test`, and `git diff --check` passed.

## Follow-Ups

- Continue with the final isolated naming-normalization slice.
- The Objective remains open until command naming, sidebar terminology/status keys, docs, skill copy, and `dprint` validation are completed.
