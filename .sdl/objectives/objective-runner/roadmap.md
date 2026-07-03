# Roadmap

## Work

- [ ] Grow the shared `GitGateway` contract with runner-needed neutral mutations (porcelain-derived status facts, staging, commit) plus `InMemoryGitGateway` parity.
      Follow the `createBranchAtHead` precedent; runner-specific oddities like `git diff --check` stay on the command-exec seam, not the shared contract.
      Evidence: contract + fake updated with targeted tests passing.
- [ ] Define `ChildSessionGateway` (streaming: event iterable + outcome promise, harness-neutral request/outcome) in `@sdl/objective` and ship `FakeChildSessionGateway` in the package testing surface.
- [ ] Build the runner core: runner context seam (git, graphite-branch, storage, child-session, command-exec), thin child prompt construction, marker-block report parsing (typed header with proposed commit message; mandated Summary / Objective Impact / Risks-Blockers / Follow-Ups / Validation sections), five-part verification gate, commit with provenance trailers, two-zone checkpoint rendering from typed facts.
      Fake-driven tests: happy path, each gate check failing individually, blocked/stop passthrough, malformed report → malfunction, recover-mode gate variant.
- [ ] Ship `sdl objective exec runner-step <slug>` with `--recover`, `--guidance` (inline/file), `--model`, `--timeout`; clinkr exit codes (0 committed/stop, 1 blocked/verification-failed, 2 malfunction); checkpoint-only stdout and streamed stderr progress.
      Scenario tests over the command surface per the branch-context `cli-harness.ts` pattern; resolves the `--guidance` file-form flag shape.
- [ ] Implement the real Pi-subprocess dispatch adapter at the objective container's own Pi-coupled edge (the `pi` subpackage, `src/pi/child-session/`) and resolve the host composition point that injects it into the exec command context.
      This slice answers the open wiring question in `objective.md`; post-reorg the `runner-subagents` region of `@sdl-local/pi-tools` is a tier-illegal dependency sink, and the container's `pi` subpackage (the folded former `@sdl/objective-pi`) is the sanctioned adapter home.
- [x] Enrich real Pi child-session stderr progress for dogfooding visibility: elapsed activity prefixes, first-line live session JSONL pointer, compact tool argument/failure previews, and completed assistant/thinking block previews.
      Evidence: `pi-child-session-gateway` fake-process unit coverage exercises prefixed activity, pointer-first behavior, summaries/previews, block-preview de-dupe, and unchanged stderr passthrough/final-text capture.
- [ ] Add the small real-git integration-lane test: verify → stage → commit → trailers against a temp repo with a scripted child.
- [ ] Write the parent playbook skill: interpreting Runner Checkpoints (verified vs claimed zones), choosing `--recover` vs reset vs hand-fix, and when a checkpoint warrants a Semantic Update via `objective-update`.
- [x] Decompose the step into Pi-free bookends per ADR 0024: `sdl objective exec runner-begin` (LBYL preconditions, report-path hygiene, step facts + subagent prompt) and `sdl objective exec runner-finish` (fail-closed facts/report validation, unchanged gate, runner-owned commit, two-zone checkpoint), with the implementation session moved to a parent-dispatched harness subagent and the child report moved to a JSON file outside the worktree.
      Evidence: scenario suites `exec-runner-begin.test.ts` / `exec-runner-finish.test.ts`; real-git `runner-finish-git.test.ts` (begin → simulated subagent → finish → trailers, double-finish → deterministic verification-failed, parent-moved-HEAD); read-only CLI bench drills (missing/corrupt report malfunctions, stale-report and in-repo report-path refusals) against this repo.
- [x] Rewrite the parent skills to the decomposed flow: `objective-runner-step` (begin → dispatch subagent → finish playbook, "finish is terminal", touch-nothing-between-bookends rule) and `objective-autorun` (loop over begin→finish cycles with harness-native subagent visibility). No skill flow references the legacy blocking command.
- [x] Ship the `objective-autorun` parent orchestration wrapper skill: the Claude Code entry point that drives repeated `runner-step` invocations with a judgment checkpoint between every step.
      Parent-judgment iteration per ADR 0022 — distinct from the parked batch/multi-step mode, which is a lower-agency machine loop. The skill defers per-step mechanics to `objective-runner-step`, routes tracking through `objective-update`, and never submits or pushes.
      Evidence: `skills/objective-autorun/SKILL.md` shipped invoke-only with umbrella-family registration.
- [ ] Dogfood the decomposed begin→finish flow on a real Objective, including at least one `--recover` cycle if a failure occurs naturally or can be provoked cheaply; record findings as Semantic Updates here, especially any evidence bearing on the parked automatic-supervisor question.
- [ ] Delete the legacy machinery after dogfooding mileage (final slice, ADR 0024): `exec-runner-step`, `ChildSessionGateway` + fake + event channel, the Pi child-session adapter, marker-block report parsing, and the frozen `.pi/extensions/objective-autopilot.ts`. `exec-runner-subagent-usage` stays.

## Parked

- Pi command wrapper over `runner-step` (additive presentation; cross-harness parity says CLI + skill land first).
- Automatic LM recovery supervisor — reintroduction only as explicit, evidence-gated policy per ADR 0022, driven by dogfooding notes from this Objective.
- Batch/multi-step mode (explicit lower-agency behavior if it ever returns; out of scope for the durable design).
- Non-Pi child adapters (Claude Code headless or other process models) — resolved differently by ADR 0024: dispatch left the CLI entirely, so no adapter tier is needed; the `ChildSessionGateway` seam is deleted with the legacy command.
