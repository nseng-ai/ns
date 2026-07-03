# Worktree Status Refresh Helper Narrowing

## Summary

Completed a coherent `ts/packages/worktree-status` cleanup slice by removing redundant explicit `| undefined` from omission-only internal refresh/test-helper declarations:

- `RefreshRemoteOptions.identity?: WorktreeStatusIdentity`
- `QueuedLoaderResult.onCall?: () => void`
- `FakeWorktreeStatusLoaderOptions.identities?: readonly QueuedLoaderResult<WorktreeStatusIdentity>[]`
- `FakeWorktreeStatusLoaderOptions.localStatuses?: readonly QueuedLoaderResult<LocalWorktreeStatus>[]`
- `FakeWorktreeStatusLoaderOptions.ghStatuses?: readonly QueuedLoaderResult<WorktreeGhStatus>[]`
- `FakeWorktreeStatusLoaderOptions.identityCurrent?: readonly boolean[] | boolean`
- `FakeWorktreeStatusLoaderOptions.footerBranch?: string | null`

Scoped `worktree-status` single-line candidate count from `rg -n "\\?:[^\\n;=]*\\| undefined" ts/packages/worktree-status --glob '*.ts'` moved from 35 to 29.

Validation passed:

- `pnpm --dir ts run fmt:check`
- `pnpm --dir ts run lint`
- `pnpm --dir ts run check`
- `pnpm --dir ts --filter @sdl/worktree-status test` (5 files, 57 tests)

## Objective Impact

This advances the standing optional-undefined cleanup loop with the `worktree-status` cluster called out in the roadmap while preserving public/input/dependency surfaces.

The semantic claim is that these narrowed fields are internal refresh helper or test fixture helper shapes where absent identity, callbacks, queued loader results, identity-current seeds, and footer branch overrides are modeled by omission. Present-key `undefined` has no domain meaning: `refreshRemoteNowWithIdentity` receives `{}` or concrete identity-bearing objects, `queued` already omits `onCall` when it is absent, and `fakeWorktreeStatusLoaders` defaults omitted queues/overrides with `??` fallback logic.

A small plan adaptation was required: the saved plan's primary `ActiveSession` fields were already omission-only in the live code, so the kept slice used the adjacent in-scope `RefreshRemoteOptions` and helper-only test support candidates instead of changing already-narrow fields.

Preserved/deferred categories in the same package remain dependency/extension option bags, loader `AbortSignal` option surfaces, exported status/result API shapes that need separate compatibility review, test case local option bags, and value-level maps such as `Map<string, string | undefined>`.

## Follow-Ups

Future `worktree-status` slices should continue to avoid public/dependency option bags unless a normalized internal boundary is introduced. If exported status/result shapes such as GH status URL/message or graphite diagnostic fields are considered later, treat them as a separate compatibility decision rather than batching them with test-helper cleanup.
