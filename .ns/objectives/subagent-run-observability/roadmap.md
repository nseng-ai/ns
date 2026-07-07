# Roadmap

## Work

- [ ] Current-action pane with heartbeat/staleness and auto-refresh in the detail view
      Derive the in-flight action (thinking vs named tool + command/path, elapsed
      time, last output line) from the session JSONL tail as a pure function next
      to `timeline.ts`; add periodic re-read of the session tail while the detail
      view is open so "quiet Nm" staleness is honest. Watch polling cost on large
      session files (tail-read or size-gate the re-parse).
  - Policy: direct execution after preview; keep the slice inside existing
    session JSONL parsing and navigator refresh behavior.
  - Evidence: targeted tests for pure current-action/staleness derivation plus
    manual navigator smoke notes for live refresh behavior.
- [ ] Live worktree/diff summary panel
      `git status --short` plus per-file +N/-N in the detail view, refreshed with
      the same cadence. Handle shared-worktree commingling by labeling the panel as
      honest "worktree state"; do not promise subagent-only attribution unless a
      later scoped design adds a reliable baseline.
  - Policy: direct execution after preview using honest worktree-state labeling.
  - Evidence: targeted tests or fakes for git-output parsing plus a smoke note
    showing status and per-file stats in the detail view.
- [ ] Post-run summary state
      When the run stops, flip the detail view from watch to judge: diff stat,
      commit created (if any, via HEAD baseline captured in extension-local
      fleet/run tracking), exit status, last error. Supports the
      parent-judges-checkpoint loop in the objective runner.
  - Policy: direct execution after preview; keep HEAD-baseline capture local to
    the extension and do not change runner dispatch semantics or external
    Git/Graphite behavior.
  - Evidence: targeted tests for post-run summary derivation plus manual smoke
    against a completed runner subagent session.
- [ ] Token/context trend
      Per-turn token delta and context-use trend alongside the existing totals
      line, derived from the usage events already parsed today.
  - Policy: direct execution after preview; use existing usage events, and if
    they prove insufficient, record the limitation as Objective evidence rather
    than adding instrumentation in this Objective.
  - Evidence: targeted Vitest coverage for token/context trend derivation and
    relevant package checks passed.

## Parked

- [ ] Timeline enrichment: per-entry timestamps/durations, +N/-N on edits, failure markers
      Incremental win on the existing timeline; deferred until the four live
      slices land.
- [ ] Structured prompt panel (Assignment/Constraints/Inputs)
      Only viable where dispatch produces structured prompts (objective runner
      steps); freeform prompts would require fragile parsing.
- [ ] Kill/abort control from the detail screen
      Turns the screen from observer into actuator; abort plumbing exists
      (`runner-subagents/abort-signals.ts`) but confirm/recover semantics need a
      deliberate slice of their own.
- [ ] Runner-emitted semantic events (validation passed, checkpoint written, commit created)
      Requires a protocol change on the emit side; UI-side inference from prose
      is explicitly rejected. Upgrade to Work only with a real protocol design.
