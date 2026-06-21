# PR Description Orchestration Shipped

## Summary

The PR-description deepening slice has been implemented: the old split between `pr-description-apply.ts` and `submit-pr-descriptions.ts` has been collapsed into a new single-PR `pr-description-orchestration.ts` operation. The orchestrator returns a discriminated result for prewritten matches/updates, generated-fingerprint matches, generated edits, and failures. `generateSubmitPrDescriptions(...)` now aggregates those per-PR results, and `sdl regenerate-pr` uses the same orchestration path with force semantics.

The `TextGenerationGateway` seam is now testable through `ScriptedTextGenerationGateway` exported from `@sdl/core/testing`, with copied request recording and `assertDone()` behavior parallel to the existing scripted command helpers.

Validation run locally:

```bash
pnpm --dir ts run test -- packages/sdl-core/test/pr-description.test.ts packages/sdl-core/test/pr-description-orchestration.test.ts packages/sdl/test/scenario/submit-cli.test.ts packages/sdl/test/scenario/regenerate-pr-cli.test.ts
pnpm --dir ts run check
pnpm --dir ts run fmt:check
pnpm --dir ts run lint
```

## Objective Impact

Roadmap items 1 and 2 are now marked shipped. This completes the Objective's cleanest self-contained first cut: the PR-description decision/generation/edit flow is concentrated behind one deeper module, and deterministic orchestration tests now exercise the new state-to-result interface without model I/O.

The Objective remains open because candidates 3 through 9 are still unresolved.

## Follow-Ups

- Continue with the next roadmap candidate after this branch lands; candidate 3 should first confirm whether `slot-dispatch-plan.ts` already contains most of the target `SlotDispatchPlan` shape.
- Full repo gates still need to be run before final branch closeout if this implementation receives further edits after the recorded validation.
