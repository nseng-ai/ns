# Objective Runner v1

## Thesis

Implement the Objective Runner step workflow accepted in ADR 0022 (`docs/adr/0022-autoobjective-objective-runner.md`): a portable, Objective-owned core that runs one child implementation slice, deterministically verifies it, commits it with provenance trailers, and returns a two-zone Runner Checkpoint so the parent LM makes every between-step decision. This replaces the frozen Pi-only `/objective:autopilot` prototype (`.pi/extensions/objective-autopilot.ts`) with a CLI-first surface under `ns objective exec` (the CLI was renamed `sdl` → `ji` mid-Objective, then `ji` → `ns` by ADR 0026).

ADR 0022 is the durable record of the design contract (invocation surface, gateway boundaries, child report contract, five-part verification gate, commit trailers, checkpoint zones, parent-initiated recovery, parent-side Semantic Updates). This Objective owns delivering it and records the implementation-level decisions the ADR does not carry.

ADR 0024 (`docs/adr/0024-objective-runner-begin-finish-decomposition.md`) supersedes ADR 0022 in part after dogfooding: the invocation surface decomposes into two Pi-free bookends (`ns objective exec runner-begin` / `runner-finish`) around a parent-dispatched harness subagent, and the child report moves from a marker block to a JSON file. The gate, provenance trailers, checkpoint trust model, recovery philosophy, and parental Semantic Update judgment stand unchanged. This Objective now completes through the decomposed flow; the legacy blocking `runner-step` and its child-session machinery remain the final deletion slice. The frozen `/objective:autopilot` extension is already gone — replaced by `/objective:autorun` on master (commit `b8c4052f3`, 2026-07-04) — so only the legacy TypeScript runner machinery is still owed for deletion.

The build slices are all implemented and landed on master: the decomposed bookend commands, the runner core, the (now legacy) blocking `runner-step` with its `ChildSessionGateway` and Pi adapter, both parent skills, and the fake-driven plus real-git test lanes. The runner has produced 32 verified `Objective-Runner-Step` commits on master (21 at the prior refresh, plus 11 more from 2026-07-04 Flow-land and roaster work). What remains is dogfooding evidence attributable to the decomposed begin→finish flow specifically (including a recover cycle) and the legacy-machinery deletion slice.

## Scope

- Grow the shared `GitGateway` contract (now `ts/packages/capability-kit/src/git/contract.ts` after the neutral-infra gateway relocation) with the neutral mutation surface the runner needs — porcelain-derived status facts, staging, commit — with `InMemoryGitGateway` fake parity (precedent: `createBranchAtHead`).
- Add a generic, harness-neutral, streaming `ChildSessionGateway` to `@nseng-ai/objectives` (event stream plus outcome promise) as a required injected dependency, plus a scripted `FakeChildSessionGateway` in the package testing surface. No Pi coupling in the package — not even a `pi` subprocess spawn. (Delivered; scheduled for deletion with the legacy command per ADR 0024.)
- Build the runner core in `@nseng-ai/objectives` (`ts/packages/capabilities/objectives/src/runner/`): preconditions, thin prompt construction (points the child at the Objective and existing skills; no inlined context), report handling (marker-block for the legacy flow, JSON `report-file.ts` for the decomposed flow), the five-part verification gate, commit with `Objective-Runner-Step` / `Objective-Runner-Mode: recover` trailers, and two-zone checkpoint rendering from typed facts.
- Ship the decomposed bookends per ADR 0024: `ns objective exec runner-begin` (LBYL preconditions, report-path hygiene, step facts + subagent prompt; `--recover`, `--guidance` with `@path` file form, `--report-path`) and `ns objective exec runner-finish` (fail-closed facts/report validation, unchanged gate, runner-owned commit, two-zone checkpoint; `--facts`, `--report`).
- Ship (and later delete) the legacy blocking `ns objective exec runner-step <slug>` with `--recover`, `--guidance`, `--model`, `--timeout`; clinkr exit codes (0 committed/stop, 1 blocked/verification-failed, 2 malfunction); checkpoint-only stdout, streamed progress on stderr.
- Implement the real Pi-subprocess adapter in the objective container's own Pi-coupled edge (the `pi` subpackage of `@nseng-ai/objectives`, `src/pi/child-session/`), composed into the exec command's context by host wiring. (Delivered for the legacy command; deleted with it. `@internal/pi-tools` — the former `@sdl-local/pi-tools` — is a dependency-sink tier no other package may import; its `runner-subagents` region at `ts/packages/internal/pi-tools/src/runner-subagents/` hosts the harness-side subagent dispatch machinery.)
- Write the parent playbook skills (cross-harness parity: CLI + skill): `objective-runner-step` for one begin → dispatch-subagent → finish cycle and `objective-autorun` for the judgment-gated loop over cycles, both interpreting checkpoints, choosing `--recover` vs reset vs hand-fix, and routing Semantic Updates through `objective-update`.
- Testing per the standing test-performance boundaries: fake-driven default lane exercising the real parse/gate/commit pipeline with only the LM scripted; scenario tests over the command surface (branch-context `cli-harness.ts` pattern); small real-git integration-lane tests; the Pi adapter validated by dogfooding, not default-lane tests.
- Dogfood the runner on real Objectives, then delete the legacy machinery as the final slice (the frozen autopilot extension is already deleted).

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
- The decomposed commands are Pi-free, and Pi coupling in `@nseng-ai/objectives` is confined to the container's sanctioned `pi` subpackage; the legacy Pi child-session adapter there goes with the deletion slice. — The decomposed commands are plain command constants with no composition seam; the adapter (`src/pi/child-session/pi-child-session-gateway.ts`) survives only as legacy.
- The fake-driven default-lane suite covers the happy path, gate-check failures, blocked/stop passthrough, malformed-report malfunction, and recover-mode preconditions; the integration lane covers real-git verify/stage/commit/trailers with a scripted child. — Implemented (`test/unit/runner/`, `test/integration/runner-step-git.test.ts`, `runner-finish-git.test.ts`).
- The parent playbook skills exist and document the checkpoint contract from the consumer side. — Implemented (`skills/objective-runner-step/SKILL.md`, `skills/objective-autorun/SKILL.md`).
- The decomposed begin→finish flow has been dogfooded end-to-end on at least one real Objective step, ideally including one recover cycle, with findings recorded here. — Not yet evidenced with confidence; 32 verified runner-step commits landed on master, and the 11 newest (2026-07-04, after `/objective:autopilot` was retired for `/objective:autorun`) plausibly used the decomposed flow, but commit trailers do not distinguish flows and the legacy `exec-runner-step` CLI is still wired, so decomposed-flow dogfooding is not proven. No `Objective-Runner-Mode: recover` commit exists anywhere in history.
- The legacy machinery is deleted: `exec-runner-step` (`src/ns/commands/exec-runner-step.ts`, still registered in `repo-local-ns-extension.ts`), `ChildSessionGateway` + fake + event channel (`src/runner/child-session.ts`, `fake-child-session.ts`, `event-channel.ts`), the Pi child-session adapter (`src/pi/child-session/`), and marker-block report parsing (`src/runner/report-marker.ts`) — all verified still present at HEAD, carrying `ADR0024-LEGACY-DELETE` markers. `exec-runner-subagent-usage` stays. (The frozen `.pi/extensions/objective-autopilot.ts` deletion target is already done.)

