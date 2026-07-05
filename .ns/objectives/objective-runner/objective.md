# Objective Runner v1

## Thesis

Implement the Objective Runner step workflow accepted in ADR 0022 (`docs/adr/0022-autoobjective-objective-runner.md`): a portable, Objective-owned core that runs one child implementation slice, deterministically verifies it, commits it with provenance trailers, and returns a two-zone Runner Checkpoint so the parent LM makes every between-step decision. This replaces the frozen Pi-only `/objective:autopilot` prototype (`.pi/extensions/objective-autopilot.ts`) with a CLI-first surface under `ns objective exec` (the CLI was renamed `sdl` → `ji` mid-Objective, then `ji` → `ns` by ADR 0026).

ADR 0022 is the durable record of the design contract (invocation surface, gateway boundaries, child report contract, five-part verification gate, commit trailers, checkpoint zones, parent-initiated recovery, parent-side Semantic Updates). This Objective owns delivering it and records the implementation-level decisions the ADR does not carry.

ADR 0024 (`docs/adr/0024-objective-runner-begin-finish-decomposition.md`) supersedes ADR 0022 in part after dogfooding: the invocation surface decomposes into two Pi-free bookends (`ns objective exec runner-begin` / `runner-finish`) around a parent-dispatched harness subagent, and the child report moves from a marker block to a JSON file. The gate, provenance trailers, checkpoint trust model, recovery philosophy, and parental Semantic Update judgment stand unchanged. This Objective now completes through the decomposed flow; the legacy blocking `runner-step` and its child-session machinery are deleted as the final slice alongside the frozen autopilot extension.

The build slices are all implemented and landed on master: the decomposed bookend commands, the runner core, the (now legacy) blocking `runner-step` with its `ChildSessionGateway` and Pi adapter, both parent skills, and the fake-driven plus real-git test lanes. The runner has produced 21 verified `Objective-Runner-Step` commits on master across two real Objectives. What remains is dogfooding evidence for the decomposed begin→finish flow specifically (including a recover cycle) and the final deletion slice.

## Scope

- Grow the shared `GitGateway` contract (now `ts/packages/capability-kit/src/git/contract.ts` after the neutral-infra gateway relocation) with the neutral mutation surface the runner needs — porcelain-derived status facts, staging, commit — with `InMemoryGitGateway` fake parity (precedent: `createBranchAtHead`).
- Add a generic, harness-neutral, streaming `ChildSessionGateway` to `@ns/objective` (event stream plus outcome promise) as a required injected dependency, plus a scripted `FakeChildSessionGateway` in the package testing surface. No Pi coupling in the package — not even a `pi` subprocess spawn. (Delivered; scheduled for deletion with the legacy command per ADR 0024.)
- Build the runner core in `@ns/objective` (`ts/packages/capabilities/objectives/src/runner/`): preconditions, thin prompt construction (points the child at the Objective and existing skills; no inlined context), report handling (marker-block for the legacy flow, JSON `report-file.ts` for the decomposed flow), the five-part verification gate, commit with `Objective-Runner-Step` / `Objective-Runner-Mode: recover` trailers, and two-zone checkpoint rendering from typed facts.
- Ship the decomposed bookends per ADR 0024: `ns objective exec runner-begin` (LBYL preconditions, report-path hygiene, step facts + subagent prompt; `--recover`, `--guidance` with `@path` file form, `--report-path`) and `ns objective exec runner-finish` (fail-closed facts/report validation, unchanged gate, runner-owned commit, two-zone checkpoint; `--facts`, `--report`).
- Ship (and later delete) the legacy blocking `ns objective exec runner-step <slug>` with `--recover`, `--guidance`, `--model`, `--timeout`; clinkr exit codes (0 committed/stop, 1 blocked/verification-failed, 2 malfunction); checkpoint-only stdout, streamed progress on stderr.
- Implement the real Pi-subprocess adapter in the objective container's own Pi-coupled edge (the `pi` subpackage of `@ns/objective`, `src/pi/child-session/`), composed into the exec command's context by host wiring. (Delivered for the legacy command; deleted with it. `@internal/pi-tools` — the former `@sdl-local/pi-tools` — is a dependency-sink tier no other package may import; its `runner-subagents` region hosts the harness-side subagent dispatch machinery.)
- Write the parent playbook skills (cross-harness parity: CLI + skill): `objective-runner-step` for one begin → dispatch-subagent → finish cycle and `objective-autorun` for the judgment-gated loop over cycles, both interpreting checkpoints, choosing `--recover` vs reset vs hand-fix, and routing Semantic Updates through `objective-update`.
- Testing per the standing test-performance boundaries: fake-driven default lane exercising the real parse/gate/commit pipeline with only the LM scripted; scenario tests over the command surface (branch-context `cli-harness.ts` pattern); small real-git integration-lane tests; the Pi adapter validated by dogfooding, not default-lane tests.
- Dogfood the runner on real Objectives, then delete the legacy machinery and the frozen autopilot extension as the final slice.

