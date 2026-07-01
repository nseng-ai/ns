# Decomposition Closure Rebaseline

## Summary

Rebaselined the remaining open roadmap row, “Decompose Flow land command shells from land-stack domain orchestration,” after the landing dispatch coordinator extraction.

Current boundary readback:

- `ts/packages/capabilities/flow/src/land.ts` is now a command/CLI shell: command registration, argument parse/help handling, `ctx.waitForIdle()`, command-stream/progress setup, CLI result-block adaptation, and handoff into private landing dispatch.
- `ts/packages/capabilities/flow/src/land/landing-dispatch.ts` owns semantic landing dispatch: shape load/no-op handling, isolated fast-path routing, stack-mode confirmation, stack landing handoff, and post-landing cleanup sequencing.
- `ts/packages/capabilities/flow/src/land-stack.ts` is now a small Flow-private stack façade for renderer registration, argument completion/parsing, execution setup, shape/plan routing, chunk dispatch, and top-level failure cleanup.
- Focused private modules own the decomposed phases: chunked and single-plan coordination, landing coordination/presentation, pre-merge confirmation, submit/restack pre-merge maintenance, post-merge Graphite maintenance, backup refs, Flow-to-Land planning adaptation, isolated fast path, and post-landing slot cleanup.
- `ts/packages/capabilities/land` remains the land-domain core seam for stack preflight/dry-run planning; mutation-heavy landing execution remains intentionally Flow-owned for now.

No additional code split is needed to satisfy this Objective's decomposition criteria. The remaining large private module, `graphite-maintenance.ts`, is cohesive around post-merge Graphite maintenance and is no longer evidence that `land.ts` or `land-stack.ts` are god-files. Further splitting it would be ordinary follow-up refactoring, not required for this Objective.

## Objective Impact

The decomposition roadmap row is now marked complete. Together with the previously completed fake-driven `sdl-land` seam, CCC-era naming cleanup, context refresh, and final API/export cleanliness rebaseline, the Objective appears ready for an explicit `objective-close` pass if the user agrees completion criteria are satisfied.

The orientation was refreshed from “mid-migration” to the current rebaselined state: Flow intentionally owns command presentation, compatibility, and mutation-heavy landing internals behind private modules while `sdl-flow/api` stays narrow.

## Evidence

- Module-size readback: `land.ts` is 231 lines, `land/landing-dispatch.ts` is 200 lines, `land-stack.ts` is 175 lines, and `land-stack/landing-operations.ts` is 317 lines.
- Public/private boundary search found no CCC/Pi/kernel/host consumer imports of private Flow land/land-stack modules and no remaining external consumer references to removed land-stack API symbols. Flow tests still import private land-stack helpers directly, which is intentional package-local coverage.
- `sdl-flow/api` still exports command-facing land types/operations (`registerLandCommand`, `runLandCli`, `parsePullRequestView`) rather than stack internals.
- `sdl-flow/package.json` still exposes `./api`, shared output, and command-loader entries; it does not expose `./land-stack` or `./land/landing-dispatch`.

## Follow-Ups

- Run `objective-close` for `flow-capability-deepening` if the completion criteria are accepted as satisfied.
- Keep future Graphite maintenance or merge-loop cleanup as ordinary Flow refactoring unless it changes the public Flow API, `sdl-land` boundary, or land safety behavior.
- Do not re-expose land-stack implementation helpers through `sdl-flow/api` or package exports for test or consumer convenience.
