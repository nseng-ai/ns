# Moved Autobranch Orchestration to CCC

## Summary

Moved `/code:autobranch` flow, preparation, transaction, latest-commit recovery, slugging, upstream inspection, and checkpoint adapter code from `@asdl/pi-extensions` into `@asdl/ccc`. The public command name remains `/code:autobranch`; pi-extensions now keeps only a thin adapter that delegates registration to `@asdl/ccc/autobranch`.

## Objective Impact

This completes the autobranch sub-slice of the source-control command/control roadmap row. CCC now owns the dirty-worktree-to-Graphite-branch-to-checkpoint policy and the clean-worktree latest-commit extraction/recovery policy, while `asdl-dev` remains the lower provider of pending-worktree and checkpoint primitives and `@asdl/pi-extension-runtime` remains the lower neutral helper package.

Validation evidence: focused CCC and pi-extension Bun test suites passed after the move. Import-direction checks should keep confirming that lower packages do not import CCC and that CCC does not import pi-extension internals.

## Follow-Ups

- Move `/code:land` and `/code:land-stack` orchestration into CCC in later slices.
- Decide later whether `/code:submit` remains a pure `asdl-dev` mirror or receives a CCC wrapper for command-suite placement.
- Keep broad validation and import-direction evidence attached to the implementation branch before submission.
