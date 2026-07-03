# Handoff Internal Options Narrowing

## Summary

Narrowed a cohesive handoff package cluster from explicit-present `undefined` to omission-only optional properties where construction paths already omit absent values.

Scoped inventory over `ts/packages/capability-pi/handoff` and `ts/packages/handoff` using `rg -n "\\?:[^;=]*\\| undefined" ...` moved from 9 matching lines before the slice to 5 after it. The remaining matches are preserved/deferred false positives or meaningful surfaces such as callback parameters, environment maps whose values may be `undefined`, call-record values, and optional UI input parameters.

Changed field sites:

- `deriveHandoffContentSlug` input `signal?: AbortSignal | undefined` -> `signal?: AbortSignal`, with the caller in `tab.ts` now spreading `signal` only when defined.
- `VerifyHandoffLaunchOptions.verifyUpdate?: string | undefined` -> `verifyUpdate?: string`, with launch-tool registration now omitting the field when the spec has no update text.
- `ListHandoffSummariesOptions.branch?: string | undefined` -> `branch?: string`, with list/gc callers omitting `branch` for all-branch summaries.
- `createRealHandoffContext` options `cwd?: string | undefined` and `env?: NodeJS.ProcessEnv | undefined` -> omission-only optional fields.

## Objective Impact

This advances the standing cleanup loop with a semantic package-level slice rather than a mechanical sweep. The narrowed shapes are internal helper/options/result shapes where explicit-present `undefined` had no domain meaning; producers now use the repository's exact-optional object-spread idiom before the types were narrowed.

Preserved/deferred categories for future runners:

- `Record<string, string | undefined>` environment maps still model Node/process environment semantics and should not be counted as redundant optional-undefined fields.
- Optional methods/callback parameters such as `setStatus?(..., value: string | undefined)` and `gate?(..., signal: AbortSignal | undefined)` carry function/callback semantics, not optional object field redundancy.
- Test fake call records with required `options: ... | undefined` model present keys whose value may be unavailable and are not `?: T | undefined` cleanup targets.

Validation passed:

- `pnpm --dir ts --filter @sdl/handoff-pi run test`
- `pnpm --dir ts --filter @sdl/handoff run test`
- `pnpm --dir ts --filter @sdl/handoff-pi run check`
- `pnpm --dir ts --filter @sdl/handoff run check`
- `pnpm --dir ts run fmt:check -- packages/capability-pi/handoff/src/content-slug.ts packages/capability-pi/handoff/src/launch-flow.ts packages/capability-pi/handoff/src/tab.ts packages/handoff/src/artifact-storage.ts packages/handoff/src/context.ts packages/handoff/src/operations/gc.ts packages/handoff/src/operations/list.ts`

## Follow-Ups

No immediate follow-up is required for this handoff cluster. Future autonomous slices should continue to avoid environment maps and callback parameters unless a separate internal normalized type proves explicit-present `undefined` is redundant there too.
