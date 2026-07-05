# Refresh rebaseline: autopilot extension already deleted; package renamed; dogfooding at 32 commits

## Summary

Trunk-style verified rebaseline against master HEAD (no branch evidence window; the refresh branch touches only `skills/` policy files). Three material corrections to the record, each probe-backed:

- **The frozen `/objective:autopilot` extension is already deleted.** The record repeatedly claimed `.pi/extensions/objective-autopilot.ts` was "frozen ... verified still present at HEAD" and listed it as an outstanding deletion-slice target. It is gone: `git ls-files` finds no autopilot file, and `git log` shows it removed on master by `b8c4052f3` (2026-07-04, "Replace `/objective:autopilot` with `/objective:autorun` and add `objective_runner_step`"; confirmed ancestor of master). `/objective:autorun` and `.pi/extensions/dispatch-runner-subagent.ts` are the current Pi surface. So that facet of the deletion slice is done; only the legacy TypeScript machinery remains.
- **Package name drift corrected.** The record used `@ns/objective` throughout; the actual package is `@nseng-ai/objectives` (`ts/packages/capabilities/objectives/package.json`), consistent with the repo-wide `@nseng-ai/*` namespace. The directory path `ts/packages/capabilities/objectives/src/runner/` was already correct.
- **Dogfooding count updated 21 → 32.** `git log --grep='Objective-Runner-Step' master` now returns 32 commits (was 21): the original 21 plus 11 from 2026-07-04 (Flow-land and roaster work). Still zero `Objective-Runner-Mode: recover` commits anywhere in history.

Verified still-accurate and carried forward unchanged: the runner core, both bookend commands, both integration/scenario/unit test lanes, and both parent skills all exist at the claimed paths; the legacy deletion targets (`exec-runner-step` — still registered in `repo-local-ns-extension.ts` — plus `child-session.ts`, `fake-child-session.ts`, `event-channel.ts`, `src/pi/child-session/`, `report-marker.ts`) are all present at HEAD and carry `ADR0024-LEGACY-DELETE` markers; ADRs 0022/0024/0026 exist at their cited paths.

## Objective Impact

- Two completion criteria stay open — decomposed-flow dogfooding and legacy-machinery deletion — so the record is not closure-ready. But the deletion slice is smaller than the record implied: the autopilot extension is already removed, leaving only the legacy TypeScript surface.
- The decomposed-flow dogfooding question is sharpened, not resolved: the 11 newest runner-step commits postdate the `/objective:autorun` cutover, which is stronger circumstantial evidence the decomposed flow is in active use, but commit trailers still do not distinguish flows and the legacy `exec-runner-step` CLI stayed wired, so the criterion remains "still owed" rather than met.
- The autopilot-related Non-Goal and Risk lines were rewritten to reflect the deletion (no longer "frozen until its deletion slice").

## Follow-Ups

- Confirm or run a decomposed begin→finish step on a real Objective and record findings here; provoke or await one `--recover` cycle (still zero in history).
- Execute the remaining legacy-machinery deletion slice (the ADR0024-marked TypeScript surface), then take this record through `objective-update` / `objective-close`.

Provenance: objective-refresh basis target=8fdc6f50661d8df81024bbcce3c722fb7411441d from=trunk-HEAD
