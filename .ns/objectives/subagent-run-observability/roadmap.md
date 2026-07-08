# Roadmap

## Work

- [x] Current-action pane with heartbeat/staleness and auto-refresh in the detail view
      Derive the in-flight action (thinking vs named tool + command/path, elapsed
      time, last output line) from the session JSONL tail as a pure function next
      to `timeline.ts`; add periodic re-read of the session tail while the detail
      view is open so "quiet Nm" staleness is honest. Watch polling cost on large
      session files (tail-read or size-gate the re-parse).
  - Policy: direct execution after preview; keep the slice inside existing
    session JSONL parsing and navigator refresh behavior.
  - Evidence: local branch diff `master...HEAD` adds current-action extraction in
    `timeline.ts`, running-detail polling and heartbeat rendering in `navigator.ts`,
    and targeted navigator/timeline tests; PR #3213 is open evidence for the slice.
- [x] Live worktree/diff summary panel
      `git status --short` plus per-file +N/-N in the detail view, refreshed with
      the same cadence. Handle shared-worktree commingling by labeling the panel as
      honest "worktree state"; do not promise subagent-only attribution unless a
      later scoped design adds a reliable baseline.
  - Policy: direct execution after preview using honest worktree-state labeling.
  - Evidence: local branch diff adds a fake-backed git worktree reader/parser,
    renders the task-detail worktree state panel, and covers running refresh,
    parent omission, unavailable state, clean state, and binary stats in targeted
    tests. Validation run: `pnpm --dir ts --filter @nseng-ai/ns-pi-subagents test`,
    `pnpm --dir ts --filter @nseng-ai/ns-pi-subagents check`, `pnpm --dir ts run lint`,
    and `pnpm --dir ts run fmt:check`.
- [x] Post-run summary state
      When the run stops, flip the detail view from watch to judge: diff stat,
      commit created (if any, via HEAD baseline captured in extension-local
      fleet/run tracking), exit status, last error. Supports the
      parent-judges-checkpoint loop in the objective runner.
  - Policy: direct execution after preview; keep HEAD-baseline capture local to
    the extension and do not change runner dispatch semantics or external
    Git/Graphite behavior.
  - Evidence: current PR #3220 / local branch diff from `live-worktree-diff-summary-panel...HEAD`
    adds read-only HEAD snapshot capture in fleet tracking, renders a completed-run
    summary with final status, last diagnostic, commit movement, and shared
    worktree state in `navigator.ts`, and adds targeted fleet navigator/tracking
    tests. Manual navigator smoke remains unrecorded.
- [x] Token/context trend
      Per-turn token delta and context-use trend alongside the existing totals
      line, derived from the usage events already parsed today.
  - Policy: direct execution after preview; use existing usage events, and if
    they prove insufficient, record the limitation as Objective evidence rather
    than adding instrumentation in this Objective.
  - Evidence: local branch diff adds context-window extraction to foundation
    runner usage parsing, derives latest-turn/peak prompt trend metadata in
    `ns-pi-subagents`, and renders a compact detail-header trend line. Targeted
    validation passed: `pnpm --dir ts --filter @nseng-ai/foundation test --
    runner-usage`, `pnpm --dir ts --filter @nseng-ai/ns-pi-subagents test`,
    `pnpm --dir ts --filter @nseng-ai/ns-pi-subagents check`, plus workspace
    `pnpm --dir ts run fmt:check`, `pnpm --dir ts run lint`, and
    `pnpm --dir ts run check`.

## Parked

- [ ] Timeline enrichment: per-entry timestamps/durations, +N/-N on edits, failure markers
      Incremental win on the existing timeline; deferred until the four live
      slices land.
- [ ] Structured prompt panel (Assignment/Constraints/Inputs)
      Only viable where dispatch produces structured prompts (objective runner
      steps); freeform prompts would require fragile parsing.
- [ ] Cancel controls for one agent or the whole subagent fleet
      Add an explicit, confirmed actuator path that can cancel an individual
      subagent from its detail screen and cancel all currently running subagents
      from the fleet view. Abort plumbing exists (`runner-subagents/abort-signals.ts`),
      but confirmation, parent recovery/checkpoint semantics, and post-cancel
      status reporting need a deliberate slice of their own.
- [ ] Runner-emitted semantic events (validation passed, checkpoint written, commit created)
      Requires a protocol change on the emit side; UI-side inference from prose
      is explicitly rejected. Upgrade to Work only with a real protocol design.
