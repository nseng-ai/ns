# Shared Thread Decision Validation

## Summary

PR #1100 extracts canonical resolve/skip decision validation into `resolve_thread_payload_decisions`, so the per-PR and stack resolution-payload builders share the same action, mode, message, commit SHA, provenance, and skip-reason rules instead of carrying divergent local validation logic. The slice also adds duplicate thread detection for mutation payloads, updates `resolve-thread-batch` to reject duplicate payload thread IDs, and moves stack payload builder scenario coverage into `test_stack_resolve_thread_payloads.py`.

Evidence: Graphite parent `stack-native-pr-address-payload-builder`; local branch `share-canonical-resolve-thread-decision-logic`; PR #1100 corroborates the same file set and commits. Validation evidence is represented by the branch tests and checks for the shared decision-validation refactor and focused stack payload scenarios.

## Objective Impact

This does not create a new user-facing workflow step, but it makes the completed stack-native payload-building path more durable. Sharing decision validation reduces the risk that per-PR and stack helpers accept different resolution payload shapes, and duplicate-thread detection hardens the mutation boundary before `resolve-thread-batch` reaches GitHub.

The Objective remains open. Current-feedback reconciliation for stack runs is still not helper-owned, and `internal-pr-stack-address` still needs simplification around the final stack-native helper sequence after drift comparison exists.

## Follow-Ups

- Add deterministic current-feedback reconciliation for stack plans before GitHub mutation.
- Simplify `internal-pr-stack-address` around compact stack helper outputs once current-feedback diffing exists.
- Preserve the shared decision-validation boundary when future per-PR or stack resolution modes change.
