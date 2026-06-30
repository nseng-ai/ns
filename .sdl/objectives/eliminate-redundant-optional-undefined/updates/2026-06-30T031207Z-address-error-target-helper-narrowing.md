# Address Error Target Helper Narrowing

## Summary

Narrowed a small `@sdl/address` internal helper cluster from explicit-undefined optional properties to omission-only optional properties. The scoped `ts/packages/address/src` inventory moved from 21 to 16 `?: ... | undefined` candidates.

Changed fields:

- `FailureDetailInput.stderr`, `stdout`, and `message` now use `?: string | null`; `null` remains meaningful while absent values are modeled by omission.
- The private `emptyTarget` helper options `prNumber` and `branch` now use `?: number` / `?: string` before being collapsed to JSON payload `null` values.
- `gatewayFailureMessage` now uses object-spread omission for gateway detail fields so the narrowed error-detail helper is constructed honestly under `exactOptionalPropertyTypes`.

Validation passed:

- `pnpm --dir ts run check`
- `pnpm --dir ts run test -- address`
- `pnpm --dir ts run fmt:check`
- `pnpm --dir ts run lint`

## Objective Impact

This is kept progress for the continuous cleanup loop: it removes five redundant explicit-undefined unions from internal result/helper shapes without touching CLI request schemas, Zod inputs, gateway/env/signal/dependency bags, public payload `null` fields, or test fake option bags.

Reusable classification finding: gateway-derived detail values may require producer normalization with conditional object spread before an internal omission-only helper input can be narrowed. Keeping `null` in helper input and payload shapes remains correct when it carries external/domain meaning.

`CollectDownloadFeedbackOptions.prNumber` was deferred because its main command producer currently forwards `request.prNumber` from a Zod/CLI input request. It can be narrowed in a future slice only if that producer is normalized locally without widening the public request surface.

## Follow-Ups

- Future address slices can examine other internal core result/helper shapes, but should continue preserving CLI/Zod request surfaces and dependency/gateway option bags unless a normalized internal boundary is added first.
