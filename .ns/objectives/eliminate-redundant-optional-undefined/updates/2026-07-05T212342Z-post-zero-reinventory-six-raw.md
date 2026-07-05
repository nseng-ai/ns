# Post-Zero Reinventory: Six Raw Candidates, Half Discriminants

## Summary

Verified rebaseline against trunk (`objective-refresh`, no code changes). Findings:

- `tools/measure-objective.mjs ts` at the current trunk base (`8fdc6f5`) reports repo-wide raw optional-undefined count **6** across four files, up from the 2 recorded at the 2026-07-03 rebaseline (`5668ac5`). Auxiliary metrics: 96 typed `ExplicitUndefined` contracts (unchanged), 0 legacy preserve markers (unchanged), and 2637 undefined-normalization/check lines (up from 2450 — unrelated repo growth, consistent with the record's boundary-not-monotonic guidance).
- The six raw candidates and their preliminary classification:
  - `ts/packages/infra/brmem/src/ref-layout.ts` (2): `namespace?: string | undefined` in the `resolveOptionalNamespaceScope` and `resolveRequiredNamespaceScope` request shapes — the original two candidates carried since 2026-07-03; plausible omission-only narrowing pending construction-path evidence.
  - `ts/packages/tools/areg/test/unit/skill-kind-inference.test.ts` (1): `replacementSurface?: string | undefined` on a test helper param shape; plausible omission-only narrowing.
  - `ts/packages/capabilities/flow/test/unit/land-stack-command-scenarios.test.ts` (2): `next?: undefined` / `stackEnd?: undefined` on the second arm of the `MergeNumberedBranchOptions` discriminated union — present-key `undefined` is the union discriminant, so these are preserve, not debt.
  - `ts/packages/kernel/src/extensions/registry.ts` (1): `readonly load?: undefined` on `PreinstalledNsCommandPackageCatalogEntry`, distinguishing it from the loaded-catalog sibling — also a discriminated-union discriminant, preserve.
- Durable path claims re-verified as correct against ground truth: `ExplicitUndefined` and the primitives mechanism live at `ts/packages/infra/foundation/src/primitives/primitives.ts`; the public SDK surfaces live under `ts/packages/kernel/src/sdk/` (`command.ts`, `execution.ts`, etc.); the closed predecessor is at `.ns/objectives/normalize-optional-undefined-boundaries` (present, not archived). The `.ji/objectives/...` and `infra/core` paths cited in the 2026-07-03 update are historical; current record prose already uses the correct `.ns`/`foundation` forms.
- Seed-stack PRs #2420, #2423, #2428, #2429 re-confirmed MERGED (all 2026-06-30 via `gh`); the roadmap's "merged" wording stands.

Provenance: objective-refresh basis target=8fdc6f50661d8df81024bbcce3c722fb7411441d from=trunk-HEAD

## Objective Impact

The standing loop's known live inventory is now six raw candidates, not two, but only about half is genuine omission-only debt: the two brmem request fields and the areg-test helper field. The other three (`next?: undefined`/`stackEnd?: undefined`, `load?: undefined`) are discriminated-union discriminants that the AST measurement tool legitimately counts as raw but a runner should classify as preserve — evidence that the raw metric alone overstates debt when discriminated-union `?: undefined` patterns exist. The `[~]` classify-reintroductions roadmap row now records this six-candidate state and caveat. This does not authorize enforcement; the parked hard-guard consideration gains slightly stronger reintroduction-rate evidence.

## Follow-Ups

- Next cleanup slice candidates (omission-only): the two brmem `namespace?` request fields and the areg-test `replacementSurface?` field, pending construction-path evidence; the inventory is legitimately small, so record exhaustion evidence rather than padding.
- Treat the flow-test and kernel-registry `?: undefined` entries as preserve (discriminated-union discriminants); do not narrow them to reduce the count.
- Consider whether the measurement tool should distinguish discriminated-union `?: undefined` discriminants from omission-only raw debt, so the raw metric more faithfully reflects actionable debt.
