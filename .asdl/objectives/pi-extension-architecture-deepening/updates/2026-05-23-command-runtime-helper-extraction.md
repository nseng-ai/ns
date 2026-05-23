# Command Runtime Helper Extraction

## Summary

`ts/packages/pi-extensions/src/command-runtime.ts` now holds the shared, pure command-runtime helpers that showed real reuse across engineered Pi extensions:

- `ExecResult` normalization for Pi exec results with optional output fields;
- shell-safe command display formatting;
- terminal escape stripping;
- output tailing; and
- labeled stdout/stderr output-section formatting.

The engineered `objective` and `land-stack` implementations now consume those helpers, and `ts/packages/pi-extensions/test/command-runtime.test.ts` covers the helper seam directly.

Evidence: local branch diff against `extract-command-runtime-utils`; `bun run --cwd ts check` and `bun run --cwd ts test` passed.

## Objective Impact

This resolves candidate 2 for shared Pi command runtime mechanics. The useful shared interface is intentionally narrower than the original candidate list: pure result/text helpers moved into `command-runtime.ts`, while command orchestration, UI/non-UI presentation, and custom message streaming remain in their callers until another deletion-test-backed seam appears.

The roadmap now marks candidate 2 complete and records the command-runtime extraction as an accepted refactor. The broader Objective remains open for Objective selection deepening, `land-stack` internal module splitting, `/submit` layer decisions, and shared skill-invocation evaluation.

The extraction partially de-risks premature common-helper extraction for this narrow runtime seam, but keeps the broader risk active for future orchestration or presentation abstractions.

## Follow-Ups

- Keep `command-runtime.ts` focused on pure helpers unless another extension proves a broader command-runtime seam.
- Continue with Objective selection deepening, `land-stack` module splitting, `/submit` layer decisions, or skill-invocation evaluation as separate candidate resolutions.