## Assumptions and Risks

Assumptions:

- The 32 landed `Objective-Runner-Step` commits (21 at the prior refresh — flow-deepening-round-2 ×14, objective-edges ×7 — plus 11 more from 2026-07-04 Flow-land and roaster work) demonstrate the gate/commit/checkpoint pipeline at scale, but no commit's flow (legacy blocking vs decomposed bookends) is attributable from commit evidence alone; treat decomposed-flow dogfooding as still owed rather than inferring it from timing, even though the newest batch postdates the `/objective:autorun` cutover.
- A subagent prompted with the standing rules will reliably produce the JSON report with all mandated sections; report-integrity failures surface as fail-closed finish malfunctions the parent can see, so a drifting prompt is diagnosable rather than silent.
- Removing the deterministic tracking-evidence gate is safe because the checkpoint restores a judging parent at every step boundary; the advisory Tracking Gate remains available.
- The existing branch-context/Graphite creation path remains the child's branching mechanism, so the runner never needs branch-creation mutations of its own.

Risks:

- Parent-side Semantic Updates depend on subagent reports being rich enough; if dogfooding shows parents writing hollow updates, the fix is tightening the mandated report sections, not reinstating child-side tracking.
- The one-attempt-per-invocation recovery model may prove chatty for trivial failures; the evidence-gated path back to any automatic supervisor runs through this Objective's dogfooding notes, not ad-hoc scope creep. No recover cycle has occurred yet, so this remains untested.
- The full legacy runner-step machinery is still in the tree (`exec-runner-step` and its `ChildSessionGateway`/event-channel/Pi-adapter/marker-parse deps, still wired into `repo-local-ns-extension.ts`); every day it persists is surface an agent can wrongly reach for. The deletion slice is the mitigation and it is gated only on decomposed-flow dogfooding mileage. The frozen autopilot extension — one earlier facet of this risk — has already been removed.

## Open Questions

- Which real Objective to use for the decomposed-flow dogfooding step, and whether a recover cycle can be provoked cheaply if none occurs naturally.
- Whether any already-landed runner-step commits exercised the decomposed flow — the objective-edges steps (7 commits, 2026-07-03) and especially the 2026-07-04 Flow-land/roaster batch (11 commits, landed after the `/objective:autorun` cutover) plausibly did, but neither those records' updates nor commit trailers distinguish the flow, and the legacy `exec-runner-step` CLI stayed wired. If any is confirmed decomposed, the dogfooding criterion narrows to the recover cycle plus findings recorded here.
