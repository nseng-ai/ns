# Worktree-Status Test Helper Options Narrowing

## Summary

Narrowed a coherent `@sdl/worktree-status` test-helper/fixture cluster by removing redundant explicit `| undefined` from omission-only optional properties in:

- `ts/packages/worktree-status/test/activity.test.ts`
- `ts/packages/worktree-status/test/extension.test.ts`
- `ts/packages/worktree-status/test/worktree-status.test.ts`

Scoped test candidate count for:

```bash
rg -n "\\?:[^\\n;=]*\\| undefined" ts/packages/worktree-status/test --glob '*.ts'
```

moved from 15 to 1. The remaining match is `test/test-support.ts`'s `statuses?: Map<string, string | undefined>` helper parameter, where the map value type intentionally permits undefined status values and was deferred for separate classification.

Changed fields:

- `activity.test.ts` local `testContext` options: `isIdle`, `onTerminalInput`
- `extension.test.ts` local `TestContextOptions`: `cwd`, `sessionCwd`, `statuses`, `setFooter`, `model`, `contextUsage`, `getContextUsage`
- `worktree-status.test.ts` local helper options: `ghWorktreePrStep.result`, `worktreePrCheckRun.workflowName`, `status`, `conclusion`, `startedAt`, `completedAt`

Construction-path evidence: these are test-local helper/fixture option bags. Defaults already use `??`, and optional callback/model/footer/check-run fields are already conditionally omitted with exact-optional-property spread before being placed in returned objects. Present-key `undefined` has no test assertion or compatibility meaning for these helpers.

Validation passed:

- `pnpm --dir ts --filter @sdl/worktree-status test`
- `pnpm --dir ts run check`
- `pnpm --dir ts run lint`
- `pnpm --dir ts run fmt:check`

## Objective Impact

This advances the continuous cleanup row with a package/subsystem-level test-helper slice that exceeds the Objective's minimum edit-site guidance without broadening into production or public surfaces. The semantic claim is that local test helper option objects should model absence by omitted keys, while retaining `T | undefined` only where the value type itself intentionally includes undefined.

Preserved/deferred categories include production `worktree-status/src` dependency/request surfaces such as signals, identity, metadata loaders, timers, clocks, and extension dependencies, plus the remaining `test-support.ts` status-map helper whose inner value type carries `undefined` meaning.

## Follow-Ups

- Future `worktree-status` work should classify production dependency/input surfaces independently rather than inheriting this test-helper result.
- Continue using scoped inventory plus construction-path evidence before narrowing remaining optional-undefined candidates.