## Non-Goals

- No Pi command wrapper in v1 (additive presentation later; never canonical).
- No automatic LM recovery supervisor: reintroduction is evidence-gated policy per ADR 0022, never speculative.
- No batch/multi-step mode; if it ever returns it must be explicit lower-agency behavior.
- No structured runner configuration file (repo- or objective-level); runner policy stays objective-level prose.
- No non-Pi child adapters: originally deferred behind the `ChildSessionGateway` seam, now moot per ADR 0024 — dispatch left the CLI entirely, so harness portability needs no adapter tier and the seam is deleted with the legacy command.
- No changes to the canonical Objective file contract, status model, or `objective-update` workflow; the runner gains no update-writing surface and the storage gateway stays read-only.
- No feature work in `.pi/extensions/objective-autopilot.ts` — it is frozen from now until its deletion slice.

## Completion Criteria

Close this Objective when:

- `ns objective exec runner-begin` / `runner-finish` implement the ADR 0024 contract: LBYL preconditions and report-path hygiene in begin (report path outside the worktree, never pre-existing), fail-closed report validation, the five-part gate (including HEAD-unchanged and no tracking-evidence requirement), runner-authored commits with trailers, two-zone checkpoints for every terminal state, and terminal finish (a second finish after `committed` deterministically fails). — Implemented; scenario suites `exec-runner-begin.test.ts` / `exec-runner-finish.test.ts` and real-git `runner-finish-git.test.ts` cover it.
- The decomposed commands are Pi-free, and Pi coupling in `@ns/objective` is confined to the container's sanctioned `pi` subpackage; the legacy Pi child-session adapter there goes with the deletion slice. — The decomposed commands are plain command constants with no composition seam; the adapter survives only as legacy.
- The fake-driven default-lane suite covers the happy path, gate-check failures, blocked/stop passthrough, malformed-report malfunction, and recover-mode preconditions; the integration lane covers real-git verify/stage/commit/trailers with a scripted child. — Implemented (`test/unit/runner/`, `test/integration/runner-step-git.test.ts`, `runner-finish-git.test.ts`).
- The parent playbook skills exist and document the checkpoint contract from the consumer side. — Implemented (`skills/objective-runner-step/SKILL.md`, `skills/objective-autorun/SKILL.md`).
- The decomposed begin→finish flow has been dogfooded end-to-end on at least one real Objective step, ideally including one recover cycle, with findings recorded here. — Not yet evidenced; 21 verified runner-step commits landed on master, but the ones attributable with confidence used the legacy blocking flow, and no `Objective-Runner-Mode: recover` commit exists anywhere in history.
- The legacy machinery is deleted: `exec-runner-step`, `ChildSessionGateway` + fake + event channel, the Pi child-session adapter, marker-block report parsing, and the frozen `.pi/extensions/objective-autopilot.ts` (all verified still present). `exec-runner-subagent-usage` stays.

## Assumptions and Risks

Assumptions:

- The 21 landed `Objective-Runner-Step` commits (flow-deepening-round-2 ×14, objective-edges ×7) demonstrate the gate/commit/checkpoint pipeline at scale, but the objective-edges runs cannot be attributed to the decomposed flow from commit evidence alone; treat decomposed-flow dogfooding as still owed rather than inferring it from timing.
- A subagent prompted with the standing rules will reliably produce the JSON report with all mandated sections; report-integrity failures surface as fail-closed finish malfunctions the parent can see, so a drifting prompt is diagnosable rather than silent.
- Removing the deterministic tracking-evidence gate is safe because the checkpoint restores a judging parent at every step boundary; the advisory Tracking Gate remains available.
- The existing branch-context/Graphite creation path remains the child's branching mechanism, so the runner never needs branch-creation mutations of its own.

Risks:

- Parent-side Semantic Updates depend on subagent reports being rich enough; if dogfooding shows parents writing hollow updates, the fix is tightening the mandated report sections, not reinstating child-side tracking.
- The one-attempt-per-invocation recovery model may prove chatty for trivial failures; the evidence-gated path back to any automatic supervisor runs through this Objective's dogfooding notes, not ad-hoc scope creep. No recover cycle has occurred yet, so this remains untested.
- The frozen autopilot extension and the full legacy runner-step machinery are still in the tree; every day they persist is surface an agent can wrongly reach for. The deletion slice is the mitigation and it is gated only on decomposed-flow dogfooding mileage.

## Open Questions

- Which real Objective to use for the decomposed-flow dogfooding step, and whether a recover cycle can be provoked cheaply if none occurs naturally.
- Whether the objective-edges runner steps (7 commits, 2026-07-03) already exercised the decomposed flow — their timing overlaps the bookends landing, but neither that record's updates nor commit evidence distinguishes the flow used. If confirmed decomposed, the dogfooding criterion narrows to the recover cycle plus findings recorded here.
