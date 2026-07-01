# Kernel CLI Internal Options Narrowing

## Summary

Narrowed SDL kernel CLI/internal extension-loading option shapes from raw optional `| undefined` to omission-only optional properties where present-key `undefined` has no distinct meaning from absence.

Changed fields and call sites:

- `ts/packages/kernel/src/cli.ts`: narrowed extension registry deps, CLI deps other than the preserved env-map seam, build options/state, completion resolver options, and CLI context-builder options.
- `ts/packages/kernel/src/extension-discovery.ts`: narrowed local diagnostic helper options and added a small `diagnosticLocation` helper so undefined command names are omitted.
- `ts/packages/kernel/src/extension-registry.ts`: narrowed `homeDir` and diagnostic prefix helper options while preserving the raw env-map seam.
- `ts/packages/kernel/src/sdk/command-io.ts`: narrowed omission-only command-I/O input callbacks while preserving the `phaseSticky` callback payload that deliberately receives `undefined` to clear sticky state.
- Kernel tests: narrowed directly matching test fixture/helper option shapes in `command-io.test.ts`, `completion-cli.test.ts`, and `roaster-extension-cli.test.ts`.

Semantic claim: these kernel-owned option/helper/test fields use omission as the absent state. Existing construction and consumers already used optional chaining, `??`, or omission spreads; exact-optional fallout was fixed by omitting keys instead of re-widening types.

Preserved/deferred categories:

- Preserved env-map/process seams such as `env?: Record<string, string | undefined> | undefined`; map values intentionally allow `undefined`, and this slice did not normalize the public dependency contract.
- Preserved `phaseSticky?: (value: string | undefined) => void`; the callback payload uses `undefined` as a real clear signal.
- Left `ts/packages/kernel/src/context.ts` and scenario fake env fields alone as env-map surfaces.

Scorecard using `node .sdl/objectives/eliminate-redundant-optional-undefined/tools/measure-objective.mjs`:

| Scope                | Raw optional-undefined properties before | Raw optional-undefined properties after | Undefined-normalization/check lines before | Undefined-normalization/check lines after |
| -------------------- | ---------------------------------------: | --------------------------------------: | -----------------------------------------: | ----------------------------------------: |
| `ts`                 |                                      205 |                                     172 |                                       2332 |                                      2357 |
| `ts/packages/kernel` |                                       35 |                                       2 |                                        153 |                                       178 |

The undefined-check count increased because exact-optional fallout was fixed with conditional omission spreads.

## Objective Impact

This advances the continuous cleanup row with a coherent kernel package slice. The kernel scoped raw optional-undefined count is now down to preserved/deferred env-map and clear-callback categories, making future kernel cleanup decisions smaller and better classified.

Validation evidence:

- `pnpm --dir ts --filter @sdl/kernel run check`: passed.
- `pnpm --dir ts --filter @sdl/kernel run test`: passed, 14 files / 95 tests.
- `pnpm --dir ts run fmt:check`: initially failed on `packages/kernel/src/cli.ts`; fixed with `pnpm --dir ts run fmt`, then passed.
- `pnpm --dir ts run lint`: passed.
- `pnpm --dir ts run check`: passed.

## Follow-Ups

Continue treating env-map seams and callback payloads that intentionally carry `undefined` as preserved unless a separate boundary-normalization plan replaces them. Future slices should choose another package/subsystem cluster rather than reopening kernel env-map candidates mechanically.
