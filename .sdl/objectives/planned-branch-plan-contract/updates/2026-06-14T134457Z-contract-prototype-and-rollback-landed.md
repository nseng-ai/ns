# Contract Prototype and Rollback Boundary Landed

## Summary

PR #1477 landed the branch-context plan contract prototype, and PR #1479 landed the rollback/trial-boundary documentation for that prototype. The prototype is now represented as a small, reversible prompt-policy and test slice: Saved plan authoring asks for provenance, excerpt anchors, scope boundaries, verification gates, plan-specific STOP conditions, and cold-read executability review; branch-context implementation guidance recognizes contract-format plans, verifies excerpts before editing, stops on divergence, documents deviations, and handles pre-contract plans without half-applying the protocol.

PR #1479 records the revertability boundary: rollback should be a single revert of PR #1477 or the final merged commit(s), with no data migration, compatibility shim, Branch Memory mutation, runtime feature flag, or long-lived configuration switch. It also added a code-adjacent note in `ts/packages/branch-context/README.md` and left the Pi workflow docs pointing to that package-owned rollback note.

## Objective Impact

Candidates 1-5 now have their accepted prototype disposition landed: content-anchored drift checking, verification gates with honest missing-gate language, universal vs. plan-specific STOP conditions, scope boundaries with final scope comparison, and cold-read executability review. The branch-context implementation path also satisfies the pre-contract-plan completion criterion by explicitly recognizing old-format plans instead of partially applying the new protocol.

The Objective remains open. Candidates 6-11 still need explicit triage and disposition, and the trial still needs evidence about whether manual excerpt comparison catches useful drift or becomes boilerplate. The rollback boundary lowers the risk of trying the prototype, but it does not prove the contract should become permanent.

Evidence: PR #1477 and PR #1479 are merged. Local branch evidence against Graphite parent `master` showed the rollback slice touched `.asdl/objectives/planned-branch-plan-contract/updates/2026-06-14T000000Z-branch-context-contract-prototype.md`, `docs/pi/branch-context-workflow.md`, and `ts/packages/branch-context/README.md`; PR evidence corroborated the same file set for #1479 and the prompt/skill/test file set for #1477.

## Follow-Ups

Continue with candidates 6-11 triage before closing this Objective. Preserve the trial boundary: do not land dependent work that assumes the contract is permanent until the trial is accepted, and defer CLI drift-checker push-down until there is evidence that manual excerpt comparison is useful or being skipped.
