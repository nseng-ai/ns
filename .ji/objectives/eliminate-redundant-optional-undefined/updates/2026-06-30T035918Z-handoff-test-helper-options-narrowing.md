# Handoff Test Helper Options Narrowing

## Summary

Narrowed omission-only optional properties in handoff test helper and fixture option shapes.

Scoped inventory for the two touched files changed from 14 raw `?: ... undefined` matches to 1 raw match:

- `ts/packages/handoff/test/scenario/handoff-sdl-command-fakes.ts`
- `ts/packages/handoff/test/unit/gc-core.test.ts`

Changed fields:

- `FakeHandoffSdlApiOptions`: `cwd`, `env`, `brmem`, `git`, `sourceReader`, `interaction`, `stderr`
- `runHandoffCommand` helper options: `api`
- `fakeHandoffInteraction` helper options: `isInteractive`, `confirmations`
- `FakeHandoffSourceReader` constructor options: `stdin`, `files`
- `createSummary` fixture options: `key`, `entryLocator`, `updatedAt`
- `putHandoff` fixture options: `content`

The remaining scoped raw match is `env?: Record<string, string | undefined>` in the handoff fake. The optional property itself is now omission-only; the inner record value type still deliberately permits environment variables with undefined values.

## Objective Impact

This advances the continuous cleanup row by removing redundant explicit optional `undefined` from helper-only handoff test surfaces where callers omit fields or provide concrete values. Construction evidence uses defaults, nullish coalescing, and conditional spreads that already model absence by omission rather than present-key `undefined`.

Validation:

- `pnpm --dir ts exec vitest run packages/handoff/test/scenario/handoff-sdl-commands.test.ts packages/handoff/test/unit/gc-core.test.ts` passed.
- `pnpm --dir ts run check` passed.
- `pnpm --dir ts run fmt:check` passed.

## Follow-Ups

Continue preserving environment record value types such as `Record<string, string | undefined>` unless a separate normalized environment model proves that individual keys cannot carry undefined values. Remaining candidates in production handoff and branch-context/plan surfaces should be treated as options, dependency bags, signals, or external-facing command seams unless inspected in a separate coherent slice.
