# PR 2 asdl-pr-address Migration Complete

## Summary

PR 2's `asdl-pr-address` migration slice is complete under landed-state semantics. The local branch diff against Graphite parent `unify-pr-gateway-add-review-comments-and-thread-mu` switches the CLI context from `gh_issue_gateway` to `pr_gateway`, updates discussion-comment, reaction, review, thread, branch-lookup, and prepare-run operations to the unified PR gateway vocabulary, and updates the `asdl-pr-address` scenario tests, `pr-address` plugin smoke test, and CLI reference docs for the new result schemas.

Verification: `uv run pytest packages/asdl-pr-address/tests/scenario tests/scenario/test_plugins.py` passed.

## Objective Impact

This marks roadmap PR 2 complete. The first production consumer now uses the unified PR gateway surface and PR-domain discussion comment types rather than the old issue-gateway path.

The implementation resolves the open CLI-result naming decision for review-thread mutations: `resolve-thread`, `unresolve-thread`, and `resolve-thread-with-reply` now report `is_resolved` as trusted post-mutation state instead of fake-only `was_already_*` pre-state claims. This de-risks the expected CLI JSON output change with scenario coverage.

Reviewer migration, slots migration, remaining plugin/live wiring, final old-name deletion, and final docs/Objective cleanup remain for later PRs.

## Follow-Ups

- Start PR 3 by migrating `asdl-reviewer`, `asdl-slots`, remaining plugin smoke coverage, and live wiring to the unified PR gateway.
- Keep old API deletion and final context/docs cleanup parked until remaining consumers no longer need the old names.
