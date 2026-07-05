# Objective Runner v1

## Thesis

Implement the Objective Runner step workflow accepted in ADR 0022 (`docs/adr/0022-autoobjective-objective-runner.md`): a portable, Objective-owned core that runs one child implementation slice, deterministically verifies it, commits it with provenance trailers, and returns a two-zone Runner Checkpoint so the parent LM makes every between-step decision. This replaces the frozen Pi-only `/objective:autopilot` prototype (`.pi/extensions/objective-autopilot.ts`) with a CLI-first surface under `ns objective exec` (the CLI was renamed `sdl` → `ji` mid-Objective, then `ji` → `ns` by ADR 0026).

ADR 0022 is the durable record of the design contract (invocation surface, gateway boundaries, child report contract, five-part verification gate, commit trailers, checkpoint zones, parent-initiated recovery, parent-side Semantic Updates). This Objective owns delivering it and records the implementation-level decisions the ADR does not carry.

ADR 0024 (`docs/adr/0024-objective-runner-begin-finish-decomposition.md`) supersedes ADR 0022 in part after dogfooding: the invocation surface decomposes into two Pi-free bookends (`ns objective exec runner-begin` / `runner-finish`) around a parent-dispatched harness subagent, and the child report moves from a marker block to a JSON file. The gate, provenance trailers, checkpoint trust model, recovery philosophy, and parental Semantic Update judgment stand unchanged. The frozen `/objective:autopilot` extension is already gone — replaced by `/objective:autorun` on master (commit `b8c4052f3`, 2026-07-04) — and the legacy blocking runner-step TypeScript machinery has now been deleted.

The build slices are all implemented: the decomposed bookend commands, the runner core, both parent skills, the fake-driven plus real-git test lanes, and the final legacy-machinery deletion slice. Product steering accepted dogfooding as sufficient to proceed with deletion. No recover-mode dogfooding evidence was produced before deletion; that remains a historical caveat for future recovery-policy work, not a blocker to this Objective's legacy deletion.

## Scope

- Grow the shared `GitGateway` contract (now `ts/packages/capability-kit/src/git/contract.ts` after the neutral-infra gateway relocation) with the neutral mutation surface the runner needs — porcelain-derived status facts, staging, commit — with `InMemoryGitGateway` fake parity (precedent: `createBranchAtHead`).
- Add a generic, harness-neutral, streaming `ChildSessionGateway` to `@nseng-ai/objectives` (event stream plus outcome promise) as a required injected dependency, plus a scripted `FakeChildSessionGateway` in the package testing surface. No Pi coupling in the package — not even a `pi` subprocess spawn. (Delivered for the legacy command, then deleted per ADR 0024.)
- Build the runner core in `@nseng-ai/objectives` (`ts/packages/capabilities/objectives/src/runner/`): preconditions, thin prompt construction (points the child at the Objective and existing skills; no inlined context), JSON report handling, the five-part verification gate, commit with `Objective-Runner-Step` / `Objective-Runner-Mode: recover` trailers, and two-zone checkpoint rendering from typed facts.
- Ship the decomposed bookends per ADR 0024: `ns objective exec runner-begin` (LBYL preconditions, report-path hygiene, step facts + subagent prompt; `--recover`, `--guidance` with `@path` file form, `--report-path`) and `ns objective exec runner-finish` (fail-closed facts/report validation, unchanged gate, runner-owned commit, two-zone checkpoint; `--facts`, `--report`).
- Ship and delete the legacy blocking `ns objective exec runner-step <slug>` with `--recover`, `--guidance`, `--model`, `--timeout`; clinkr exit codes (0 committed/stop, 1 blocked/verification-failed, 2 malfunction); checkpoint-only stdout, streamed progress on stderr.
- Implement and delete the real Pi-subprocess adapter in the objective container's own Pi-coupled edge. `@internal/pi-tools` — the former `@sdl-local/pi-tools` — is a dependency-sink tier no other package may import; its `runner-subagents` region at `ts/packages/internal/pi-tools/src/runner-subagents/` hosts the harness-side subagent dispatch machinery.
- Write the parent playbook skills (cross-harness parity: CLI + skill): `objective-runner-step` for one begin → dispatch-subagent → finish cycle and `objective-autorun` for the judgment-gated loop over cycles, both interpreting checkpoints, choosing `--recover` vs reset vs hand-fix, and routing Semantic Updates through `objective-update`.
- Testing per the standing test-performance boundaries: fake-driven default lane exercising the real parse/gate/commit pipeline with only the LM scripted; scenario tests over the command surface (branch-context `cli-harness.ts` pattern); small real-git integration-lane tests; the Pi adapter validated by dogfooding, not default-lane tests.
- Dogfood the runner on real Objectives, then delete the legacy machinery as the final slice (complete; the frozen autopilot extension is also deleted).

