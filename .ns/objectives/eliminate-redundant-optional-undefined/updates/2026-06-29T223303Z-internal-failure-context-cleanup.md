# Internal Failure Context Cleanup

## Summary

Completed a narrow semantic cleanup pass for the current branch-local optional-undefined slice.

Removed redundant explicit `| undefined` from internal PR feedback failure-construction context/options, GitHub status-check helper options, and the private pr-feedback-watch status renderer. The changed builders now conditionally omit context fields with object spread before passing them into narrowed optional shapes, preserving `exactOptionalPropertyTypes` semantics instead of forwarding present-key `undefined`.

Scoped touched-cluster grep count moved from the consolidation baseline of 67 matches to 49 matches:

- `infra/github` / PR feedback + PR status: 16 remaining.
- `local-pi-tools/pr-feedback-watch`: 10 remaining.
- `local-pi-tools/pr-previews`: 8 remaining.
- `worktree-status/src`: 15 remaining.
- `tools/packagechk/src`: 0 remaining.

## Objective Impact

This advances the roadmap row to finish the current branch-local continuation slice by removing an internal-model leak where present-key `undefined` was not semantically meaningful. The remaining candidates are now more concentrated in compatibility/input/dependency surfaces, external GraphQL/schema mirrors, signal/env/options bags, and worktree-status option/loading seams that need separate semantic justification before narrowing.

Validation evidence:

- `just ts-check` passed.
- `just ts-format-check` passed.

## Follow-Ups

- Continue classifying the 49 remaining scoped candidates before editing further.
- Preserve `signal`, `env`, options/dependency bags, external schemas, and other explicit-undefined-compatible input surfaces unless a local normalization boundary justifies narrowing.
- Decide whether the branch is review-coherent as one slice before submission.
