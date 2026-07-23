# Semantic Update: Land Optional Cleanup Delivered

## Summary

`ns flow land` now resolves exact effective-catalog presence of `@nseng-ai/slots` once at the ns command boundary and carries that explicit invocation fact through both canonical stack and single-branch execution.

When Slots is present, existing managed-slot confirmation and cleanup behavior remains intact. When Slots is absent:

- managed-worktree checkout conflicts refuse before confirmation or PR, Graphite, ref, or Slots mutation, with tool-neutral detach/remove guidance;
- successful stack and single-branch landings keep the managed worktree and local branch and report `slots-extension-not-installed` as a successful, skipped optional-cleanup outcome;
- `--force` does not make Slots mandatory, while `--preserve` and dry-run retain their existing precedence;
- canonical managed-path shape with no PR path remains the existing successful nothing-to-do outcome.

The separate README/code-adjacent contract-alignment roadmap row remains open.

## Objective Impact

The land optional-enhancement roadmap row is complete. Exact presence, checkout safety, and successful optional-cleanup absence are now explicit independent facts. The Objective remains open for the separate README/code-adjacent alignment slice.

## Evidence

- Production and fake-driven tests cover Slots-present behavior, absent-Slots conflict refusal, no prompt or Slots operation, successful optional-cleanup absence, force/preserve/dry-run precedence, single-branch parity, and no-PR/trunk behavior.
- A command-boundary scenario invokes `flowLandCommand.run`, proves one exact `@nseng-ai/slots` lookup, and observes the absent value reach single-branch runtime composition by triggering the pre-mutation managed-worktree refusal with no Slots, PR, Graphite, or ref mutation.
- Review found and repaired a material fast-path gap: single-branch execution now applies the same absent-Slots managed-worktree safety gate as canonical stack execution.
- `ExecuteStackLandingOptions.hasSlotsExtension` is required; all production and test callers provide the capability fact explicitly, with no compatibility default.
- `pnpm --dir ts exec tsc -p packages/capabilities/flow/tsconfig.json --noEmit` passed after remediation.
- Focused Flow land remediation tests passed: 146 tests across six files; the touched land sandbox integration passed: 5 tests.
- The full default Flow package suite passed after remediation: 89 files, 964 tests.
- `just ts-test-integration` passed: 49 files, 191 tests; `just ts-test-isolated` passed: 5 files, 16 tests; and `just ts-test-typescript-style-guard` passed: 148 tests.
- Formatting was applied with `just ts-format-fix`; `git diff --check`, `ns objective check flow-slots-opt-in`, and the full `just` validation passed afterward.

## Follow-Ups

- Align the complete Flow README command matrix, requirements, and integration narrative in the remaining roadmap slice.
- Carry this delivery evidence into `slots-consumer-dependency-contracts` synthesis.

## Change identity

Implementation is currently uncommitted on branch `flow-land-optional-slots-cleanup`, based on ancestor `332c95f14`. No PR or commit identity is available yet.
