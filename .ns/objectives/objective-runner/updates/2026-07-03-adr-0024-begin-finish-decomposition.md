# ADR 0024: step decomposed into runner-begin/runner-finish around a harness subagent

## Summary

Dogfooding the blocking `runner-step` showed the structural problem behind two rounds of observability patches: the CLI hosted a full agent session inside an opaque subprocess, and the NDJSON activity parser, timeout ladder, stderr tails, and heartbeat existed solely to observe a process the parent harness observes natively. ADR 0024 (superseding ADR 0022 in part) decomposes the step into two Pi-free bookends — `sdl objective exec runner-begin` (LBYL preconditions, report-path hygiene, step facts + subagent prompt) and `sdl objective exec runner-finish` (fail-closed facts/report validation, unchanged five-part gate, runner-owned commit with provenance trailers, two-zone checkpoint) — with the implementation session dispatched by the parent as a harness subagent and the child report written as a JSON file outside the worktree.

Trust-model invariants carried over intact: the child never commits, the parent (never the subagent) runs finish, verified facts stay runner-attested. Two structural guards are new: begin refuses a report path inside the repo worktree (report can never enter the gate's changed paths or the runner commit) and refuses a pre-existing report file (stale-report replay is impossible). Finish is terminal — a second run after `committed` deterministically fails `head-unchanged`/`worktree-dirty`. Usage/cost facts left the checkpoint (harness owns subagent cost; `exec-runner-subagent-usage` remains).

Shipped with the decomposition: `report-file.ts` JSON report schema (all-problems fail-closed validation), the `ObjectiveRunnerCoreContext` narrowing (preconditions/gate/commit are childSession-free), dual report-channel prompt construction, scenario suites for both commands, a real-git integration lane (begin → simulated subagent → finish → trailers; double-finish; parent-moved-HEAD), and rewritten `objective-runner-step` / `objective-autorun` skills. Read-only CLI bench drills against this repo verified wiring end to end.

## Objective Impact

- The delivery path for this Objective's remaining work changes shape: dogfooding and the final deletion slice now target the decomposed flow. The deletion slice grows to cover `exec-runner-step`, `ChildSessionGateway` + fake + event channel, the Pi child-session adapter, and marker-block report parsing, alongside the frozen autopilot extension.
- The parked "non-Pi child adapters" line is resolved differently than anticipated: dispatch left the CLI entirely, so no adapter tier is needed and the `ChildSessionGateway` option-value bet closes with the legacy command.
- The ADR 0022 open wiring question (host composition for the Pi adapter) dissolves for the new commands — both are plain command constants with no composition seam.

## Follow-Ups

- Dogfood the decomposed flow on a real Objective with at least one `--recover` cycle, then execute the deletion slice.
- Pre-existing roadmap drift noted, not fixed here: several `[ ]` rows describe runner-core work that already shipped on master; a rebaseline pass (objective-refresh) should reconcile them against reality.