## Non-Goals

- No Pi command wrapper in v1 (additive presentation later; never canonical).
- No automatic LM recovery supervisor: reintroduction is evidence-gated policy per ADR 0022, never speculative.
- No batch/multi-step mode; if it ever returns it must be explicit lower-agency behavior.
- No structured runner configuration file (repo- or objective-level); runner policy stays objective-level prose.
- No non-Pi child adapters: originally deferred behind the `ChildSessionGateway` seam, now moot per ADR 0024 — dispatch left the CLI entirely, so harness portability needs no adapter tier and the seam is deleted with the legacy command.
- No changes to the canonical Objective file contract, status model, or `objective-update` workflow; the runner gains no update-writing surface and the storage gateway stays read-only.
- No revival of the retired `/objective:autopilot` prototype — its extension (`.pi/extensions/objective-autopilot.ts`) is already deleted, replaced by `/objective:autorun`; the runner's parent surface stays the decomposed bookends plus the two playbook skills.

## Completion Criteria

Close this Objective when:

- `ns objective exec runner-begin` / `runner-finish` implement the ADR 0024 contract: LBYL preconditions and report-path hygiene in begin (report path outside the worktree, never pre-existing), fail-closed report validation, the five-part gate (including HEAD-unchanged and no tracking-evidence requirement), runner-authored commits with trailers, two-zone checkpoints for every terminal state, and terminal finish (a second finish after `committed` deterministically fails). — Implemented; scenario suites `exec-runner-begin.test.ts` / `exec-runner-finish.test.ts` and real-git `runner-finish-git.test.ts` cover it.
- The decomposed commands are Pi-free, and Pi coupling in `@nseng-ai/objectives` no longer includes the legacy Pi child-session adapter. — The decomposed commands are plain command constants with no composition seam; `src/pi/child-session/` was deleted with the legacy command.
- The fake-driven default-lane suite covers the happy path, gate-check failures, blocked/stop passthrough, malformed-report malfunction, and recover-mode preconditions; the integration lane covers real-git verify/stage/commit/trailers. — Implemented (`test/unit/runner/`, `test/integration/runner-finish-git.test.ts`).
- The parent playbook skills exist and document the checkpoint contract from the consumer side. — Implemented (`skills/objective-runner-step/SKILL.md`, `skills/objective-autorun/SKILL.md`).
- The decomposed begin→finish flow has been dogfooded end-to-end on real Objective work sufficiently for the final deletion slice. — Accepted by product steering on 2026-07-05; no recover-mode dogfooding evidence exists, so recover remains a historical caveat for future policy design rather than a deletion blocker.
- The legacy machinery is deleted: `exec-runner-step`, `ChildSessionGateway` + fake + event channel, the Pi child-session adapter, and marker-block report parsing are gone from the code, tests, package exports, and repo-local extension manifests. `exec-runner-subagent-usage` stays. (The frozen `.pi/extensions/objective-autopilot.ts` deletion target is already done.)

## Assumptions and Risks

Assumptions:

- The 32 landed `Objective-Runner-Step` commits (21 at the prior refresh — flow-deepening-round-2 ×14, objective-edges ×7 — plus 11 more from 2026-07-04 Flow-land and roaster work) demonstrate the gate/commit/checkpoint pipeline at scale. Product steering accepted dogfooding as sufficient for deleting the legacy surface even though old commit trailers do not distinguish legacy blocking from decomposed bookends.
- A subagent prompted with the standing rules will reliably produce the JSON report with all mandated sections; report-integrity failures surface as fail-closed finish malfunctions the parent can see, so a drifting prompt is diagnosable rather than silent.
- Removing the deterministic tracking-evidence gate is safe because the checkpoint restores a judging parent at every step boundary; the advisory Tracking Gate remains available.
- The existing branch-context/Graphite creation path remains the child's branching mechanism, so the runner never needs branch-creation mutations of its own.

Risks:

- Parent-side Semantic Updates depend on subagent reports being rich enough; if dogfooding shows parents writing hollow updates, the fix is tightening the mandated report sections, not reinstating child-side tracking.
- The one-attempt-per-invocation recovery model may prove chatty for trivial failures; the evidence-gated path back to any automatic supervisor runs through future dogfooding notes, not ad-hoc scope creep. No recover cycle has occurred yet, so this remains untested.
- The legacy runner-step surface has been removed; the main remaining risk is stale prose or agent memory pointing at the deleted blocking command rather than the decomposed bookends.

## Open Questions

- What future recover-mode dogfooding reveals about the parked automatic-supervisor question now that the blocking command is gone.
