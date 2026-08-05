# Handoff: Diagnose recursive Flow land output capture in Pi

Continuation focus: Determine why `/ns:flow:land` appeared locked at its cleanup selection while captured stdout grew past 1 MB, repeatedly echoed Pi’s own live UI, and then flushed the accumulated terminal stream after landing completed.

## Context

This occurred on branch `fix-flow-graphite-metadata-contract` while landing PR #4120 from Pi. The command did reach the interactive “Land and choose cleanup for slot-07?” selection and ultimately reported `Land completed.`, but Pi’s CLI-command live display repeatedly appeared inside the command’s captured stdout. The displayed byte count grew from a few bytes to more than 1,180,000 bytes over roughly 23 seconds. This looks like a Pi CLI bridge/output-capture feedback loop rather than the Graphite metadata-envelope bug fixed by PR #4120.

## Current State

- PR #4120 remains reported open at head `e28e965e5068eb801ed61f4442f2ed158406254f` immediately after the observed run; revalidate because the landing operation may settle asynchronously.
- The worktree was clean and still on `fix-flow-graphite-metadata-contract` when this handoff was created.
- The earlier Graphite metadata contract fix was implemented, validated, submitted, made accountable, and its only review thread was resolved.
- No diagnosis or code change has yet been made for the recursive live-output behavior.
- The captured transcript strongly shows Pi UI/status text—including `[wt]`, `[gh]`, token status, the cleanup selection, and prior `$ ns flow land · stdout …` summaries—being re-read as child-command stdout.

## Decisions / Findings

- Treat this as a separate Pi CLI bridge bug, not as part of the Graphite metadata parsing fix.
- The likely starting point is `runRegisteredCliCommand` and `LiveCommandProgress`: the bridge passes `stdout`/`stderr` callbacks into `runCli`, emits live widgets/status, and later formats captured output. Investigate whether the in-process `ns flow land` command or interactive selection writes through process stdout while Pi’s TUI is rendering to that same stream, causing rendered frames to enter the command capture buffer.
- The symptom is consistent with recursive amplification: each live refresh includes the current captured-output summary and surrounding TUI; that rendered frame is captured as more stdout, making the next frame larger.
- Do not assume the command itself deadlocked. It was waiting for user selection while the output loop expanded, then completed after selection.
- Build a deterministic red-capable test before fixing. Existing CLI bridge tests already cover live widgets, selection, output counters, and hidden recent lines and are the best likely seam.

## Next Steps

1. Revalidate PR/branch state (`gh pr view 4120`, `git status`, `gt branch info`) without rerunning destructive landing.
2. Read the persisted Pi session log around the final `/ns:flow:land` invocation to identify event ordering and whether output chunks contain rendered TUI frames.
3. Trace `runRegisteredCliCommand` through its stdout/stderr collectors, `LiveCommandProgress`, selection callback, and final `emitCliCommandOutput` path.
4. Inspect how the Pi harness invokes the in-process ns CLI and whether process-level stdout is intercepted during interactive prompts.
5. Add a focused test reproducing selection while live progress is active and asserting that widget/status rendering never enters captured command stdout.
6. Fix the ownership boundary so TUI rendering and command stdout cannot feed each other; validate focused Pi runtime tests and the applicable TypeScript lanes.
7. Keep this diagnosis/fix separate from PR #4120 unless evidence proves that PR introduced it.

## Investigation Sources

- Source session ID: 019fd329-9759-7360-90fb-a8d1793889e1
- Source session log: /Users/schrockn/.pi/agent/sessions/--Users-schrockn-.local-state-ns-slots-repos-ns-worktrees-slot-07--/2026-08-05T18-22-26-137Z_019fd329-9759-7360-90fb-a8d1793889e1.jsonl
- Related files:
  - `ts/packages/incubating/hosts/pi/runtime/pi-runtime/src/commands/cli-extension.ts` — owns CLI invocation, capture callbacks, interactive selection bridging, live progress, and final output emission.
  - `ts/packages/incubating/hosts/pi/runtime/pi-runtime/src/commands/cli-command-live-progress.ts` — renders the live command widget and recent stdout/stderr summaries implicated in the feedback loop.
  - `ts/packages/incubating/hosts/pi/runtime/pi-runtime/src/commands/cli-command-trace.ts` — provides command trace paths/events that may reveal chunk and phase ordering.
  - `ts/packages/incubating/hosts/pi/runtime/pi-runtime/test/cli-command-extension.test.ts` — existing coverage for selection, live output counters, and hidden recent CLI lines; likely regression-test home.
  - `/var/folders/9f/tdmwr1s936g4_3px8t6cjs7h0000gn/T/pi-runner-subagents/session-AVHC8r/179fec7f-1ad7-4e92-a278-06698ef48c41.jsonl` — earlier production-diff reconnaissance for PR #4120; useful only to distinguish the metadata fix from this new Pi issue.
  - `/var/folders/9f/tdmwr1s936g4_3px8t6cjs7h0000gn/T/pi-runner-subagents/session-t2r3zq/8c82f5e9-091e-4975-bfe8-39e4b43757fe.jsonl` — earlier trace proving `flow cp` does not share the Graphite metadata path.

## Useful Commands / Files

- PR: https://github.com/nseng-ai/ns/pull/4120
- `gh pr view 4120 --json state,mergedAt,mergeCommit,headRefOid,url`
- `git status --short && git branch --show-current && git rev-parse HEAD`
- `rg -n 'running CLI command|waiting for selection|earlier recent CLI lines hidden' ts/packages/incubating/hosts/pi/runtime/pi-runtime`
- Focused test entry: `pnpm --dir ts exec vitest run packages/incubating/hosts/pi/runtime/pi-runtime/test/cli-command-extension.test.ts`
- Avoid rerunning `ns flow land` merely to reproduce until a disposable/non-mutating harness exists.
