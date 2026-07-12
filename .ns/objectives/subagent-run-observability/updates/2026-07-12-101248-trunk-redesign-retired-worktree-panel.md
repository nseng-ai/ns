# Trunk Redesign Retired Worktree Panel; Package Moved to Internal Tier

## Summary

Trunk refresh verified the record against HEAD ground truth and found two
material changes landed outside this Objective since the 2026-07-09
closure-ready rebaseline
(`2026-07-09-154905-trunk-rebaseline-closure-ready.md`):

- The package moved and was renamed: `ts/packages/extensions/ns-pi-subagents/`
  → `ts/packages/internal/ns-pi-subagents/`, `@nseng-ai/ns-pi-subagents` →
  `@internal/ns-pi-subagents` (commit bcbd592a6). Every path and package-filter
  claim in the record was updated accordingly.
- Merged PR #3412 (commit 036a65459, "Refine fleet detail timeline rendering
  and run-state presentation", merged 2026-07-11) redesigned the detail view:
  it deleted `fleet/worktree-state.ts` and its test (removing the live
  worktree/diff summary panel this Objective delivered), removed the separate
  `trend:` line (latest input/output delta plus context percentage) in favor
  of a `peak <n>` figure appended to the tokens line, and added timestamped
  timeline entries, running/ok/error entry states, durations, inline post-run
  status, and follow-state navigation.

Slice-survival verification at HEAD: current-action/heartbeat/auto-refresh
survives (`runner-subagents/timeline.ts`, signature-gated `fleet/detail.ts`,
quiet-time rendering in `fleet/detail-render.ts`, 1s default refresh in
`fleet/navigator.ts`); post-run summary survives (`fleet/tracking.ts` +
`fleet/git-head.ts` HEAD snapshots, inline post-run rendering); top-level Pi
`message` parsing survives (`activity.ts` / `timeline.ts` / `json-events.ts`);
trend derivation survives in `runner-subagents/extension-usage.ts` and
context-window extraction in
`ts/packages/infra/foundation/src/terminal/runner-usage.ts`. PRs #3213 and
#3220 remain MERGED. `navigator.ts` is now ~938 lines (record said ~730).

Provenance: objective-refresh basis target=c1cb8d5d3 from=trunk-HEAD

## Objective Impact

Completion criteria are now judged at delivery time: all four slices were
delivered and merged, and trunk's later redesign supersedes rather than
reopens them. The worktree-panel removal and trend-line simplification are
recorded as deliberate product decisions — this Objective must not resurrect
those surfaces without a new decision, and the Runner Policy now says to steer
or ask first before re-adding them. The shared-worktree commingling risk is
retired by removal. The parked timeline-enrichment row is largely delivered
out-of-band by the same redesign (timestamps, durations, failure states);
only per-edit +N/-N remains absent.

The Objective stays open, closure-ready in substance: the one outstanding gate
is the explicitly required manual smoke of the current fleet navigator against
a real runner subagent session, which remains unrecorded and was not performed
by this refresh. No `blocked:` sentence or `edges:` frontmatter is present on
this record.

## Follow-Ups

- Run the manual fleet navigator smoke against a real child/explorer session
  on the current (post-PR #3412) detail view, record the result, then close.
- If a future decision wants worktree state or the richer trend line back in
  the detail view, treat it as new scoped work, not a reopening of the
  delivered slices.
