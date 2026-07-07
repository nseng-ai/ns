# Live Worktree State Panel Implemented

## Summary

The local branch `live-worktree-diff-summary-panel` implements the second subagent-run-observability dashboard slice. The fleet navigator task detail view now reads local git state through an injected Pi exec seam, parses `git status --short`, unstaged `git diff --numstat --`, and staged `git diff --cached --numstat --`, and renders a compact `worktree state` panel with per-file status plus `+N/-N` stats.

The panel is intentionally labeled as worktree/shared-checkout state, not subagent-owned changes. Parent-session detail views omit the panel for this slice.

## Objective Impact

The second completion criterion — live worktree/diff summary panel — is now tracked as complete in the roadmap. Running task detail views refresh the panel through the existing detail polling cadence. Stopped/done task details load a snapshot when opened or manually reloaded, without widening polling to all stopped tasks.

Git read failures are represented as bounded unavailable snapshots so timeline/session rendering remains usable.

## Evidence

Validation run locally:

- `pnpm --dir ts --filter @nseng-ai/ns-pi-subagents test`
- `pnpm --dir ts --filter @nseng-ai/ns-pi-subagents check`
- `pnpm --dir ts run lint`
- `pnpm --dir ts run fmt:check`

Targeted coverage added for status/numstat parsing, clean worktrees, binary numstat entries, git command failure shaping, task-detail panel rendering, running refresh updates, and unavailable worktree state keeping the timeline visible.

No interactive TUI smoke was run in this session.

## Findings / Follow-Ups

- The first implementation keeps git command cost simple: three local read-only git commands on the existing running-detail cadence.
- Rename/path edge cases are intentionally conservative; the parser preserves git's displayed path rather than trying to fully normalize rename syntax.
- A later attribution design would need a reliable dispatch-time baseline; this slice deliberately does not infer subagent-only ownership from shared worktree state.
