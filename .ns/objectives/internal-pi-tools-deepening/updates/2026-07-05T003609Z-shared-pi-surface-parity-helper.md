# Shared Pi Surface Parity Helper Landed

## Summary

The parity assertion helper row is complete. `@ns/pi/parity/testing` now exports `expectPiSurfaceParity(register, metadata)`, which registers an extension against the existing fake host, compares live command surfaces to parity metadata, preserves the formatted failure diagnostics, and asserts the empty comparison with Vitest.

The six `@internal/pi-tools` parity test files were collapsed to one-call consumers of that helper:

- `backing-skill-commands`
- `context-profiler`
- `grill`
- `pr-feedback-watch`
- `pr-previews`
- `thermo-council`

## Objective Impact

This completes roadmap row 2. The neutral helper lives in the `@ns/pi/parity/testing` surface, so extracted Internal Pi-tool packages can consume it without inverting the dependency direction or copying the parity ritual into future subpackages.

Verification evidence:

- `rg -n "collect.*Surfaces|comparePiSurfaceParity|formatParityComparisonFailure|FakePiSurfaceHost|registerWithFakeHost" ts/packages/internal/pi-tools/test -g '*parity.test.ts'` found no matches in the targeted Internal Pi-tool parity tests.
- `rg -n "expectPiSurfaceParity" ts/packages/hosts/pi/src/parity/testing.ts ts/packages/internal/pi-tools/test -g '*.ts'` found the helper definition plus six call sites.
- `pnpm --dir ts run test -- packages/internal/pi-tools/test/backing-skill-commands/backing-skill-commands-parity.test.ts packages/internal/pi-tools/test/context-profiler/context-profiler-parity.test.ts packages/internal/pi-tools/test/grill/grill-ui-parity.test.ts packages/internal/pi-tools/test/pr-feedback-watch/pr-feedback-watch-parity.test.ts packages/internal/pi-tools/test/pr-previews/pr-previews-parity.test.ts packages/internal/pi-tools/test/thermo-council/thermo-council-parity.test.ts` passed.
- `pnpm --dir ts run test -- packages/hosts/pi/test/parity.test.ts` passed.
- `just ts-format-check` passed.
- `just ts-lint` passed.
- `just ts-check` passed.

## Follow-Ups

None for this row. The Objective's other roadmap rows remain open and unchanged.
