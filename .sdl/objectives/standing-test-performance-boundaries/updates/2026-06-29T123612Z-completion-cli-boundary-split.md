# Completion CLI boundary split

## Summary

Refactored `@sdl/kernel` completion CLI scenario coverage so the default lane drives resolver behavior through a package-local fake extension registry seam instead of temporary `.sdl/extensions` projects and real dynamic extension imports. Added focused integration coverage for the real extension discovery/import/provider boundary in `packages/kernel/test/integration/completion-cli.test.ts`.

## Objective Impact

This advances the default-vs-integration test boundary by moving completion-provider and selected-command import wiring out of the default scenario file while preserving fast-lane behavior checks for completion script rendering, top-level resolver output, selected option completion, selected load diagnostics, dynamic provider success, and dynamic provider failure fallback.

## Performance evidence

- Measured command: `pnpm --dir ts exec vitest run --config vitest.config.ts packages/kernel/test/scenario/completion-cli.test.ts --reporter verbose`
- Baseline timing: before refactor, 8 tests passed with `Duration 782ms`, Vitest `tests 354ms` in this session. Planning baseline was similar at `Duration 757ms`, `tests 338ms`.
- Post-change timing: after refactor, the same default file lists 7 fake-driven/default tests. First post-change run reported `Duration 569ms`, `tests 13ms`; a later post-format run reported `Duration 1.16s`, `tests 16ms`, showing transform/import noise dominates the wall clock while test-body work is now much smaller.
- Repetition/noise notes: single-run local timings only. Import/transform time varied substantially between runs, so the durable signal is the test-body reduction and removal of repeated real extension project/import setup from the default file, not a stable wall-clock claim.
- Cost handling: real `.sdl/extensions` discovery/import/provider wiring was shifted intentionally to `pnpm --dir ts exec vitest run --config vitest.integration.config.ts packages/kernel/test/integration/completion-cli.test.ts --reporter verbose`. The first integration run reported 4 tests, `Duration 662ms`, `tests 102ms`; a later post-format run reported `Duration 1.27s`, `tests 118ms`.
- Coverage retention: default tests still cover resolver rendering and error semantics through fakes. Integration tests now cover selected command schema option completion, unrelated broken extension not being imported for selected valid completion, real dynamic provider invocation, and selected load failure diagnostics.

## Follow-Ups

None required from this slice. The fake registry seam is package-local and domain-specific to SDL extension catalog/selected-command loading; do not generalize it unless another boundary split proves the same shape useful.
