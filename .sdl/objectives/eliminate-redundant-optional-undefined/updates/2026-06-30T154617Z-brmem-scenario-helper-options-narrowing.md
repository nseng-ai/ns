# Brmem Scenario Helper Options Narrowing

## Summary

Narrowed the internal brmem scenario test helper option shapes in `ts/packages/infra/brmem/test/support/run-scenario.ts` from optional-plus-explicit-undefined fields to omission-only optional fields.

Changed fields/classes:

- `ScenarioRunOptions`: removed redundant trailing `| undefined` from all 15 option fields.
- `ScenarioPromptResolver` constructor options: narrowed `repoRoot`, `homeRoot`, `isInGitRepo`, and `promptFiles` to omission-only optional fields.
- `ScenarioSourceReader` constructor options: changed `files` and `unreadableFiles` from required `T | undefined` fields to optional omission-only fields.
- Forwarding from `runScenario` to the nested helpers now uses `optionalEntry` so exact-optional object literals omit absent keys rather than passing present-key `undefined`.

Repo-wide Objective metric scope: `ts`.

- Before: 526 raw optional-undefined properties, 71 typed explicit-undefined contracts, 0 legacy preserve markers, 2308 undefined-normalization/check lines.
- After: 507 raw optional-undefined properties, 71 typed explicit-undefined contracts, 0 legacy preserve markers, 2308 undefined-normalization/check lines.

Local slice metric scope: `ts/packages/infra/brmem/test/support/run-scenario.ts`.

- Before: 19 raw optional-undefined properties, 0 typed explicit-undefined contracts, 0 legacy preserve markers, 2 undefined-normalization/check lines.
- After: 0 raw optional-undefined properties, 0 typed explicit-undefined contracts, 0 legacy preserve markers, 2 undefined-normalization/check lines.

## Objective Impact

This removes 19 redundant optional-undefined property declarations from a package-local test fixture helper. The semantic claim is that brmem scenario helper options are omission-only test inputs: omitted fields select defaults, while present-key `undefined` has no independent domain, compatibility, input-schema, or external-conformance meaning.

The slice intentionally stays out of production brmem CLI/gateway/API surfaces. The only construction change is omission-preserving forwarding to nested test helper constructors via the shared `optionalEntry` idiom, needed because `exactOptionalPropertyTypes` rejects object literals that explicitly pass `undefined` to narrowed optional properties.

Validation evidence:

- `pnpm --dir ts run check` passed.
- `pnpm --dir ts exec vitest run packages/infra/brmem/test/scenario --config vitest.config.ts` passed: 8 files, 70 tests.

## Follow-Ups

- Treat package-local scenario helper option objects as good cleanup candidates when callers only omit fields to select defaults.
- The two remaining undefined-check lines in this file are runtime stdin normalization logic, not optional-property declaration debt, and were preserved for this slice.
