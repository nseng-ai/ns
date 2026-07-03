# Objective Runner v1

## Thesis

Implement the Objective Runner step workflow accepted in ADR 0022 (`docs/adr/0022-autoobjective-objective-runner.md`): a portable, Objective-owned core that runs one child implementation slice, deterministically verifies it, commits it with provenance trailers, and returns a two-zone Runner Checkpoint so the parent LM makes every between-step decision. This replaces the frozen Pi-only `/objective:autopilot` prototype (`.pi/extensions/objective-autopilot.ts`) with a CLI-first surface: `sdl objective exec runner-step <slug>`.

ADR 0022 is the durable record of the design contract (invocation surface, gateway boundaries, child report contract, five-part verification gate, commit trailers, checkpoint zones, parent-initiated recovery, parent-side Semantic Updates). This Objective owns delivering it and records the implementation-level decisions the ADR does not carry.

ADR 0024 supersedes ADR 0022 in part after dogfooding: the invocation surface decomposes into two Pi-free bookends (`sdl objective exec runner-begin` / `runner-finish`) around a parent-dispatched harness subagent, and the child report moves from a marker block to a JSON file. The gate, provenance trailers, checkpoint trust model, recovery philosophy, and parental Semantic Update judgment stand unchanged. This Objective now completes through the decomposed flow; the legacy blocking `runner-step` and its child-session machinery are deleted as the final slice alongside the frozen autopilot extension.

## Scope

- Grow the shared `GitGateway` contract (`ts/packages/infra/git/src/contract.ts`) with the neutral mutation surface the runner needs — porcelain-derived status facts, staging, commit — with `InMemoryGitGateway` fake parity (precedent: `createBranchAtHead`).
- Add a generic, harness-neutral, streaming `ChildSessionGateway` to `@sdl/objective` (event stream plus outcome promise) as a required injected dependency, plus a scripted `FakeChildSessionGateway` in the package testing surface. No Pi coupling in the package — not even a `pi` subprocess spawn.
- Build the runner core in `@sdl/objective`: runner context seam (git, graphite-branch, storage, child-session, command-exec), thin prompt construction (points the child at the Objective and existing skills; no inlined context), marker-block report parsing (typed header including proposed commit message; mandated Summary / Objective Impact / Risks-Blockers / Follow-Ups / Validation sections), the five-part verification gate, commit with `Objective-Runner-Step` / `Objective-Runner-Mode: recover` trailers, and two-zone checkpoint rendering from typed `CheckpointFacts`.
- Ship `sdl objective exec runner-step <slug>` with `--recover`, `--guidance` (inline or file), `--model`, `--timeout`; clinkr exit codes (0 committed/stop, 1 blocked/verification-failed, 2 malfunction); checkpoint-only stdout, streamed progress on stderr.
- Implement the real Pi-subprocess adapter in the objective container's own Pi-coupled edge (the `pi` subpackage of `@sdl/objective`, `src/pi/child-session/`), composed into the exec command's context by host wiring. The originally named home no longer applies post-reorg: `@sdl-local/pi-tools` is a dependency-sink tier no other package may import, and the container's `pi` subpackage (the fold of the former `@sdl/objective-pi`) is the sanctioned Pi-coupled edge.
- Write the parent playbook skill (cross-harness parity: CLI + skill): interpreting checkpoints, choosing `--recover` vs reset vs hand-fix, and when a checkpoint warrants a Semantic Update via the `objective-update` workflow.
- Testing per the standing test-performance boundaries: fake-driven default lane exercising the real parse/gate/commit pipeline with only the LM scripted; scenario tests over the command surface (branch-context `cli-harness.ts` pattern); one small real-git integration-lane test; the Pi adapter validated by dogfooding, not default-lane tests.
- Dogfood `runner-step` on a real Objective, then delete the frozen autopilot extension as the final slice.

## Non-Goals

- No Pi command wrapper in v1 (additive presentation later; never canonical).
- No automatic LM recovery supervisor: reintroduction is evidence-gated policy per ADR 0022, never speculative.
- No batch/multi-step mode; if it ever returns it must be explicit lower-agency behavior.
- No structured runner configuration file (repo- or objective-level); runner policy stays objective-level prose.
- No non-Pi child adapters yet; the `ChildSessionGateway` seam exists precisely so a second harness or process model is a pure adapter swap when needed.
- No changes to the canonical Objective file contract, status model, or `objective-update` workflow; the runner gains no update-writing surface and the storage gateway stays read-only.
- No feature work in `.pi/extensions/objective-autopilot.ts` — it is frozen from now until its deletion slice.

## Completion Criteria

Close this Objective when:

- `sdl objective exec runner-step` implements the full ADR 0022 contract: both modes with their inverted preconditions, guidance in both forms, the five-part gate (including HEAD-unchanged in both modes and no tracking-evidence requirement), runner-authored commits with trailers, two-zone checkpoints for every terminal state, and clinkr-conformant exit codes.
- `@sdl/objective` contains no Pi dependency of any kind; the real dispatch adapter lives at a Pi-coupled edge and is injected by host composition.
- The fake-driven default-lane suite covers the happy path, each gate check failing individually, blocked/stop passthrough, malformed-report malfunction, and recover-mode preconditions; the integration lane covers real-git verify/stage/commit/trailers with a scripted child.
- The parent playbook skill exists and documents the checkpoint contract from the consumer side.
- At least one real Objective step (and ideally one recover cycle) has been dogfooded end-to-end.
- The frozen autopilot extension is deleted.

## Assumptions and Risks

Assumptions:

- The blocking-CLI model is acceptable to parent harnesses: a step can run many minutes and the parent's Bash invocation must tolerate that (streamed stderr progress mitigates).
- A child prompted with the standing rules will reliably produce the marker-block report with all mandated sections; report-integrity failures surface as exit-2 malfunctions the parent can see, so a drifting child prompt is diagnosable rather than silent.
- The `sdl` CLI host has (or can be given) a composition point where a Pi-coupled adapter can be injected into an exec command context defined inside `@sdl/objective` (see Open Questions — this is the main wiring risk).
- Removing the deterministic tracking-evidence gate is safe because the checkpoint restores a judging parent at every step boundary; the advisory Tracking Gate remains available.
- The existing branch-context/Graphite creation path remains the child's branching mechanism, so the runner never needs branch-creation mutations of its own.

Risks:

- Host-composition wiring for the injected dispatch adapter may require new plumbing in the repo-local extension mechanism; if it turns invasive, the adapter location decision (Pi-coupled edge, not `@sdl/objective`) must still hold — relocating the adapter into the capability package to dodge wiring pain would silently forfeit the harness/process-model option value the design bought.
- Parent-side Semantic Updates depend on child reports being rich enough; if dogfooding shows parents writing hollow updates, the fix is tightening the mandated report sections, not reinstating child-side tracking.
- The one-attempt-per-invocation recovery model may prove chatty for trivial failures; the evidence-gated path back to any automatic supervisor runs through this Objective's dogfooding notes, not ad-hoc scope creep.
- Freezing autopilot leaves the only working automation static during the build; a long v1 gestation increases pressure to patch the frozen prototype.

## Open Questions

- Where exactly does the sdl CLI host compose the real Pi dispatch adapter into the `runner-step` command context, given the command is defined in `@sdl/objective` and the adapter cannot be imported there? (Identified during design grilling; must be resolved in the exec-command slice.)
- Exact `--guidance` flag shape for the file form (`--guidance-file` vs one flag accepting `@path`).
- Which real Objective to use for the dogfooding slice.
