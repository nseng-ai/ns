---
description: Run bounded fresh-slice Objective autopilot iterations via the objective-autopilot-workflow Workflow.
argument-hint: <slug> [--iterations N] [--submit] [--dry-run]
---

Parse `$ARGUMENTS` for this command:

- First bare token: the Objective `slug` (required). If missing, stop and ask the user for the
  slug instead of guessing or auto-selecting one.
- `--iterations N`: optional positive integer, default `1` — max slices to land this run.
- `--submit`: optional flag, default off — passes `--submit` down to `autopilot-land-slice`, which
  opens a real PR via `sdl flow submit --no-restack` when a slice lands. Since this is a real,
  visible external mutation, confirm with the user before launching when `--submit` is set and it
  was not already explicit in a prior turn.
- `--dry-run`: optional flag, default off — verifies only; the Workflow stops after the first
  verify/land check without staging, committing, or submitting anything.

Then launch the Workflow:

```
Workflow({
  name: "objective-autopilot-workflow",
  args: { slug, iterations, submit, dryRun }
})
```

This Workflow is a bounded, fresh-slice driver: it dispatches one slice-implementer subagent per
iteration (via the `objective-autopilot-slice` skill), then verifies and commits/submits each
finished slice through the deterministic `sdl objective exec autopilot-preflight` /
`autopilot-land-slice` CLI verbs — those verbs own all git truth and independently re-check live
repo state before ever staging or committing anything. See
`.claude/workflows/objective-autopilot-workflow.js` for the full safety model.

After the Workflow returns, relay its `summaries` to the user plainly (one line per iteration,
including any `stopped`/`violations` reason), and do not automatically start another autopilot run
without being asked again.
