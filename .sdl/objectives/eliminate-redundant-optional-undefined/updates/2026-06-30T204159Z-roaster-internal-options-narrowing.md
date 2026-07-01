# Semantic Update — Roaster Internal Options Narrowing

## Slice

Removed redundant raw `| undefined` from Roaster-owned internal request/options/fake-constructor shapes where present-key `undefined` has no separate contract from omission.

## Changed fields

- Narrowed Roaster runtime/DI option bags in `src/context.ts`, `src/skill-reviews.ts`, and gateway options for review catalog, local diff, review log, review runner, and fake GitHub gateways.
- Narrowed review-run internal request/log option fields in `src/operations/review-run.ts`.
- Narrowed internal findings publication/comment rendering option fields.
- Narrowed corresponding test helper option shapes in Roaster tests.
- Fixed exact-optional call sites by omitting keys with conditional spreads in `cli-operations.ts`, `github.test.ts`, and `api.test.ts`.

## Semantic claim

These fields are Roaster-owned internal options, request bags, and fakes. Existing consumers already treat absent keys and present `undefined` identically via `??`, `=== undefined`, or conditional spreads. The narrowed `foo?: T` shape now represents omission-only state under `exactOptionalPropertyTypes` without changing runtime behavior.

## Preserved categories

- Preserved `ExplicitUndefined<"abort-signal", AbortSignal>` cancellation seams.
- Preserved `ExplicitUndefined<"env-map", NodeJS.ProcessEnv>` env-map seams.
- Preserved `null` unions such as local-diff `baseRef?: string | null` and findings comment status/model-profile fields; `null` remains the distinct domain state.
- Left Roaster public/API or schema-facing residuals alone: `src/api.ts` and `src/project-config.ts` still contain raw optional `undefined` surfaces for a separate compatibility/schema decision.

## Metrics

Before:

- Repo-wide typed optional-undefined count: 241
- Scoped Roaster typed optional-undefined count: 39
- Repo-wide undefined-normalization/check count: 4465
- Scoped Roaster undefined-normalization/check count: 168

After:

- Repo-wide typed optional-undefined count: 204
- Scoped Roaster typed optional-undefined count: 2
- Repo-wide undefined-normalization/check count: 4471
- Scoped Roaster undefined-normalization/check count: 174

The normalization/check count increased because exact-optional fallout was fixed with conditional omission spreads instead of re-widening types.

## Validation

- `pnpm --dir ts run check`
- `pnpm --dir ts run test -- ts/packages/roaster`
- `pnpm --dir ts run fmt:check` (initially failed on `review-catalog.ts`; fixed with `pnpm --dir ts run fmt`)
- `pnpm --dir ts run lint`
- Re-ran `pnpm --dir ts run fmt:check`, `pnpm --dir ts run lint`, and `pnpm --dir ts run check` after formatting.
