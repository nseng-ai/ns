# Final TypeScript Style Audit Closeout

## Summary

The final closeout audit found two small remaining compliance leaks before closure.

First, direct object-shape `type` aliases had drifted back into a few TypeScript source/test files after the earlier broad interface-conversion slices. Those were converted to `interface` without behavior changes in:

- `ts/packages/asdl-dev/test/scenario/submit-cli.test.ts`
- `ts/packages/ccc/src/autobranch/asdl-dev-checkpoint.ts`
- `ts/packages/pi-extensions/src/changes.ts`
- `ts/packages/pi-extensions/src/changes-summary.ts`
- `ts/packages/pi-extensions/src/fast-text-draft.ts`
- `ts/packages/pi-extensions/test/changes.test.ts`

Second, four test helpers still parsed JSON through broad `JSON.parse(...) as ...` casts. Those now parse into `unknown` and narrow through local record/payload guards in:

- `ts/packages/asdl-dev/test/scenario/preview-url-cli.test.ts`
- `ts/packages/plans/test/list-saved-plans.test.ts`
- `ts/packages/planned-branch/test/scenario/cli.test.ts`
- `ts/packages/pi-extensions/test/cli-command-extension.test.ts`

The audit then reran focused scans for hard emit-time TypeScript constructs, ordinary explicit `any`, object-shape aliases, broad JSON casts, double casts, and direct Node/Pi runtime seams. Remaining object-alias scan hits are discriminated/result unions, function-style compositions, or the previously documented `RunnerSubagentOptions` object-base-plus-mutually-exclusive-union alias. Remaining double-cast hits are test-only malformed-shape fixtures. Remaining direct runtime usage is adapter-owned or contained behind explicit collaborator defaults/options.

Validation passed with targeted package checks/tests for the touched packages and current DI seam packages, plus full TypeScript gates:

- `pnpm --dir ts/packages/ccc run check`
- `pnpm --dir ts/packages/ccc run test -- land-stack.test.ts`
- `pnpm --dir ts/packages/planned-branch run check`
- `pnpm --dir ts/packages/planned-branch run test -- plan-content-slug.test.ts`
- `pnpm --dir ts/packages/pi-extensions run check`
- `pnpm --dir ts/packages/pi-extensions run test -- changes.test.ts attached-plan.test.ts`
- `pnpm --dir ts/packages/asdl-dev run check`
- `pnpm --dir ts/packages/asdl-dev run test -- submit-cli.test.ts`
- `just ts-check`
- `just ts-test`
- `just dprint-check`

## Objective Impact

This completes the final roadmap row, `Capture remaining intentional exceptions and close the audit loop`, and closes the Objective.

The fixed-vs-accepted closeout line is:

- Fixed: final object-shape alias drift in `asdl-dev`, `ccc`, and `pi-extensions` source/tests.
- Fixed: final broad JSON parse casts in test helpers by parsing into `unknown` and narrowing locally.
- Accepted: `RunnerSubagentOptions` remains a `type` because it composes a base object with mutually exclusive option variants.
- Accepted: direct runtime usage in CLIs, command runners, gateways, extension controllers, filesystem watchers, and the documented default collaborator functions is adapter-owned rather than a remaining domain seam.
- Accepted: local JSON/runtime guards remain the right scale; shared decoder helpers and compiler/lint supplements are optional future hardening only if drift recurs.

All non-parked roadmap work is now complete, completion criteria have evidence, and closure caveats are documented in `objective.md`.

## Follow-Ups

- No active follow-up remains for this Objective.
- Future TypeScript work should continue using the `typescript-style` skill, Roaster reviewer, and repo-root agent guidance to prevent drift.
- If repeated drift recurs, consider a separate future Objective for compiler/lint guardrails such as `erasableSyntaxOnly` or targeted custom scans.
