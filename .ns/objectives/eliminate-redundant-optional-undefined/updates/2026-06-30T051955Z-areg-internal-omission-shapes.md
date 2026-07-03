# Areg Internal Omission Shapes

## Summary

Normalized a focused `@sdl/areg` internal-shape slice from redundant optional `undefined` to omission-only optional properties. The scoped areg inventory (`ts/packages/tools/areg/src` plus `ts/packages/tools/areg/test`) moved from 41 to 32 grep candidates for `?: ... | undefined`-style declarations.

Changed fields and construction paths:

- `AregGithubGateway.listSkillDirectoryNames` request `ref?: string` and the fake gateway implementation log now keep `ref` omission-only.
- `AregSkillxInstallRequest.skillName?: string` now has omission-preserving producers in `runSkillxFetch` and the fake skillx operation log.
- `AregCheckPairingDirectory.claudeText?: string` now has omission-preserving real/fake copy construction.
- `LockfileSkillData.skillPath?: string` now normalizes Zod-parsed data and derived `LockfileSkill` records by omitting unavailable `skillPath`.
- Internal file-state validation helper option fields (`symlinkSubject`, `description`, `unreadableMode`) now use omission-only optional properties, with forwarding updated to omit absent `symlinkSubject`.

Validation passed:

- `pnpm --dir ts exec vitest run packages/tools/areg/test`
- `pnpm --dir ts run check`
- `pnpm --dir ts run lint`
- `pnpm --dir ts run fmt:check` after `pnpm --dir ts run fmt`

## Objective Impact

This advances the continuous cleanup row with a coherent areg package slice rather than a repo-wide sweep. The semantic claim is that these fields are internal request/log/result/durable-record/helper shapes where absence is modeled by omitted keys; producers now preserve that model under `exactOptionalPropertyTypes` instead of assigning present-key `undefined`.

Deferred/preserved candidates remain in areg for constructor options, CLI/test scenario option bags, environment-like maps, display-command function parameters, and other compatibility/input surfaces where explicit `undefined` can be a legitimate caller shape or should be narrowed only with a separate local boundary claim.

## Follow-Ups

- Future areg cleanup should not reclassify the preserved option/input/dependency surfaces as safe merely from grep output; inspect call semantics first.
- If a later slice wants to narrow remaining gateway adapter request bags or function parameters, treat that as a separate semantic boundary decision rather than extending this internal-shape cleanup mechanically.
