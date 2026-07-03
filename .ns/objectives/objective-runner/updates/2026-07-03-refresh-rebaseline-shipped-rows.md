# Refresh rebaseline: build slices verified landed; dogfooding and deletion remain

## Summary

Verified rebaseline of this record against trunk HEAD, executing the reconciliation the ADR 0024 update flagged ("several `[ ]` rows describe runner-core work that already shipped on master"). Every build slice is verified landed and its roadmap row is now `[x]` with probe-backed evidence: `GitGateway` mutations with fake parity (relocated to `ts/packages/capability-kit/src/git/contract.ts`), `ChildSessionGateway` + fake, the runner core under `src/runner/`, the legacy blocking `runner-step` command, the Pi child-session adapter at `src/pi/child-session/`, both integration-lane tests (`runner-step-git.test.ts`, `runner-finish-git.test.ts`), and the `objective-runner-step` parent playbook skill.

Naming rebaselined after the mid-Objective renames: CLI `sdl` → `ji` (ADR `docs/adr/0024-rename-sdl-to-ji.md`), package `@sdl/objective` → `@ji/objective`, `@sdl-local/pi-tools` → `@internal/pi-tools`. Two open questions closed by shipped fact: `--guidance` resolved as one flag accepting `@path`, and the host-composition wiring question dissolved (the decomposed commands are plain command constants). Dissolved assumptions/risks (blocking-CLI acceptability, marker-block reliability, composition wiring) were removed from `objective.md` rather than carried forward.

Dogfooding evidence quantified from commit trailers: 21 verified `Objective-Runner-Step` commits on master — flow-deepening-round-2 ×14 (legacy blocking flow; the dogfooding that motivated ADR 0024) and objective-edges ×7, whose flow (legacy vs decomposed) is not attributable from commit evidence; that attribution is now an explicit open question. No `Objective-Runner-Mode: recover` commit exists anywhere in history. The deletion-slice targets were all verified still present at HEAD, including the frozen `.pi/extensions/objective-autopilot.ts`.

Provenance: objective-refresh basis target=5668ac5630b2bab397ef85b9e4cfe4d5cd84c420 from=trunk-HEAD

## Objective Impact

- The roadmap now shows the true shape of remaining work: one `[~]` row (decomposed-flow dogfooding evidence, ideally with a recover cycle, findings recorded here) and one `[ ]` row (the legacy-machinery deletion slice). Everything else is completion evidence.
- Completion Criteria in `objective.md` are rewritten to the ADR 0024 delivery surface, with per-criterion status annotations; the record is two slices from closure-ready.
- The recovery-model risk gains a sharper fact: zero recover cycles have occurred, so that path is entirely untested despite 21 successful step commits.

## Follow-Ups

- Confirm (or run) a decomposed begin→finish step on a real Objective — resolving whether the objective-edges steps already count — and provoke or await one `--recover` cycle; record findings here.
- Execute the deletion slice, then take this record through `objective-update`/`objective-close`.
- Reported drift outside this record (not edited here): the `objective-edges` record is stranded at the pre-cutover path `.sdl/objectives/objective-edges/` instead of `.ji/objectives/`, and the `objective` umbrella skill still describes `objective-runner-step` as running "via `ji objective exec runner-step`" rather than the decomposed bookends.
