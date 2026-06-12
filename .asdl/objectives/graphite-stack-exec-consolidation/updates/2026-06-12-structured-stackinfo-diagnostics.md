# Structured StackInfo Diagnostics Implemented

## Summary

`asdl_core.gt.StackInfo` now carries structured `StackWalkDiagnostic` records for Graphite metadata walk anomalies while preserving the existing `warnings` tuple as byte-identical human rendering. The metadata reader emits diagnostics for malformed children metadata, empty branch rows, ancestor/descendant cycles and missing rows, descendant forks with fork children, and trunk-marker missing/multiple/mismatch cases.

Verification: targeted `asdl_core.gt` unit/gateway tests passed; `just ty` passed; full `just test` passed; asdl-slots Graphite scenario/unit tests passed.

## Objective Impact

The structured-diagnostics prerequisite row is complete. The planned `slot gt exec stack-branches` slice can now classify fail-closed conditions from structured fields instead of string-matching warning prose, including fork children needed for the `forked_stack` error contract. Existing consumers remain compatible because `diagnostics` defaults to an empty tuple and `warnings` remains stored.

## Follow-Ups

- Implement the hidden `slot gt exec stack-branches` helper on top of `StackInfo.diagnostics`.
- Map scope-relevant fork/cycle/missing-row/trunk-marker diagnostics to the settled `forked_stack` and `stack_metadata_inconsistent` error contract.
