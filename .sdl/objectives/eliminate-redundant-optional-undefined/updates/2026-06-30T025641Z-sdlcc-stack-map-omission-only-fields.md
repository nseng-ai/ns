# sdlcc Stack Map Omission-Only Fields

## Summary

Narrowed a coherent `ts/packages/hosts/sdlcc` stack-map model/presentation slice by removing redundant explicit `| undefined` from omission-only optional declarations in `StackMapSlotAssignment`, `StackMapParsedCmuxTab`, `StackMapBranchNode`, `StackMapCmuxChoice`, `StackMapState`, `StackMapCmuxActivationPlan`, the local `buildStackMapModelFromGraph` option shape, and the matching stack-map test fixture helper.

Scoped `sdlcc` candidate count from `rg -n "\\?:[^\\n;=]*\\| undefined" ts/packages/hosts/sdlcc --glob '*.ts'` moved from 38 to 21.

Validation passed:

- `pnpm --dir ts run fmt:check`
- `pnpm --dir ts run lint`
- `pnpm --dir ts run check`
- `pnpm --dir ts/packages/hosts/sdlcc run test` (6 files, 66 tests)

## Objective Impact

This advances the standing optional-undefined cleanup loop with the stack-map presentation/action cluster deferred by the prior `sdlcc` update. The semantic claim is that these fields model absent internal stack-map facts by omission, not by a meaningful present key with `undefined`:

- cmux parsed-tab metadata and slot worktree paths are constructed with `optionalEntry` helpers that omit absent keys;
- branch graphite notes now use `optionalEntry` at model construction sites instead of materializing `graphiteNote: undefined`;
- cmux activation choices/plans omit absent slots or branch context;
- stack-map state only sets `statusMessage` when a concrete status exists;
- local model-builder array options default omitted arrays with `?? []`.

Preserved/deferred categories in the same package remain dependency/options bags, CLI/env surfaces, cmux-report environment mirrors, OpenTUI renderer input, and terminal key descriptor/test input shapes because those are compatibility/input surfaces or separate semantic decisions rather than internal omission-only model facts.

## Follow-Ups

Continue preserving the remaining 21 scoped `sdlcc` candidates unless a future slice proves a stricter internal boundary. In particular, do not batch environment/dependency options or terminal key-input mirrors with stack-map model cleanups merely because they share the same syntax.
