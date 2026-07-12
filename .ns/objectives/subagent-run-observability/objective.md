# Subagent Run Observability

## Thesis

The subagent detail screen in the Pi fleet navigator
(`ts/packages/internal/ns-pi-subagents/src/fleet/navigator.ts`) should behave
like a live run dashboard — an agent flight recorder — instead of a static
metadata modal. While a subagent runs, the parent operator's only real question
is "is it making progress or is it wedged?"; the screen should answer that
directly with a current-action pane, heartbeat/staleness signals, and token
usage trend. The moment a run stops, the screen should flip from "watch" to
"judge" with a post-run summary that supports the parent-judges-checkpoint
loop the objective runner already uses.

That dashboard now largely exists on trunk. The detail view derives everything
from existing sources — the child session JSONL parsed by
`extractRunnerSubagentTimelineFromSessionJsonl`
(`src/runner-subagents/timeline.ts`) plus local read-only git HEAD reads — with
no new event protocol. Trunk has since kept evolving the same screen outside
this Objective (merged PR #3412): timestamped timeline entries, live
durations, inline post-run status, and the deliberate removal of the
worktree-state panel this Objective had delivered.

## Scope

- The detail screen of the subagent fleet navigator in the
  `@internal/ns-pi-subagents` package
  (`ts/packages/internal/ns-pi-subagents/`; moved from the extensions tier and
  renamed from `@nseng-ai/ns-pi-subagents`). This is the deliverable surface.
- Current-action pane: what the subagent is doing right now (thinking vs
  named tool call with structured input), quiet-time heartbeat, inferred from
  the session JSONL tail (last tool start without a completion), backed by
  auto-refresh — periodic signature-gated re-read of the session while the
  detail view is open.
- Worktree/diff summary: delivered as an honestly labeled shared
  "worktree state" panel, then deliberately removed from the detail view by
  trunk's later redesign (merged PR #3412). Re-adding it is out of scope
  without a new product decision.
- Post-run summary state: when the run stops, present final status, last
  diagnostic, and commit movement from HEAD baseline/final snapshots captured
  in extension-local fleet tracking.
- Token/context trend: per-turn and peak usage derived from the same usage
  events that feed the totals line. Derivation (latest turn, peak
  prompt/total tokens, context window) remains in place; the rendered surface
  was simplified by PR #3412 to a peak-prompt figure on the tokens line.
- Optional cheap spillover: a minimal staleness or current-tool hint in the
  fleet list row. Allowed, but not a completion criterion.
- Derivation logic stays pure and UI-free (as `timeline.ts` already is)
  within the package.

## Non-Goals

- CLI parity or a shared library extraction for the derivation logic. The
  `ns-pi-subagents` package is Pi-only by explicit decision; no
  `ns agents show` CLI face is planned from this Objective.
- A new runner event protocol or semantic events emitted by the subagent
  (parked, see roadmap): this Objective derives signals from what the
  session JSONL and git already contain.
- Kill/abort controls from the detail screen (parked): this Objective keeps
  the screen a read-only observer, not an actuator.
- Making the fleet list view a first-class deliverable.
- Any push/submit/external-write behavior.
- Re-litigating trunk's detail-view redesign: restoring the removed
  worktree-state panel or the removed `trend:` line is not this Objective's
  work absent an explicit new decision.

## Completion Criteria

All four agreed slices delivered in the detail view, judged at delivery time
(trunk's later redesign of the same screen supersedes rather than reopens
them):

1. Current-action pane with heartbeat/staleness, backed by auto-refresh of
   the session JSONL while the detail view is open — delivered and merged
   (PR #3213), still live.
2. Live worktree/diff summary (status + per-file diff stat) — delivered and
   merged, subsequently retired from the view by the trunk redesign (merged
   PR #3412); the delivery stands, the surface intentionally no longer exists.
3. Post-run summary state when the run stops — delivered and merged
   (PR #3220), still live; the redesign now presents it inline.
4. Token/context trend alongside totals — delivered and merged; derivation
   intact, rendering since simplified to peak-prompt on the tokens line.

Evidence: targeted Vitest coverage for the pure derivation functions (landed
with each slice) and relevant repo checks passing; plus a manual smoke of the
current fleet navigator against a real runner subagent session. That manual
smoke remains unrecorded and is the outstanding closure gate.

## Definition of Progress

Progress is keepable when it makes the subagent detail screen better at
answering "is this run making progress or wedged?" from existing session JSONL,
fleet registry state, and local git state, while keeping derivation logic pure
and UI-free outside the navigator render component.

Do not keep changes that introduce a new runner event protocol, write-capable
controls, external side effects, or broad CLI/shared-library extraction. Treat
trunk's detail-view redesign (PR #3412) as the current baseline: do not
resurrect surfaces it removed without an explicit decision. If a slice
discovers that existing session/git signals are insufficient, record the
finding and prefer a narrow fallback or parked follow-up over widening the
Objective.

Useful evidence includes targeted tests for pure timeline/summary helpers, a
relevant package or repo check passing, and a manual smoke of the navigator
against a real runner subagent session when UI behavior changes.

## Runner Policy

This Objective is an autoobjective: it is shaped for repeated Objective Runner
steps with parent-LM checkpoints between committed slices.

- Direct execution is allowed after preview for one roadmap slice at a time when
  the slice stays inside `ts/packages/internal/ns-pi-subagents/` and the
  Objective record, derives signals from existing session JSONL/fleet/git state,
  and leaves a local commit plus checkpoint evidence for the parent to judge.
- Repeated runner steps may continue through the roadmap until all completion
  criteria are satisfied, provided each checkpoint preserves the Objective
  boundaries and the parent keeps selecting the next unchecked semantic slice.
- Default decisions for autonomous completion: keep HEAD baseline capture local
  to extension fleet/run tracking; use existing usage events for token/context
  trend and record a scope finding if they prove insufficient.
- Steer or ask first when a step would add or depend on a new runner event
  protocol, add kill/abort or other actuator controls, make CLI parity/shared
  library extraction part of the deliverable, change Objective Runner dispatch
  semantics outside the package, re-add a surface the trunk redesign removed
  (the worktree-state panel or the `trend:` line), or otherwise require
  widening beyond the four completion-criteria slices.
- Work may be left as a small local commit, with semantic Objective tracking
  updated separately when a checkpoint materially changes scope, assumptions,
  risks, or completion evidence.
- Validation before keeping work should match the touched slice: targeted Vitest
  coverage for pure derivation logic, relevant `pnpm` checks where available
  (the package filter is now `@internal/ns-pi-subagents`), and manual navigator
  smoke notes for UI-only behavior that tests cannot cover cheaply.
- Do not push, submit, publish, deploy, mutate GitHub/Graphite state, or perform
  any write-capable external action unless the human explicitly requests it
  outside the runner step.

## Assumptions and Risks

Assumptions (each falsifiable by a future update):

- The session JSONL tail carries enough to infer the in-flight action. PR #3213
  confirmed the approach for `tool_execution_*` / `message_end` shapes, and the
  top-level `message` parser support (assistant `toolCall` content followed by
  `message.role = "toolResult"` records) covers the actual Pi explorer session
  shape observed in manual smoke; the parsing survives on trunk in
  `runner-subagents/activity.ts` / `timeline.ts` / `json-events.ts`. Manual
  navigator re-smoke remains useful before closure, but the parser gap itself
  is de-risked by targeted tests.
- Usage events already parsed for the totals line are granular enough to
  compute per-turn deltas without new instrumentation. Held: trend derivation
  in `runner-subagents/extension-usage.ts` computes latest-turn, peak
  prompt/total tokens, and context window from existing usage records.
- Run-stop detection (for the post-run flip) is available from the existing
  fleet tracking/registry state plus session-file quiescence; no new signal
  from the subagent process is needed. Held: the post-run summary renders from
  fleet lifecycle state.

Risks:

- Polling cost: the detail view refreshes on a 1s default interval
  (`DEFAULT_DETAIL_REFRESH_INTERVAL_MS` in `fleet/navigator.ts`) with
  session-content-signature gating in `fleet/detail.ts`, but still re-reads and
  re-parses the session on that interval. Tail-reading or size-gated
  incremental parsing may still be needed if real sessions jank the TUI.
- Shared-worktree commingling: retired by removal. The worktree-state panel no
  longer exists in the detail view (removed by merged PR #3412), so the
  attribution concern no longer applies to the current surface. It returns
  only if a future decision re-adds a worktree panel.
- Commit detection ambiguity for the post-run summary is de-risked by the
  landed post-run slice (merged PR #3220): the extension captures baseline and
  final HEAD snapshots in fleet/run tracking (`src/fleet/tracking.ts`, via
  `src/fleet/git-head.ts`) and reports HEAD movement as commit state, without
  changing runner dispatch semantics or trying to infer Graphite stack
  ownership beyond local OID comparison.
- Navigator size: managed by decomposition rather than eliminated. Derivation
  and render logic live in `src/fleet/detail.ts`, `src/fleet/detail-render.ts`,
  `src/fleet/tool-presentation.ts`, and `src/runner-subagents/timeline.ts` /
  `activity.ts` / `json-events.ts`; `navigator.ts` is ~938 lines after the
  redesign added follow-state navigation. Keep new derivation pure and out of
  the render code if further slices land.

## Open Questions

- Agent narration stream: should the runner emit lightweight progress notes
  separate from final answer text? Deliberately not parked — the intended path
  is still to derive narration from existing assistant-text and tool-call
  session messages, not to add a new protocol. The trunk redesign (PR #3412)
  went further down that path with timestamped entries and tool-specific
  displays derived from existing messages; revisit runner-emitted narration
  only if existing messages still prove insufficient after re-smoke.
- Multi-pane layout with pane switching and timeline filtering: the trunk
  redesign kept a single scrolling column and added follow indicators and
  hidden-event counts instead. Revisit only if the single column proves
  cramped.
- Structured prompt panel (Assignment/Constraints/Inputs) is parked rather
  than open, but its viability depends on dispatch-side prompt structure —
  it only makes sense where the prompt is already structured (objective
  runner steps).
