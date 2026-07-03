# Context Profiler Helper Seams

## Summary

The `context-profiler` helper-seams slice removed the two live reverse-import blockers that were preventing a later `@sdl/pi-context-profiler` extraction.

Display-width and scroll helpers now live in the neutral host module `ts/packages/hosts/pi/src/terminal/layout.ts`, exported as `@sdl/pi/terminal/layout`. LM model-output JSON parsing now lives in `ts/packages/hosts/pi/src/models/lm-json.ts`, exported as `@sdl/pi/models/lm-json`. PR preview, thermo-council, and context-profiler code import those neutral homes directly; `src/context-profiler/render.ts` no longer exports the moved layout helpers, and `src/context-profiler/lm-json.ts` was removed.

## Objective Impact

- Rehomed `clamp`, `fitToWidth`, `padRight`, and `reconcileScroll` from `context-profiler/render.ts` to `terminal/layout.ts` without changing their behavior.
- Rehomed `parseLmJson`, `extractJsonObjectText`, and `LmJsonParseResult` from `context-profiler/lm-json.ts` to `models/lm-json.ts`; the neutral helper carries its own local error-message normalization and does not import `context-profiler/errors.ts`.
- Added intentional neutral `@sdl/pi` package exports:
  - `./terminal/layout`
  - `./models/lm-json`
- Updated non-context-profiler consumers so PR preview code uses `../terminal/layout.ts` and thermo-council uses `../models/lm-json.ts`.
- Updated context-profiler internals so render/view/interrogation code uses `../terminal/layout.ts` for moved layout helpers and analysis/segmentation use `../models/lm-json.ts` for LM JSON parsing.
- Moved focused helper tests to neutral ownership:
  - `packages/hosts/pi/test/terminal-layout.test.ts`
  - `packages/hosts/pi/test/model-lm-json.test.ts`

## Evidence

Focused validation passed with the workspace-local Vitest invocation:

```bash
pnpm --dir ts exec vitest run packages/hosts/pi/test/terminal-layout.test.ts packages/hosts/pi/test/model-lm-json.test.ts packages/hosts/pi/test/context-profiler-render.test.ts packages/hosts/pi/test/pr-preview-feedback-view.test.ts packages/hosts/pi/test/pr-preview-checks-view.test.ts packages/hosts/pi/test/thermo-council.test.ts packages/hosts/pi/test/context-profiler-analysis.test.ts packages/hosts/pi/test/context-profiler-segmentation.test.ts packages/hosts/pi/test/context-profiler-interrogation.test.ts
```

Result: 9 test files passed, 127 tests passed.

Full repo default validation also passed:

```bash
just
```

Result: dprint check, `ts-deps-check`, TypeScript guard, format check, lint, `tsgo` typecheck, and the full Vitest suite all passed; full suite result was 356 test files passed, 3515 tests passed.

## Remaining Blockers / Follow-Ups

- The helper reverse-import seams are removed, but the broader `context-profiler` package extraction row is not complete. The remaining known blocker is the parity registration dependency direction: `@sdl/pi` still must not import a future extracted `@sdl/pi-context-profiler` package.
- Historical PR-download feedback fixture prose still mentions `context-profiler/render.ts`; it is retained as historical fixture text rather than live dependency evidence.
