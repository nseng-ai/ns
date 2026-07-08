# Subagent Run Observability

## Thesis

The subagent detail screen in the Pi fleet navigator
(`ts/packages/extensions/ns-pi-subagents/src/fleet/navigator.ts`) should behave
like a live run dashboard — an agent flight recorder — instead of a static
metadata modal. While a subagent runs, the parent operator's only real question
is "is it making progress or is it wedged?"; the screen should answer that
directly with a current-action pane, heartbeat/staleness signals, live
worktree/diff state, and token/context trend. The moment a run stops, the
screen should flip from "watch" to "judge" with a post-run summary that
supports the parent-judges-checkpoint loop the objective runner already uses.

The raw material already exists: the detail view parses the subagent session
JSONL via `extractRunnerSubagentTimelineFromSessionJsonl`
(`src/runner-subagents/timeline.ts`), and worktree state is plain git in the
shared checkout. This Objective is about deriving and presenting live signals
from those sources, not building a new event protocol.

## Scope

- The detail screen of the subagent fleet navigator in the
  `ns-pi-subagents` Pi extension. This is the deliverable surface.
- Current-action pane: what the subagent is doing right now (thinking vs
  named tool call with command/path), elapsed time, last output line for
  bash-like tools, inferred from the session JSONL tail (last tool start
  without a completion).
- Heartbeat/staleness: time since last session event ("quiet 3m"), which
  requires auto-refresh — periodic re-read of the session tail while the
  detail view is open — bundled into the same slice.
- Worktree/diff summary: `git status --short` plus numstat-style per-file
  +N/-N counts for the shared checkout, shown live.
- Post-run summary state: when the run stops, replace the live view with
  diff stat, commit created (if any), exit status, and last error.
- Token/context trend: per-turn token delta and context-use trend derived
  from the same usage events that feed today's totals line.
- Optional cheap spillover: a minimal staleness or current-tool hint in the
  fleet list row. Allowed, but not a completion criterion.
- Derivation logic stays pure and UI-free (as `timeline.ts` already is)
  within the extension package.

## Non-Goals

- CLI parity or a shared library extraction for the derivation logic. The
  entire `ns-pi-subagents` extension is Pi-only by explicit decision; no
  `ns agents show` CLI face is planned from this Objective.
- A new runner event protocol or semantic events emitted by the subagent
  (parked, see roadmap): this Objective derives signals from what the
  session JSONL and git already contain.
- Kill/abort controls from the detail screen (parked): this Objective keeps
  the screen a read-only observer, not an actuator.
- Making the fleet list view a first-class deliverable.
- Any push/submit/external-write behavior.

## Completion Criteria

All four agreed slices shipped in the detail view:

1. Current-action pane with heartbeat/staleness, backed by auto-refresh of
   the session JSONL while the detail view is open.
2. Live worktree/diff summary (status + per-file diff stat).
3. Post-run summary state that replaces the live view when the run stops.
4. Token/context trend (per-turn delta alongside totals).

Evidence: targeted Vitest coverage for the new pure derivation functions and
relevant repo checks passing; a manual smoke of the navigator against a real
runner subagent session.

## Definition of Progress

Progress is keepable when it makes the subagent detail screen better at
answering "is this run making progress or wedged?" from existing session JSONL,
fleet registry state, and local git state, while keeping derivation logic pure
and UI-free outside the navigator render component.

Do not keep changes that introduce a new runner event protocol, write-capable
controls, external side effects, or broad CLI/shared-library extraction. If a
slice discovers that existing session/git signals are insufficient, record the
finding and prefer a narrow fallback or parked follow-up over widening the
Objective.

Useful evidence includes targeted tests for pure timeline/worktree/summary
helpers, a relevant package or repo check passing, and a manual smoke of the
navigator against a real runner subagent session when UI behavior changes.

## Runner Policy

This Objective is an autoobjective: it is shaped for repeated Objective Runner
steps with parent-LM checkpoints between committed slices.

