# Batch 3 Mutation Robustness Complete

## Summary

Batch 3 finding E is complete. PR #1718 (`https://github.com/dagster-io/asdl-tools/pull/1718`) implements the accepted contract: preflight areg-owned file mutations before mutation begins, and surface explicit partial-state evidence when execution still fails after preflight. Rollback remains intentionally out of scope because filesystem writes and the external `npx skills add` operation cannot be honestly rolled back by areg.

The implementation adds project-gateway preflight methods for write/delete/remove-empty-dir operations, a shared mutation operation status vocabulary, and fake gateway controls for independent preflight and execution failures. `areg init` now preflights planned writes before running `npx skills add`, reports `npx skills add` as an external operation in failure evidence, and preserves concise human failure output while exposing machine-readable JSON evidence. `areg skill apply` now resolves and plans the whole requested skill batch, collects deletion confirmations before preflight, preflights the combined batch before mutation, and reports top-level plus per-skill operation statuses on failure.

Evidence considered: Graphite parent `areg-replacement-skill-kind-cleanup-stack`; local branch commit `a953f3d51` on `areg-preflight-partial-state-evidence`; local branch diff against the Graphite parent touches only `ts/packages/areg/**` source/tests; PR #1718 corroborates the same file set. Validation passed with `pnpm --dir ts run check`, targeted mutation/init/skill-apply tests (`ts/packages/areg/test/scenario/init-cli.test.ts`, `ts/packages/areg/test/scenario/skill-apply-cli.test.ts`, `ts/packages/areg/test/unit/project-mutations.test.ts`), and `pnpm --dir ts exec areg check --path ..`.

## Objective Impact

The Batch 3 roadmap row is marked complete. The Objective's E open question is resolved in favor of preflight plus structured evidence rather than rollback. This satisfies the completion criterion that `areg init` and skill-kind apply either avoid predictable half-applied local validation/write failures before mutation or intentionally document and surface partial state.

The remaining active Objective work is Batch 4 gateway/skill-kind decomposition and Batch 5 shim/version cleanup. Batch 3 also leaves a durable design boundary for those later refactors: `applyProjectMutationPlan` owns the shared areg-owned file operation status vocabulary, while command-specific operations may keep result-envelope shaping local until another caller proves a common abstraction.

## Follow-Ups

- Start Batch 4 only after confirming whether the target is one `AregProjectInspectionGateway` or a shared `inspectProject` core with thin wrappers.
- Keep rollback out of scope unless a future Objective explicitly revisits transaction semantics for areg-owned files and external skills operations.
