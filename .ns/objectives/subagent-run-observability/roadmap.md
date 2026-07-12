# Roadmap

## Work

- [x] Current-action pane with heartbeat/staleness and auto-refresh in the detail view
      Derive the in-flight action (thinking vs named tool + structured input,
      quiet time) from the session JSONL tail as a pure function next to
      `timeline.ts`; periodically re-read the session tail while the detail
      view is open so staleness is honest. Watch polling cost on large session
      files (tail-read or size-gate the re-parse).
  - Policy: direct execution after preview; keep the slice inside existing
    session JSONL parsing and navigator refresh behavior.
  - Evidence: landed on trunk (merged PR #3213) and still live after the
    PR #3412 redesign — current-action extraction in
    `runner-subagents/timeline.ts`, session-signature-gated detail state in
    `fleet/detail.ts`, current-action and quiet-time rendering in
    `fleet/detail-render.ts`, and a 1s-default detail refresh interval in
    `fleet/navigator.ts` (package now at
    `ts/packages/internal/ns-pi-subagents/`). The follow-up parser work covers
    the top-level Pi `message` shape (see the parser row below). Manual
    navigator re-smoke remains unrecorded.
- [x] Live worktree/diff summary panel
      `git status` plus per-file +N/-N in the detail view, labeled honestly as
      shared "worktree state" rather than promising subagent-only attribution.
  - Policy: direct execution after preview using honest worktree-state labeling.
  - Evidence: delivered and merged (fake-backed git worktree reader/parser,
    task-detail worktree state panel, targeted tests for running refresh,
    parent omission, unavailable/clean states, and binary stats), then
    deliberately removed from the detail view by trunk's later redesign —
    merged PR #3412 (commit 036a65459) deleted `fleet/worktree-state.ts` and
    its test and dropped the worktree reader dependency. The delivery stands;
    the surface was superseded by that product decision. Do not re-add it
    under this Objective without a new decision.
- [x] Post-run summary state
      When the run stops, flip the detail view from watch to judge: final
      status, last diagnostic, commit created (if any, via HEAD baseline
      captured in extension-local fleet/run tracking). Supports the
      parent-judges-checkpoint loop in the objective runner.
  - Policy: direct execution after preview; keep HEAD-baseline capture local to
    the extension and do not change runner dispatch semantics or external
    Git/Graphite behavior.
  - Evidence: landed on trunk (merged PR #3220) and still live — read-only HEAD
    snapshot capture in `fleet/tracking.ts` via `fleet/git-head.ts`, and
    post-run status, commit movement (`HEAD changed a → b` / `none detected` /
    `unavailable`), and last-diagnostic rendering in `fleet/detail-render.ts`.
    The PR #3412 redesign presents the summary inline in the detail view
    rather than replacing it. Manual navigator smoke remains unrecorded.
- [x] Token/context trend
      Per-turn token delta and context-use trend alongside the existing totals
      line, derived from the usage events already parsed today.
  - Policy: direct execution after preview; use existing usage events, and if
    they prove insufficient, record the limitation as Objective evidence rather
    than adding instrumentation in this Objective.
  - Evidence: delivered and merged — context-window extraction
    (`contextWindow` / `context_window`) in
    `ts/packages/infra/foundation/src/terminal/runner-usage.ts` and trend
    derivation (latest turn, peak prompt/total tokens, optional context
    window) in `runner-subagents/extension-usage.ts` both survive on trunk.
    The PR #3412 redesign removed the separate `trend:` line (latest
    input/output delta plus context percentage) and now appends
    `peak <n>` to the tokens line in `fleet/detail-render.ts`; the richer
    derivation remains available to future rendering decisions.
- [x] Parse actual top-level Pi session message events in the detail timeline
      Manual smoke showed explorer subagent sessions emit top-level `message`
      events whose assistant content contains `toolCall` blocks, followed by
      `message.role = "toolResult"` records. The timeline/current-action and
      JSON-event progress parsers recognize that existing Pi session shape in
      addition to `message_end` / `turn_end` / `agent_end` and
      `tool_execution_*` shapes.
  - Policy: direct execution after preview; treat this as supporting an existing
    Pi session JSONL shape, not a new event protocol. Stay inside existing
    session JSONL parsing, navigator rendering, and targeted tests.
  - Evidence: landed on trunk and still live — `runner-subagents/activity.ts`
    (`toolResultPreviewFromEvent`), `timeline.ts`, and `json-events.ts`
    extract assistant `toolCall` blocks and top-level `toolResult` messages,
    with targeted timeline/parser/fleet navigator tests covering assistant
    text, thinking blocks not being exposed, pending current-action tools,
    completed and unmatched tool results, nonzero turn/tool header counts, and
    detail timeline entries for a sanitized top-level-message-only session.
    Manual navigator re-smoke against a real session remains unrecorded.

## Parked

- [ ] Timeline enrichment: per-entry timestamps/durations, +N/-N on edits, failure markers
      Largely delivered out-of-band by trunk's PR #3412 redesign: timeline
      entries now carry timestamps, running/ok/error states, durations, and
      tool-specific displays. Per-edit +N/-N remains absent; only that residue
      would be new work here.
- [ ] Structured prompt panel (Assignment/Constraints/Inputs)
      Only viable where dispatch produces structured prompts (objective runner
      steps); freeform prompts would require fragile parsing.
- [ ] Cancel controls for one agent or the whole subagent fleet
      Add an explicit, confirmed actuator path that can cancel an individual
      subagent from its detail screen and cancel all currently running subagents
      from the fleet view. Abort plumbing exists
      (`runner-subagents/abort-signals.ts`), but confirmation, parent
      recovery/checkpoint semantics, and post-cancel status reporting need a
      deliberate slice of their own.
- [ ] Runner-emitted semantic events (validation passed, checkpoint written, commit created)
      Requires a protocol change on the emit side; UI-side inference from prose
      is explicitly rejected. Upgrade to Work only with a real protocol design.
