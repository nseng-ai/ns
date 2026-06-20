# Candidates 6-11 Triaged

## Summary

The remaining borrowed `improve` candidates now have explicit dispositions. Candidate 6, the trust-nothing review checklist, stays in the branch-context plan contract as a closeout/review guidance slice: rerun done criteria, compare changed files to declared scope, check deviations, and read meaningful test assertions rather than trusting green commands alone. Candidate 11, verification-baseline-first ordering, also stays in-family: when a repository lacks a credible one-command validation baseline, a Saved plan should establish or confirm that baseline before risky implementation work, without restoring any plan-write-time command prevalidation gate.

Candidates 7 and 10 are valuable but out of this Objective's branch-context contract scope. Candidate 7, fan-out audit vetting taxonomy, should become a follow-on Objective only if broader audit/subagent-fanout discipline becomes worth pursuing. Candidate 10, direction-grounding for roadmap suggestions, belongs in an Objective-family refinement rather than the Saved plan / Attached plan contract. Candidate 8, verifiability as a ranking input, is rejected as a separate branch-context change because Objective roadmap order should remain semantic and user-directed; selected plan work is already governed by verification gates. Candidate 9, rejection ledger, is rejected as already covered by Objective dispositions plus immutable Semantic Updates.

## Objective Impact

This completes the required candidate triage record for all eleven candidates. The remaining in-family implementation work is now narrower: land candidates 6 and 11 as prompt-policy/test-surface refinements while preserving the prototype rollback boundary documented by PR #1479 / PR #1481. No new runtime storage model, ledger, task database, branch attachment behavior, or vendored `improve` modification is implied.

The Objective should remain open. The accepted 6/11 slice still needs implementation evidence, skill-audit-style review or equivalent, and human agreement before closure.

## Follow-Ups

Implement the accepted 6/11 slice in the branch-context plan contract surfaces. Keep candidates 7 and 10 as split follow-on Objective candidates rather than work in this slug unless the user explicitly chooses to create those Objectives. Continue to defer CLI drift-check push-down until there is evidence that manual excerpt comparison is useful or being skipped.
