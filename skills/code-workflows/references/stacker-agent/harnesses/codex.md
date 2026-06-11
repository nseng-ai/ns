# Codex adapter

Use this adapter after reading `generic.md`.

## Codex-specific notes

- Only use worker delegation when the current Codex environment and user
  request allow sub-agents or delegation.
- Map **run worker**, **follow up**, and **wait** to Codex's native
  agent/delegation tools.
- Keep the core protocol serial. One worker per slice, no parallel
  spawns.
- Ignore task-tracking steps from older versions of the skill. In
  Codex, progress can be kept in coordinator notes or user updates.
- Require the worker's final message to contain a
  `stacker-handoff/v1` JSON line plus short prose.
- For commit-series runs, keep the target branch in coordinator notes
  and fill the brief so the worker stays on that branch and creates one
  commit for the slice.

## Important constraint

If the current Codex environment only offers isolated or forked
workspaces for delegated workers, this skill is unsupported as written.
Do not pretend the slice was implemented merely because a worker
produced a patch description or advisory notes.
