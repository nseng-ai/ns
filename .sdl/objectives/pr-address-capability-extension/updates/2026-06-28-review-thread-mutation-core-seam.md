# Review-thread mutation core seam extracted

## Summary

Extracted the portable `sdl address exec reply-review-thread` and `sdl address exec resolve-review-thread` mutation semantics from Address command glue into an Address-owned Domain Core seam.

## Objective Impact

This advances the open Domain Core seams row without completing it.

Changes / evidence:

- Added `ts/packages/address/src/core/review-thread-mutations.ts` with `replyReviewThread` and `resolveReviewThread`, explicit core result/payload types, injected `GithubPrFeedbackGateway`, and injected `GatewayOptions`.
- The core now owns review-thread mutation orchestration, PR-feedback gateway failure results, and stable snake_case payload construction for reply comments and resolution state.
- Thinned `ts/packages/address/src/primitive-commands.ts` so the two mutation handlers parse/wire command context, call the core seam, and translate core results to Clinkr exits.
- Removed the now-unused mutation payload helpers from `ts/packages/address/src/primitive-results.ts`; read primitive payload helpers remain there unchanged.
- Added `ts/packages/address/test/unit/core-review-thread-mutations.test.ts` with fake-backed reply/resolve success and failure coverage, including verification that failure paths record no fake mutation side effects.

Validation passed in this working session:

- `pnpm --dir ts --filter @sdl/address run test -- test/unit/core-review-thread-mutations.test.ts test/scenario/primitives.test.ts`
- `pnpm --dir ts --filter @sdl/address run check`

## Follow-Ups

- Keep the remaining read primitives and any reusable Pi watch/fingerprint behavior as separate Domain Core seam decisions.
- Do not claim the Domain Core row complete until the remaining candidates are reviewed or explicitly parked.
