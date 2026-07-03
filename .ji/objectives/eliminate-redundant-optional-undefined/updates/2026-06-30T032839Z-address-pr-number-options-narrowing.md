# Address PR Number Options Narrowing

## Summary

Completed a coherent `@sdl/address` internal PR-number forwarding cleanup slice.

Removed redundant explicit `| undefined` from omission-only optional `prNumber` fields in:

- `ResolvePrTargetOptions.prNumber`
- `CollectDownloadFeedbackOptions.prNumber`
- `CollectPrChecksOptions.prNumber`

The Zod/CLI request surfaces remain loose. The command producers now normalize `request.prNumber` with conditional object spread before calling the narrowed internal core helpers, so absent PR number is represented by omission rather than by a present key with value `undefined`.

Scoped address inventory from `rg -n "\\?:[^\\n;=]*\\| undefined" ts/packages/address --glob '*.ts'` moved from 36 candidates before the slice to 33 after.

Validation passed:

- `pnpm --dir ts run check`
- `pnpm --dir ts run test -- address`
- `pnpm --dir ts run fmt:check`
- `pnpm --dir ts run lint`

## Objective Impact

This advances the standing optional-undefined cleanup loop with the follow-up deferred by the prior address update: internal `prNumber` option shapes can be narrowed once the CLI/Zod boundary producers omit absent values before forwarding.

The semantic claim is that present-key `undefined` has no domain meaning for these core helper options. Consumers only distinguish concrete PR number from absence, and absence selects current-branch resolution. Public/input compatibility is preserved at the request boundary.

Preserved/deferred categories in the same package remain CLI dependency bags, JSON input/file option shapes, gateway/env option bags, operation definition options, and test/fake option bags because those are compatibility/input/dependency surfaces or separate semantic decisions.

## Follow-Ups

Future address slices can continue classifying remaining internal result/helper candidates, but should preserve CLI/Zod request surfaces, env/cwd/gateway/dependency bags, and fake/test support options unless a separate normalized internal boundary proves omission-only semantics.
