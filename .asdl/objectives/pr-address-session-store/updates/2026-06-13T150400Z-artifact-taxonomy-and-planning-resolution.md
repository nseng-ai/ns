# Semantic Update: Artifact Taxonomy and Planning Resolution Implemented

## Summary

Implemented the session artifact-kind/resolution roadmap slice for `@asdl/pr-address`.

The slice establishes scope-first reserved descriptors, strict latest-by-sequence resolution over the existing payload session store, classification persistence, and implicit session-resolved planning paths for both single-PR and stack workflows.

## Decisions Recorded in Code

- Reserved descriptors now use scope-first names:
  - PR: `pr-address-pr-<pr-number>-<kind>`
  - PR batch: `pr-address-pr-<pr-number>-batch-<batch-id>-<kind>`
  - stack: `pr-address-stack-<kind>`
- Latest artifact resolution is exact descriptor + role + `.json`, selected by highest payload sequence.
- No index or journal file was introduced.
- `plan-feedback` implicit session resolution requires `--pr-number`; there is no latest-across-any-PR mode.
- Planning outputs for implicit session paths include `resolved_inputs` with concrete `PayloadReference` facts.

## Implemented Proof Paths

- `get-feedback` now writes PR-scoped raw feedback and a PR-scoped manifest summary artifact.
- `stack-feedback-prep` now writes PR-scoped feedback, manifest, classification-template artifacts, plus `pr-address-stack-prep`.
- `validate-feedback-classification` persists a validated PR-scoped classification artifact when a payload session is supplied or present in the environment.
- `plan-feedback --pr-number <n>` resolves latest manifest/classification from the session, emits `resolved_inputs`, and writes `pr-address-pr-<n>-plan`.
- `stack-feedback-plan` resolves latest `pr-address-stack-prep` plus per-PR classifications when no explicit payload/prep source is supplied, emits `resolved_inputs`, and writes `pr-address-stack-plan`.

## Validation Evidence

- `pnpm --dir ts/packages/pr-address run test` — passed, 29 files / 395 tests.
- `pnpm --dir ts/packages/pr-address run check` — passed.

## Remaining Follow-ups

- Mutation/build/checkpoint/finalization helpers still use composed payloads or explicit references and were intentionally not migrated in this slice.
- `stack-feedback-diff-current`, `stack-feedback-preflight`, and later mutation helpers can now reuse the reserved stack/batch descriptor names.
- Deprecation timing for composed `--payload-json` / `--payload-file` inputs remains a later roadmap decision.
- Skill/workflow docs for the final session-store path remain a later roadmap row.
