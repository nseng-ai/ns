# Post-Run Summary State Implemented

## Summary

The current PR #3220 / local branch `post-run-summary-fleet-detail-view` implements the third subagent detail dashboard slice on top of `live-worktree-diff-summary-panel`. It adds a read-only git HEAD reader, records baseline and final HEAD snapshots through extension-local fleet tracking, and renders completed task details as a post-run summary with final status, last diagnostic, commit movement, and shared worktree state.

The slice stays inside `ts/packages/extensions/ns-pi-subagents/` and does not change runner dispatch semantics, Git/Graphite behavior, or add write-capable controls.

## Objective Impact

The third completion criterion — post-run summary state that flips the detail view from watch to judge when a run stops — is now tracked as complete in the roadmap. The commit-detection risk is partly de-risked: HEAD baseline/final comparison is now captured locally and reported as commit movement, while attribution remains intentionally conservative for shared/stacked checkouts.

Targeted tests cover fleet HEAD snapshot capture, post-run summary rendering, and unavailable HEAD states. No manual interactive TUI smoke was recorded in this update.

## Follow-Ups

- Continue with the last unchecked completion slice: token/context trend derived from existing usage events.
- Preserve conservative commit wording; do not infer subagent-only ownership or Graphite stack semantics from local HEAD movement alone.
- Record manual navigator smoke evidence before closure if available.
