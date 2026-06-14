# Branch-Context Contract Prototype

## Summary

A prototype landed across Saved plan authoring and branch-context implementation guidance. The Saved plan prompt and `enriched-plan-save` skill now ask for provenance, current-state excerpts, scope boundaries, verification gates, plan-specific STOP conditions, and a cold-read executability check. The branch-context implementation prompt and skill now tell executors how to recognize new-format contract plans, verify excerpts before editing, stop on divergence, document minimal deviations, and handle pre-contract Attached plans gracefully.

## Objective Impact

This prototypes candidates 1-5 primarily: content/excerpt drift anchoring, verification gates with honest missing-gate language, the universal vs. plan-specific STOP split, hard scope boundaries, and cold-read review for executability gaps. It also includes a lightweight slice of candidate 6 by asking executors to compare changed files against scope, rerun gates, and treat silent deviations as failures.

The full Objective remains open. Candidates 6-11 still need explicit triage or follow-on disposition, and the prototype does not complete the parked CLI drift checker, generalized protocol expansion, or broader review taxonomy work.

## Follow-Ups

Evaluate whether this prototype catches real drift and prevents executor guessing, or whether the added sections become boilerplate. Defer CLI drift-checker push-down until there is evidence that manual excerpt comparison is useful or being skipped. Continue full candidate 6-11 triage before treating the Objective as complete.

## Rollback / Trial Boundary

This prototype is intentionally isolated to prompt/skill text, prompt-rendering tests, attached-plan prompt tests, and this Objective update. Prefer rolling it back with a single revert of PR #1477, or of the final merged commit(s) for `branch-context-plan-contract-prototype`; do not rely on local checkpoint hashes because submit flows may rewrite them.

No data migration, compatibility shim, Branch Memory mutation, or long-lived feature flag is required to roll back. If manually reverting, remove the prototype-owned sections and assertions from `.asdl/prompts/plans-write.md`, `skills/enriched-plan-save/SKILL.md`, `skills/branch-context-impl/SKILL.md`, `skills/branch-context/SKILL.md`, `ts/packages/branch-context/src/prompts/branch-context-impl.md`, `packages/asdl-core/tests/unit/prompts/test_resolver.py`, `ts/packages/branch-context/test/attached-plan.test.ts`, and this update file.

Until the trial is accepted, avoid landing dependent work that assumes the contract is permanent; future deeper work should be separate PRs so reverting #1477 remains low-risk. After rollback, rerun the same prompt and branch-context tests that covered the prototype.
