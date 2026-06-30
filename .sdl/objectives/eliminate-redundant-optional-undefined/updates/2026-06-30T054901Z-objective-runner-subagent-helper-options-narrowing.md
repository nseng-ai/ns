# Objective Runner Subagent Helper Options Narrowing

## Summary

Narrowed the local `AssistantRecordOptions` test-helper options bag in `ts/packages/objective/test/unit/runner-subagent-usage.test.ts` from explicit-undefined-capable optional fields to omission-only optional fields.

Scoped inventory:

- Before: 13 `?: T | undefined` candidates in `runner-subagent-usage.test.ts`.
- After: 0 candidates in that file.

Changed fields: `provider`, `api`, `model`, `inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheWriteTokens`, `totalTokens`, `costInput`, `costOutput`, `costCacheRead`, `costCacheWrite`, and `costTotal`.

Validation:

- `pnpm --dir ts vitest run packages/objective/test/unit/runner-subagent-usage.test.ts`: failed because `pnpm` interpreted `vitest` as a script and reported `Command "ts" not found`; reran with `exec`.
- `pnpm --dir ts exec vitest run packages/objective/test/unit/runner-subagent-usage.test.ts`: passed, 5 tests.
- `pnpm --dir ts run check`: passed.

## Objective Impact

This removes redundant optional `undefined` from an internal objective-package test fixture helper. The helper defaults every field with `??`, so present-key `undefined` behaves the same as omission and carries no domain, compatibility, external input, or fixture-state meaning. The slice is coherent and review-substantive because it narrows all 13 adjacent helper option fields together rather than leaving a trivial remainder.

## Follow-Ups

Preserve/defer classification: no other optional-undefined candidates remain in this file after the slice. Future runners should continue to treat local test-helper option bags that only feed nullish defaults as safe omission-only candidates, while still preserving public/input/options/external-schema surfaces unless a normalized internal boundary justifies narrowing.
