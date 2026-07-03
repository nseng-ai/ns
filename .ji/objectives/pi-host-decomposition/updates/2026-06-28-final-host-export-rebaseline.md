# Final Host Export Rebaseline

## Summary

The final `@sdl/pi` export/context rebaseline is complete for this Objective. No new Pi-tool package extraction was needed; the remaining package exports were audited as intentional neutral/runtime/presentation surfaces and recorded in `ts/packages/hosts/pi/CONTEXT.md` rather than treated as accidental feature-domain entrypoints.

Context and guidance now say:

- Extracted Pi-native tools live above the host in `ts/packages/pi-tools/<tool>/`, registered by direct project-local discovery adapters.
- The remaining `@sdl/pi/...` exports are neutral helper families: command acknowledgement/I/O/names, branch slug helpers, grill surface constants, model-call and LM-JSON helpers, Objective picker/selection helpers, parity helpers, runtime types/envelopes, runner-subagent runtime/process/JSON-event/presentation helpers, session replacement, skill expansion, terminal layout/presentation, and shared timers.
- Handoff, Branch Context + Plans, and Objective are thin Pi shells over `@sdl/handoff/api`, `@sdl/branch-context/api` + `@sdl/plans/api`, and `@sdl/objective/api` respectively.
- PR feedback is accepted Pi presentation/session residue around portable `pr-address` behavior, not a Pi-tool package; future reusable watch/fingerprint seams should be a focused `pr-address` Capability/API follow-up.

Small import-surface hygiene also landed: Pi handoff presentation files now consume handoff identity helpers through `@sdl/handoff/api` instead of the lower `@sdl/handoff/identity` subpath.

Validation evidence from this slice:

- `pnpm --dir ts --filter @sdl/pi run check`
- `pnpm --dir ts exec vitest run packages/hosts/pi/test/claude-handoff.test.ts packages/hosts/pi/test/handoff-content-slug.test.ts packages/hosts/pi/test/handoff-launch-flow.test.ts packages/hosts/pi/test/handoff-tab.test.ts packages/hosts/pi/test/handoff.test.ts`
- `just ts-format-check`
- `just dprint-check`
- `just ts-guard`
- `just ts-deps-check`
- `just ts-lint` (completed with pre-existing `no-useless-escape` warnings in `packages/sdl/test/scenario/handoff-cli-contract.test.ts`)

## Objective Impact

This completes the last active roadmap row. The Objective now has recorded dispositions for every named Pi-native extraction candidate, an explicit capability-mirror status matrix, final host export/context language, and validation evidence that the final hygiene changes did not introduce type, formatting, dependency, or guard regressions.

The Objective appears ready for closure review: the remaining work is to decide whether the recorded completion evidence satisfies the Completion Criteria and then run `objective-close` if accepted.

## Follow-Ups

- If PR feedback is thinned further, do it as a focused `pr-address` Capability/API follow-up rather than a Pi-tool package.
- Do not force runner runtime/process/JSON-event helpers or terminal layout/presentation helpers out of `@sdl/pi` without new acyclic evidence.
- Consider `objective-close` for `pi-host-decomposition` after a closure-readiness readback.
