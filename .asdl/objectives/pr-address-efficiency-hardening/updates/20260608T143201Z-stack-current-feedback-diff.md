# Stack Current-Feedback Diff Helper

## Summary

This branch adds `pr-address exec stack-feedback-diff-current`, a deterministic local/read-only helper that compares a validated `stack-feedback-plan` result with a freshly fetched `stack-feedback-prep --include-resolved` result before review-thread resolution mutation.

The helper validates stack plan/current prep shape, stack PR membership, duplicate/current thread identity issues, and `include_resolved` provenance. It emits compact, body-free categories for planned actionable threads still unresolved, planned actionable threads already resolved, newly appeared unresolved current threads not covered by actionable or informational stack-plan review-thread items, and missing or metadata-changed planned threads. It returns a conservative `safe_to_resolve_planned` decision and uses negative exit status whenever drift or insufficient provenance means mutation should not proceed blindly.

Verification: targeted stack current-diff scenario coverage passed, adjacent stack feedback and stack payload-builder scenarios passed, `pr-address exec stack-feedback-diff-current --json-schema` printed successfully, and `just lint`, `just ty`, and `just dprint-check` passed.

## Objective Impact

This completes the current-feedback reconciliation roadmap slice for stack runs. The stack-address path can now make review feedback drift explicit between the validated stack plan and the immediate pre-mutation feedback snapshot, without relying on manual agent comparison of large JSON payloads or raw review bodies.

The broader Objective remains open. The next stack-specific roadmap item is simplifying `internal-pr-stack-address` around the helper-owned sequence now that stack prep, stack planning, current-feedback diffing, stack payload building, and helper-mediated mutation have stable command surfaces.

## Follow-Ups

- Simplify `internal-pr-stack-address` around the compact stack-native helper path.
- Preserve the non-mutating boundary: `stack-feedback-diff-current` should remain a local comparison helper, with live fetching owned by `stack-feedback-prep` and GitHub mutation owned by `resolve-thread-batch`.
- Keep representative lower-orchestration closure evidence separate from this helper slice.
