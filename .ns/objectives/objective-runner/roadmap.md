# Roadmap

## Work

- [x] Grow the shared `GitGateway` contract with runner-needed neutral mutations (porcelain-derived status facts, staging, commit) plus `InMemoryGitGateway` parity.
      Evidence: `statusPaths`, `stagePaths`, `commit`, and `hasUncommittedChangesUnder` on the contract, now at `ts/packages/capability-kit/src/git/contract.ts` after the neutral-infra gateway relocation, with `InMemoryGitGateway` parity in `git-testing.ts`.
- [x] Define `ChildSessionGateway` (streaming: event iterable + outcome promise, harness-neutral request/outcome) in `@ns/objective` and ship `FakeChildSessionGateway` in the package testing surface.
      Evidence: `src/runner/child-session.ts`, `src/runner/fake-child-session.ts`, `test/unit/runner/fake-child-session.test.ts`. Legacy per ADR 0024; deleted with the final slice.
- [x] Build the runner core: preconditions, thin child prompt construction, report parsing, five-part verification gate, commit with provenance trailers, two-zone checkpoint rendering from typed facts.
      Evidence: `ts/packages/capabilities/objective/src/runner/` (`preconditions.ts`, `prompt.ts`, `report.ts`/`report-marker.ts`/`report-file.ts`, `gate.ts`, `commit.ts`, `checkpoint.ts`) with fake-driven unit coverage in `test/unit/runner/` (gate, checkpoint render, commit message, prompt, report parse, run-step).
- [x] Ship the legacy blocking `ns objective exec runner-step <slug>` with `--recover`, `--guidance` (inline or `@path`), `--model`, `--timeout`; clinkr exit codes; checkpoint-only stdout and streamed stderr progress.
      Evidence: `src/ns/commands/exec-runner-step.ts`, scenario suite `test/scenario/exec-runner-step.test.ts`. The `--guidance` file-form question resolved as one flag accepting `@path`. Legacy per ADR 0024; deleted with the final slice.
- [x] Implement the real Pi-subprocess dispatch adapter at the objective container's own Pi-coupled edge and resolve the host composition point.
      Evidence: `src/pi/child-session/pi-child-session-gateway.ts` with unit coverage. The composition question dissolved for the decomposed commands (plain command constants, no seam). Legacy per ADR 0024; deleted with the final slice.
- [x] Enrich real Pi child-session stderr progress for dogfooding visibility: elapsed activity prefixes, first-line live session JSONL pointer, compact tool argument/failure previews, and completed assistant/thinking block previews.
      Evidence: `pi-child-session-gateway` fake-process unit coverage exercises prefixed activity, pointer-first behavior, summaries/previews, block-preview de-dupe, and unchanged stderr passthrough/final-text capture.
- [x] Add the small real-git integration-lane tests: verify → stage → commit → trailers against a temp repo with a scripted child.
      Evidence: `test/integration/runner-step-git.test.ts` (legacy flow) and `test/integration/runner-finish-git.test.ts` (decomposed flow).
- [x] Decompose the step into Pi-free bookends per ADR 0024: `ns objective exec runner-begin` (LBYL preconditions, report-path hygiene, step facts + subagent prompt) and `ns objective exec runner-finish` (fail-closed facts/report validation, unchanged gate, runner-owned commit, two-zone checkpoint), with the implementation session moved to a parent-dispatched harness subagent and the child report moved to a JSON file outside the worktree.
      Evidence: scenario suites `exec-runner-begin.test.ts` / `exec-runner-finish.test.ts`; real-git `runner-finish-git.test.ts` (begin → simulated subagent → finish → trailers, double-finish → deterministic verification-failed, parent-moved-HEAD); read-only CLI bench drills (missing/corrupt report malfunctions, stale-report and in-repo report-path refusals) against this repo.
- [x] Write the parent playbook skill for the decomposed flow: `objective-runner-step` (begin → dispatch subagent → finish, "finish is terminal", touch-nothing-between-bookends rule, checkpoint zones, `--recover` vs reset vs hand-fix, when a checkpoint warrants a Semantic Update via `objective-update`).
      Evidence: `skills/objective-runner-step/SKILL.md`; no skill flow uses the legacy blocking command (it is mentioned only as scheduled for deletion).
- [x] Ship the `objective-autorun` parent orchestration wrapper skill: the entry point that drives repeated begin→finish cycles with a judgment checkpoint between every step.
      Parent-judgment iteration per ADR 0022 — distinct from the parked batch/multi-step mode, which is a lower-agency machine loop. The skill defers per-step mechanics to `objective-runner-step`, routes tracking through `objective-update`, and never submits or pushes.
      Evidence: `skills/objective-autorun/SKILL.md` shipped invoke-only with umbrella-family registration.
- [~] Dogfood the runner on real Objectives; specifically, evidence the decomposed begin→finish flow end-to-end including at least one `--recover` cycle if a failure occurs naturally or can be provoked cheaply; record findings as Semantic Updates here, especially any evidence bearing on the parked automatic-supervisor question.
  Progress: 21 verified `Objective-Runner-Step` commits landed on master — flow-deepening-round-2 ×14 (legacy blocking flow; this dogfooding motivated ADR 0024) and objective-edges ×7 (flow not attributable from commit evidence; see the open question in `objective.md`). No `Objective-Runner-Mode: recover` commit exists in history, and no dogfooding findings are recorded in this record's updates yet.
- [ ] Delete the legacy machinery after decomposed-flow dogfooding mileage (final slice, ADR 0024): `exec-runner-step`, `ChildSessionGateway` + fake + event channel, the Pi child-session adapter, marker-block report parsing, and the frozen `.pi/extensions/objective-autopilot.ts` (all verified still present at HEAD). `exec-runner-subagent-usage` stays.

## Parked

- Pi command wrapper over the runner (additive presentation; cross-harness parity says CLI + skill land first).
- Automatic LM recovery supervisor — reintroduction only as explicit, evidence-gated policy per ADR 0022, driven by dogfooding notes from this Objective.
- Batch/multi-step mode (explicit lower-agency behavior if it ever returns; out of scope for the durable design).
- Non-Pi child adapters (Claude Code headless or other process models) — resolved differently by ADR 0024: dispatch left the CLI entirely, so no adapter tier is needed; the `ChildSessionGateway` seam is deleted with the legacy command.
