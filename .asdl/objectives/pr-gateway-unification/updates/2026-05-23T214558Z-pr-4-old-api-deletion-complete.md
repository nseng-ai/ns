# PR 4 Old API Deletion Complete

## Summary

PR 4's old-name deletion and final Gh vocabulary cleanup is complete under landed-state semantics. The local branch diff against Graphite parent `migrate-asdl-reviewer-and-slots-to-prgateway` deletes the old issue-gateway modules and compatibility tests, removes transitional Gh types and compatibility inheritance, removes `PRDetails`/`get_pr_details_for_branch`, and makes `PRGateway`, `RealPRGateway`, and `FakePRGateway` expose only the final PR-domain discussion-comment and result APIs.

The same slice finalizes `packages/asdl-core/CONTEXT.md` `## Gh` and updates `CONTEXT-MAP.md` to mark Gh as present and use final PR discussion vocabulary. Old-name audits have no production/test hits for the removed API names; remaining mentions are vocabulary guardrails in `Avoid:` lines.

Verification: targeted core, consumer, plugin, and live-conformance collection tests passed; docs checks passed; full `just` passed.

## Objective Impact

This marks roadmap PR 4 complete. The stack no longer has the old `IssueGateway`/`RealIssueGateway`/`FakeIssueGateway` path, direct issue-listing surface, old discussion-comment/review/detail/lookup/merge/thread-result compatibility types, or parallel-path tests.

The Objective's code and docs criteria for the unified PR gateway are now satisfied at stack tip: `PRSummary` is the single PR metadata record with `head_ref_oid`, review creation returns `PRReview`, lookup miss and gateway failure are distinct final result types, thread resolve/unresolve returns `PRReviewThreadState`, guarded merge success returns `PRMergeOutcome`, and consumers/tests pass against the unified API.

## Follow-Ups

- Run a separate, explicitly selected `objective-update` for `repo-ontology` if its Gh-context completion evidence or follow-up plan should record this final cleanup. This update intentionally mutated only `pr-gateway-unification`.
- True GitHub issue-tracking workflows remain parked until a real issue-management use case appears.
