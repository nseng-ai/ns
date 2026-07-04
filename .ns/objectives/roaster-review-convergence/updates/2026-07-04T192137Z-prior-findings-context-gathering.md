# Prior-Findings Context Gathering

## Summary

The read-side Prior-findings context gathering slice landed on local branch `roaster-review-convergence/prior-findings-context`.

The new optional gatherer reads the stamped `roaster-state:v1` block from the marker-keyed Findings summary comment for a review key on a PR, hydrates inline review-thread resolution status through an adapter over the existing `@ns/capability-kit/github/pr-feedback` surface, applies the explicit context cap over the newest stamped records, and returns a `without-context` result on missing summary state or GitHub read failures.

## Objective Impact

The Prior-findings context gathering roadmap row is complete in the landed-state model while preserving the Objective's layering boundary: this is a separate optional input step, not a default dependency of `ns roaster review run`, and tests use fakes rather than mutating GitHub.

The Objective remains open. Prompt assembly still needs to consume this context, changed-region guidance still needs to be represented in the prompt path, CI still needs to supply PR context, and empirical validation remains human-steered.

## Follow-Ups

- Thread Prior-findings context and changed-since-Last-reviewed-head guidance into prompt assembly as optional input.
- Decide resolved vs. unresolved prompt treatment while adding prompt instructions and anchoring-guard tests.
- Wire CI to gather/supply PR context without new permissions or triggers.