- Direct execution is allowed after preview for one roadmap slice at a time when
  the slice stays inside `ts/packages/extensions/ns-pi-subagents/` and the
  Objective record, derives signals from existing session JSONL/fleet/git state,
  and leaves a local commit plus checkpoint evidence for the parent to judge.
- Repeated runner steps may continue through the roadmap until all completion
  criteria are satisfied, provided each checkpoint preserves the Objective
  boundaries and the parent keeps selecting the next unchecked semantic slice.
- Default decisions for autonomous completion: label git panels as shared
  "worktree state" rather than claiming subagent-only attribution; keep HEAD
  baseline capture local to extension fleet/run tracking; use existing usage
  events for token/context trend and record a scope finding if they prove
  insufficient.
- Steer or ask first when a step would add or depend on a new runner event
  protocol, add kill/abort or other actuator controls, make CLI parity/shared
  library extraction part of the deliverable, change Objective Runner dispatch
  semantics outside the extension, or otherwise require widening beyond the
  four completion-criteria slices.
- Work may be left as a small local commit, with semantic Objective tracking
  updated separately when a checkpoint materially changes scope, assumptions,
  risks, or completion evidence.
- Validation before keeping work should match the touched slice: targeted Vitest
  coverage for pure derivation logic, relevant `pnpm`/package checks where
  available, and manual navigator smoke notes for UI-only behavior that tests
  cannot cover cheaply.
- Do not push, submit, publish, deploy, mutate GitHub/Graphite state, or perform
  any write-capable external action unless the human explicitly requests it
  outside the runner step.

## Assumptions and Risks

Assumptions (each falsifiable by a future update):

- The session JSONL tail carries enough to infer the in-flight action: a tool
  start event without a matching completion identifies the current tool, and
  `timeline.ts` already parses assistant and tool events, so current-action
  derivation is an extension of existing parsing, not a new data source. Local
  branch evidence for PR #3213 confirms this for the current-action slice.
- Usage events already parsed for the totals line are granular enough to
  compute per-turn deltas without new instrumentation.
- Run-stop detection (for the post-run flip) is available from the existing
  fleet tracking/registry state plus session-file quiescence; no new signal
  from the subagent process is needed.

Risks:

- Shared-worktree commingling: the subagent shares the parent's checkout, so
  `git status`/diff reflects parent edits too. The worktree panel may
  attribute parent changes to the subagent. Mitigation candidates: snapshot
  a baseline at dispatch time, or label the panel honestly as "worktree
  state" rather than "subagent changes". Needs a decision in the diff slice.
- Polling cost: auto-refresh re-reads session JSONL that can grow large
  (hundreds of KB); the first slice gates heartbeat resets on session content
  signatures but still re-reads/re-parses the session on an interval. Tail-reading
  or size-gated incremental parsing may still be needed if real sessions jank the
  TUI.
- Commit detection ambiguity for the post-run summary is partly de-risked by
  PR #3220 / local branch evidence: the extension captures baseline and final
  HEAD snapshots in fleet/run tracking and reports HEAD movement as commit
  state, without changing runner dispatch semantics or trying to infer
  Graphite stack ownership beyond local OID comparison.
- Navigator size: `navigator.ts` is already ~766 lines; adding four features
  without decomposition risks an unmaintainable component. Keep derivation
  pure and out of the render code.

## Open Questions

- Agent narration stream: should the runner emit lightweight progress notes
  separate from final answer text? Deliberately not parked — the
  assistant-text timeline entries already serve as narration for free, and
  model compliance for structured narration is unproven. Revisit only if
  the timeline demonstrably fails to answer "what is it doing".
- Multi-pane layout with pane switching and timeline filtering: likely
  over-designed for a TUI overlay; a single scrolling column with a couple
  of toggles may be enough. Revisit only if the single column proves
  cramped after the four slices land.
- Structured prompt panel (Assignment/Constraints/Inputs) is parked rather
  than open, but its viability depends on dispatch-side prompt structure —
  it only makes sense where the prompt is already structured (objective
  runner steps).
