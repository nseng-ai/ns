# Classified Preserve Reporting

## Summary

Updated the Objective-owned optional-undefined measurement tooling so the historical raw AST match count stays comparable while the current scorecard also reports metadata-backed classified preserves and actionable raw optional-undefined debt.

Before scorecard shape:

| Scope | Raw optional-undefined properties | Typed `ExplicitUndefined` contracts | Legacy preserve markers | Undefined-normalization/check lines |
| ----- | --------------------------------: | ----------------------------------: | ----------------------: | ----------------------------------: |
| `ts`  |                                 3 |                                  96 |                       0 |                                2609 |

After scorecard shape:

| Scope | Raw optional-undefined properties | Classified preserves | Actionable raw optional-undefined debt | Typed `ExplicitUndefined` contracts | Legacy preserve markers | Undefined-normalization/check lines |
| ----- | --------------------------------: | -------------------: | -------------------------------------: | ----------------------------------: | ----------------------: | ----------------------------------: |
| `ts`  |                                 3 |                    3 |                                      0 |                                  96 |                       0 |                                2609 |

## Objective Impact

Added explicit current-preserve metadata at `.ns/objectives/eliminate-redundant-optional-undefined/tools/classified-preserves.json` for the three known intentional discriminants:

- `ts/packages/capabilities/flow/test/unit/land-stack-command-scenarios.test.ts`: `next?: undefined` in the no-next-branch arm of `MergeNumberedBranchOptions`.
- `ts/packages/capabilities/flow/test/unit/land-stack-command-scenarios.test.ts`: `stackEnd?: undefined` in the same no-next-branch arm.
- `ts/packages/kernel/src/extensions/registry.ts`: `PreinstalledNsCommandPackageCatalogEntry.load?: undefined` distinguishing package catalog entries from loaded catalog entries.

The measurement tool now matches preserve metadata by path, property, and declaration text, reports stale/unmatched metadata visibly, and exposes the additive fields in both Markdown and JSON output. The raw `Raw optional-undefined properties (net debt)` row remains the total raw AST match count for historical comparison; the new actionable-debt row is the primary next-work signal after subtracting matched preserves.

The three preserved source declarations were not narrowed or converted merely to reduce the raw metric.

## Validation Evidence

- `node .ns/objectives/eliminate-redundant-optional-undefined/tools/measure-objective.mjs --self-test` passed.
- `node .ns/objectives/eliminate-redundant-optional-undefined/tools/measure-objective.mjs ts` reported raw `3`, classified preserves `3`, actionable raw debt `0`, typed contracts `96`, legacy markers `0`, undefined checks `2609`.
- `node .ns/objectives/eliminate-redundant-optional-undefined/tools/measure-objective.mjs --json ts` exposed the same metric values, with three classified preserves, zero stale preserves, and zero actionable raw matches.
- Stale-term check for `.ji/objectives`, `.sdl/objectives`, classified-preserve terminology, actionable raw debt, and raw metric wording found no remaining retired objective paths in the touched tools.

## Follow-Ups

- If a preserved declaration changes, re-run the measurement tool and reclassify any stale preserve metadata rather than silently treating the entry as valid.
- Hard enforcement or a repo-wide allowlist remains out of scope for this Objective slice.
