# Handoff: Remove CLI-owned Saved Plan input cleanup

Continuation focus: Remove `--remove-content-file` and return temporary-file lifecycle ownership to the caller, while retaining the other Saved Plan cleanup refactors on this branch.

## Context

Branch `saved-plan-parseback-cleanup` is stacked on `make-saved-plan-selection-durable-only`. It implements the selected Saved Plan review-cleanup plan in commit `83a5e835c`, including parse-back filename evidence, shared CLI schemas/flattening, timestamp-seam scoping, helper inlining, and the disputed `--remove-content-file` capability. After implementation, the user questioned that flag because the caller creates and owns the transport file. The current conclusion is that deletion belongs to the caller and the save command should remain non-destructive with respect to caller-supplied input.

## Current State

- Working tree is clean.
- Commit `83a5e835c` contains all current work; it has not been pushed or submitted.
- Full `just`, the TypeScript style guard, focused plans/branch-context/Pi suites, and plans integration tests passed before this handoff.
- `enriched-plan exec save` currently accepts `--remove-content-file`, returns optional `contentFileRemoved`, calls `PlanStoreGateway.removeFile`, and warns on stderr when deletion fails.
- Three planning-prompt copies and `docs/pi/branch-context-workflow.md` currently pass the flag and omit caller cleanup.

## Decisions / Findings

- Remove `--remove-content-file`: the caller owns the content file because it creates and supplies it.
- Remove the related partial-success protocol (`contentFileRemoved` and cleanup warnings) and the gateway deletion expansion.
- Retain the independent improvements from the commit: parsed `fileStem`, filename parse-back in `savePlanContentBytes`, dead candidate-field removal, shared result schema/flattener, save-only `localTimestamp`, deleted `Clock` seam, typed selection directory, and inlined identity helpers.
- Restore prompt-owned cleanup only after confirmed save success. Preserve failure retention: when save does not succeed, retain and report the exact temporary path.
- Do not change `compareSavedPlanRecency`; mtime/path ordering remains explicitly out of scope.
- The implementation plan claimed no test injected `clock`, but `saved-plan-format.test.ts` did; it was correctly converted to scoped `localTimestamp` and should remain that way.

## Next Steps

1. Remove `removeContentFile` from `saveRequestSchema`, `contentFileRemoved` from `saveResultSchema`, the cleanup branch in `handleSave`, `removeSavedPlanContentFile`, and the `stderr` addition to `PlansCliContext`/`prepareRun` if no longer needed.
2. Remove `PlanStoreGateway.removeFile` and both real/fake implementations.
3. Delete CLI scenario tests for flag success, save-failure retention via the flag, and warn-but-succeed cleanup failure; restore the absent-flag save assertion to ordinary wire-compatibility coverage. Remove the flag from the exact SAVE_HELP pin.
4. Remove the real-gateway `removeFile` integration test.
5. Update the built-in prompt, grilled inline prompt, and `.ns` override to invoke save without the flag and restore caller-owned `rm -- '<exact path>'` only after confirmed success. Keep retained-on-save-failure behavior and the transport-only contract.
6. Update prompt assertions and `docs/pi/branch-context-workflow.md` accordingly.
7. Run focused suites, integration tests, `just`, and the TypeScript style guard. Amend commit `83a5e835c` with `gt modify --no-edit`; do not submit unless asked.
8. Compare changed files with the original plan scope and report this intentional product-decision deviation.

## Investigation Sources

- Source session ID: 01a02edc-5115-7184-8a99-87bfbbe5e7c3
- Source session log: /Users/schrockn/.pi/agent-ns-dev/sessions/--Users-schrockn-.local-state-ns-slots-repos-ns-worktrees-slot-09--/2026-08-23T13-43-05-749Z_01a02edc-5115-7184-8a99-87bfbbe5e7c3.jsonl
- Related files:
  - /Users/schrockn/.local/state/ns/enriched-plan/gh--nseng-ai--ns/make-saved-plan-selection-durable-only/saved-plan-parseback-cleanup--26-08-22T23-09-28--1.md — authoritative selected implementation plan and original scope.
  - ts/packages/incubating/extensions/plans/src/cli.ts — flag, result evidence, cleanup warning, and shared schema/flattener implementation.
  - ts/packages/incubating/extensions/plans/src/plan-store-gateway.ts — real deletion gateway method.
  - ts/packages/incubating/extensions/plans/src/testing.ts — in-memory deletion implementation.
  - ts/packages/incubating/extensions/plans/test/scenario/cli.test.ts — exact help and all flag behavior tests.
  - ts/packages/incubating/extensions/plans/test/integration/plan-store-gateway.test.ts — real deletion adapter test.
  - ts/packages/incubating/hosts/pi/extensions/pi-ns-branch-context/src/prompts/plans-write-default.md — built-in caller procedure.
  - ts/packages/incubating/hosts/pi/extensions/pi-ns-branch-context/src/saved-plan-commands.ts — grilled prompt's inline procedure.
  - .ns/prompts/branch-context.plans-write.md — repository-specific prompt override.
  - ts/packages/incubating/hosts/pi/extensions/pi-ns-branch-context/test/branch-context-extension-helpers.test.ts — prompt-policy assertions for built-in and override copies.
  - docs/pi/branch-context-workflow.md — documented CLI invocation.

## Useful Commands / Files

```bash
git show --stat 83a5e835c
rg -n 'remove-content-file|removeContentFile|contentFileRemoved|removeFile|rm --' .ns docs/pi ts/packages/incubating/extensions/plans ts/packages/incubating/hosts/pi/extensions/pi-ns-branch-context
cd ts && pnpm vitest run packages/incubating/extensions/plans packages/incubating/extensions/branch-context packages/incubating/hosts/pi/extensions/pi-ns-branch-context
cd ts && pnpm vitest run --config vitest.integration.config.ts packages/incubating/extensions/plans/test/integration
just
just ts-test-typescript-style-guard
```
