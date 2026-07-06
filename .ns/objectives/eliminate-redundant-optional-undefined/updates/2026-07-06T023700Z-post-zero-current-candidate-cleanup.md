# Post-Zero Current Candidate Cleanup

## Summary

Cleaned up the current post-zero raw optional-undefined inventory by removing omission-only raw optional-undefined properties from brmem namespace scope helpers, a GitHub PR feedback author normalizer helper, and an areg test helper while preserving the intentional discriminated-union candidates.

Plan-format note: the attached branch-context plan did not include new-format current-state excerpt/gate sections, so this was treated as an old-format/pre-contract authoritative plan. The loader-selected branch was `post-zero-optional-undefined-cleanup-classification`; stale plan provenance paths were not used as STOP conditions.

Before metrics:

| Scope                  | Raw optional-undefined properties | Typed `ExplicitUndefined` contracts | Legacy preserve markers | Undefined-normalization/check lines |
| ---------------------- | --------------------------------: | ----------------------------------: | ----------------------: | ----------------------------------: |
| `ts`                   |                                 8 |                                  96 |                       0 |                                2606 |
| scoped candidate files |                                 8 |                                   1 |                       0 |                                  47 |

After metrics:

| Scope                  | Raw optional-undefined properties | Typed `ExplicitUndefined` contracts | Legacy preserve markers | Undefined-normalization/check lines |
| ---------------------- | --------------------------------: | ----------------------------------: | ----------------------: | ----------------------------------: |
| `ts`                   |                                 3 |                                  96 |                       0 |                                2609 |
| scoped candidate files |                                 3 |                                   1 |                       0 |                                  47 |

Scoped candidate files measured:

- `ts/packages/infra/brmem/src/ref-layout.ts`
- `ts/packages/tools/areg/test/unit/skill-kind-inference.test.ts`
- `ts/packages/capability-kit/src/github/pr-feedback/normalizers.ts`
- `ts/packages/capabilities/flow/test/unit/land-stack-command-scenarios.test.ts`
- `ts/packages/kernel/src/extensions/registry.ts`

## Objective Impact

Removed five raw optional-undefined properties that were not semantically load-bearing:

- `ts/packages/infra/brmem/src/ref-layout.ts`: narrowed `resolveOptionalNamespaceScope` and `resolveRequiredNamespaceScope` request shapes from raw `namespace?: string | undefined` to omission-only `namespace?: string`.
- `ts/packages/infra/brmem/src/operations/list.ts`, `gc.ts`, and `copy.ts`: normalized Zod-inferred request objects at the helper boundary with conditional spread so undefined namespace values are omitted under `exactOptionalPropertyTypes`.
- `ts/packages/capability-kit/src/github/pr-feedback/normalizers.ts`: removed the helper-local raw optional author/user object shape. Typecheck showed Zod-inferred inputs still carry `undefined`; the helper now accepts the local `user`/`author` values directly and preserves the existing `user ?? author ?? null` behavior.
- `ts/packages/tools/areg/test/unit/skill-kind-inference.test.ts`: replaced explicit `replacementSurface: undefined` test modeling with an explicit `replacementSurfaceAbsent: true` helper option. Omitted options still default to `demo:skill`; the absence marker still produces no registry replacement surface.

Preserved by classification, not edited:

- `ts/packages/capabilities/flow/test/unit/land-stack-command-scenarios.test.ts`: `MergeNumberedBranchOptions` keeps `next?: undefined` and `stackEnd?: undefined` as no-next-branch-arm discriminants.
- `ts/packages/kernel/src/extensions/registry.ts`: `PreinstalledNsCommandPackageCatalogEntry.load?: undefined` remains a discriminant against the loaded catalog entry arm.

The raw metric now accurately reflects the three intentionally preserved discriminants in this scoped inventory. Measurement-tool improvements remain deferred by scope.

Validation evidence:

- `pnpm --dir ts run check` passed.
- `pnpm --dir ts run test -- --run packages/tools/areg/test/unit/skill-kind-inference.test.ts packages/capability-kit/test/github/github-cli.test.ts packages/infra/brmem/test` passed; Vitest reported 442 test files and 4449 tests passed.
- After metrics matched the expected raw-count drop from 8 to 3 both repo-wide and scoped.

## Follow-Ups

- Treat the remaining raw count of 3 as classified preserve unless the union shapes change: two flow-test no-next-branch discriminants and one kernel-registry package-vs-loaded-entry discriminant.
- If future runs want a zero-looking scorecard, pursue a separate measurement-tool/classification improvement rather than narrowing these discriminants merely to reduce the raw metric.
- Enforcement/allowlist work remains parked and was not touched.
