# Current-Action Heartbeat Slice Landed

## Summary

The local branch `subagent-detail-current-action-heartbeat-autorefresh` advances the first roadmap slice for the subagent detail dashboard. Compared with `master...HEAD`, commit `85023fac4` updates `ts/packages/extensions/ns-pi-subagents/src/runner-subagents/timeline.ts` to report the current pending tool action, updates `ts/packages/extensions/ns-pi-subagents/src/fleet/navigator.ts` to poll running task detail views and render current action plus heartbeat quiet time, and adds targeted coverage in the navigator and timeline tests.

PR #3213 (`Add live polling and current-action tracking for subagent detail views`) is open evidence for the same slice. No uncommitted implementation changes were present when this update was written.

## Objective Impact

The first completion criterion — current-action pane with heartbeat/staleness backed by auto-refresh while the detail view is open — is now tracked as complete in the roadmap. The branch evidence confirms the Objective's assumption that existing session JSONL is sufficient for current-action derivation without a new runner event protocol.

The polling-cost risk is not fully eliminated: this slice tracks session content signatures so heartbeat quiet time resets only when content changes, but it still periodically re-reads and re-parses the session file. Tail-reading or size-gated parsing remains a possible follow-up if real large sessions cause TUI jank.

## Follow-Ups

- Continue with the next unchecked dashboard slice: live worktree/diff summary labeled honestly as shared worktree state.
- Preserve current-action/heartbeat behavior when adding shared refresh cadence for future panels.
- Record manual navigator smoke evidence when available; the current update is based on local branch diff and PR evidence, not a fresh interactive smoke note.
