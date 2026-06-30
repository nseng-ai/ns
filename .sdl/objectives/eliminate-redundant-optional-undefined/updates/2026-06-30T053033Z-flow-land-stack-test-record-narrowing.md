# Flow Land-Stack Test Record Narrowing

## Summary

Narrowed the Flow land-stack unit-test helper/record cluster in:

- `ts/packages/capabilities/flow/test/unit/land-stack-command-scenarios.test.ts`
- `ts/packages/capabilities/flow/test/unit/land-stack-topology-guards.test.ts`

Scoped optional-property candidate count for `?: ... | undefined` in these two files moved from 39 to 0. The slice removed redundant explicit `undefined` from local test helper option shapes and normalized the fake observation records so absent call/widget/message options are omitted instead of stored as present keys with `undefined` values.

Changed fields and helpers include `ExecCall.options`, `WidgetUpdate.options`, `expectedSquashMergeArgs` title/body options, `prSnapshot` title/body overrides, `repoIntro`, `postRestackSubmitCheckSteps`, numbered/feature preflight helpers, `mergeNumberedBranch`, `initialBranchPlans`, and single-branch preflight helpers across the duplicated Flow land-stack test files.

Construction-path evidence: `FakePi.sendMessage`, `FakePi.exec`, and `setWidget` now use the repository's exact-optional-property spread idiom to omit absent option keys. Helper forwarding sites that previously passed `title`, `body`, or `featureBBase` as present possibly-undefined properties now conditionally omit them before calling narrowed helpers.

Validation:

- `pnpm --dir ts exec vitest run packages/capabilities/flow/test/unit/land-stack-command-scenarios.test.ts packages/capabilities/flow/test/unit/land-stack-topology-guards.test.ts` passed.
- `just ts-check` passed.
- `just ts-format-check` passed after `just ts-format-fix`.
- `just ts-lint` passed.

## Objective Impact

This advances the standing cleanup loop with a coherent package/subsystem-level test-helper slice rather than another tiny trickle. It confirms that duplicated Flow land-stack test scaffolding can use omission-only optional properties when local fakes/builders already treat absent values as defaulted helper inputs or missing observed option slots.

Reusable classification: local test helper option objects may be narrowed when all same-file callers can omit absent values and the helper owns the defaulting behavior. Observation records should prefer `field?: T` plus spread omission for optional call arguments; keep required `T | undefined` only when the test intentionally records an argument slot as present even when undefined.

## Follow-Ups

- Continue to avoid broad repo-wide sweeps; classify the next package/subsystem cluster independently.
- Preserve public/input/compatibility surfaces unless a normalized internal boundary or local construction evidence justifies narrowing.
