# Trunk Rebaseline: All Slices Landed, Merged; Closure Gated on Manual Smoke

## Summary

Trunk refresh verified the record against HEAD ground truth. All five roadmap
Work rows are implemented and merged on trunk:

- Current-action pane + heartbeat + auto-refresh: `runner-subagents/timeline.ts`
  derives the in-flight action; polling lives in `fleet/detail.ts`; heartbeat
  and current-action render in `fleet/detail-render.ts`. Merged PR #3213.
- Live worktree/diff summary: `fleet/worktree-state.ts` reads
  `git status --porcelain -z` plus `git diff --numstat` (unstaged and cached),
  labeled honestly as shared worktree state.
- Post-run summary state: HEAD baseline/final snapshot capture in
  `fleet/tracking.ts`; completed-run summary in `fleet/detail-render.ts`.
  Merged PR #3220.
- Token/context trend: context-window extraction in
  `infra/foundation/src/terminal/runner-usage.ts` (`contextWindow` /
  `context_window`); peak-prompt/context trend aggregation in
  `runner-subagents/extension-usage.ts`; compact trend line in
  `fleet/detail-render.ts`.
- Top-level Pi `message` parsing: `runner-subagents/json-events.ts`,
  `timeline.ts`, and `activity.ts` recognize assistant `toolCall` blocks and
  top-level `message.role = "toolResult"` records.

Two prior claims were corrected: PRs #3213 and #3220 are now MERGED (record
called them "open" / "current PR"), and the "navigator size" risk is largely
retired — derivation and render decomposed into `fleet/detail.ts`,
`fleet/detail-render.ts`, `fleet/worktree-state.ts`, and the
`runner-subagents/*` parsers, with `navigator.ts` now ~730 lines (record said
~766, undecomposed).

Provenance: objective-refresh basis target=a814ebe365b9164fdcd31c3cf09c681be670c4f0 from=trunk-HEAD

## Objective Impact

All four completion-criteria slices are code-complete and merged, with targeted
Vitest coverage per the prior slice updates. The Objective's remaining gate is
the explicitly-required final evidence step in `## Completion Criteria`: a
manual smoke of the navigator against a real runner subagent session. That
manual re-smoke remains unrecorded and was not performed by this refresh, so
the Objective is closure-ready but not closed. No `blocked:` sentence or
`edges:` frontmatter is present on this record.

## Follow-Ups

- Run the manual fleet navigator smoke against a real child/explorer session
  (previously showed token totals but `0 turns / 0 tools`) and record the
  result, then close.
- If the real session shape diverges from the sanitized fixture, record a new
  parser-compatibility finding rather than adding a runner event protocol.
