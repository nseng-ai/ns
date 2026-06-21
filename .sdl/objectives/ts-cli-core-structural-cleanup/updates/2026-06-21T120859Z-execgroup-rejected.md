# execGroup Helper Rejected

## Summary

The `execGroup(description?)` helper slice was rejected after review. The implementation added a shared wrapper around already-correct hidden `exec` group construction, but it did not delete meaningful complexity, prevent a plausible bug, or encode a non-obvious invariant.

The source-code changes from commit `e0967e6d93325874dd012c918f7b78154221d04e` were reverted. The earlier Semantic Update claiming completion remains immutable historical context; this update supersedes its durable meaning.

## Objective Impact

The Objective no longer treats `execGroup(description?)` as required shared CLI cleanup. The roadmap row is closed as a rejected recommendation, not completed implementation. Completion criteria now require the shared `defineCli` helper but explicitly exclude `execGroup` unless future evidence clears a stronger shared-abstraction bar.

This also corrects the original thermo-nuclear review calibration: repeated syntax alone is insufficient evidence for a shared helper when the convention is already followed correctly everywhere and the proposed abstraction mostly renames obvious code.

## Follow-Ups

- Keep the existing direct `new ClinkrGroup({ name: "exec", isHidden: true, ... })` construction unless a future change introduces real drift or non-obvious behavior.
- Continue the Objective with higher-payoff structural rows such as Branch-Memory access unification, cross-package deduplication with real drift risk, and god-file/god-function decomposition.
