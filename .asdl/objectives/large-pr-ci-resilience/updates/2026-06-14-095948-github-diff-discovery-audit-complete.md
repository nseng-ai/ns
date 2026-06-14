# GitHub Diff Discovery Audit Complete

## Summary

A read-only audit found no remaining roaster path that depends on GitHub's 300-file PR diff endpoint. The workflow uses `gh pr view` only to resolve base-ref metadata. `roaster review list --applicable` and `roaster review run` both use the local checkout diff gateway, which shells out to `git diff --no-ext-diff origin/<base>...HEAD`. Inline finding publication uses `PRGateway.get_pr_changed_files()`, backed by `gh api repos/{owner}/{repo}/pulls/{number}/files --paginate`, and budget-failure inline posting no-ops before querying changed files.

The audit also noted that missing or too-large per-file patches from the PR Files API are already handled as `patch_unavailable` fallback-only findings rather than hard failures.

## Objective Impact

The roadmap item to make GitHub diff/file discovery large-PR aware is now complete for roaster's current paths. Roaster avoids the observed `gh pr diff` / `PullRequest.diff too_large` failure mode by using local checkout diffs for review budgeting/execution and paginated PR file metadata only for inline-comment placement.

A separate residual limitation remains possible for extremely huge PRs: GitHub REST pagination, omitted per-file patches, or review-thread volume could impose practical limits, but those are distinct from the 300-file diff endpoint failure that motivated this Objective.

## Follow-Ups

- Keep the oversized-case workflow status check parked for manual post-merge verification.
- If future evidence shows REST file pagination or review-thread volume fails on very large PRs, track that as a separate hardening slice rather than reopening the 300-file diff-endpoint work.
