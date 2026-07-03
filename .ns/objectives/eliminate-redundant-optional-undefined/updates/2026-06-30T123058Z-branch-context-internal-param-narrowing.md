# Branch-Context Internal Param Narrowing

## Summary

Narrowed a scoped branch-context internal cleanup slice from 29 to 22 `?: ... | undefined` candidates under `ts/packages/branch-context/src`.

Changed fields:

- `AttachBranchContextParams.key`, `filePath`, `planSlug`, and `branch` now use omission-only optional properties.
- Inline params for `listBranchContextEntries`, `checkBranchContextEntry`, and `deleteBranchContextEntry` now use omission-only `branch?: string`.
- Private `LoadedPlanJsonOptions.promptFile`, `attachedPlanContent`, and `implementationPrompt` now use omission-only optional properties.

Construction paths were updated to use the repository's exact-optional object-spread idiom when adapting Zod-inferred CLI request objects into stricter internal primitive params and loaded-plan JSON options.

## Objective Impact

This advances the standing optional-undefined cleanup by splitting loose CLI request/input shapes from stricter internal branch-context primitive/result helper shapes. The remaining branch-context candidates were classified as preserved for now because they are public/caller option bags (`signal`, `cwd`, `env`, `planStoreRoot`, dependency seams), saved-plan/session option surfaces, or fake gateway method signatures mirroring `BrmemGateway` compatibility inputs.

Validation passed:

- `pnpm --dir ts --filter @sdl/branch-context run check`
- `pnpm --dir ts --filter @sdl/branch-context run test`
- `pnpm --dir ts run fmt:check -- packages/branch-context/src/attach.ts packages/branch-context/src/operations.ts`

## Follow-Ups

- Future branch-context/plans cleanup should preserve public option and gateway mirror surfaces unless a normalized internal type boundary is introduced first.
- If a later slice targets `@sdl/plans`, start by separating saved-plan session/input option bags from evidence/result records rather than narrowing the shared `PlanStoreOptions` compatibility surface.
