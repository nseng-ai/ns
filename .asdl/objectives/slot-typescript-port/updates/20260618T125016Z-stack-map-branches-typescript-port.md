# Stack Map Branches TypeScript Port

## Summary

Ported the hidden `slot gt exec stack-map-branches` Operation to the active TypeScript `@asdl/slot` CLI.

The new TypeScript command preserves the Python fallback's stack-map contract for skill/agent callers: `current`, `trunk`, `scope: "stack-map"`, `recent_limit`, branch rows with `validation_result` and `needs_restack`, graph edges, assigned slot rows, and warnings. It remains under the explicitly Graphite-named `slot gt exec` boundary and reads Graphite's metadata store through the existing sqlite-backed gateway path rather than parsing human-facing `gt` output.

Live consumer evidence that revived the previously deferred row:

- `ts/packages/sdlcc/src/stack-map-model-loader.ts` shells out to `slot gt exec stack-map-branches --format json` at runtime.
- `skills/objective-bulk-refresh/SKILL.md` names the same command as its full Graphite topology/worktree-map source.

Implementation evidence:

- Added a TypeScript stack-map Operation under `ts/packages/slot/src/operations/gt/exec/stack-map-branches.ts` and registered it under hidden `slot gt exec`.
- Extended slot git and Graphite gateways/fakes with local-branch-tip inventory and a full metadata graph read.
- Extended `@asdl/core/graphite-metadata` topology rows with raw `validationResult` while keeping `needs_restack` policy in slot code as `validation_result == "BAD_PARENT_NAME"`.
- Added fake-backed slot scenario coverage for success shape, compact human rendering, recent-limit behavior, local-branch filtering, fork/warning behavior, dedupe, edge/order contract, and stable failure mappings.
- Added targeted `sdlcc` loader coverage showing representative command data with both `validation_result` and `needs_restack` still parses into the stack-map model.

## Compatibility Notes

No intentional schema deviation from the Python result contract was introduced. The TypeScript real gateway distinguishes a missing Git common dir as `git_common_dir_missing`; metadata read and schema failures remain `gt_metadata_read_failed`. The command still skips untracked recent branch names after applying the recent-limit slice, matching the Python selection order.

Historical updates that said `stack-map-branches` remained deferred are now superseded by this update; they were left unchanged as historical records.

## Validation

- `pnpm --dir ts/packages/slot run test`
- `pnpm --dir ts/packages/slot run check`
- `pnpm --dir ts/packages/sdlcc run test -- stack-map.test.ts`
- `pnpm --dir ts/packages/sdlcc run check`
