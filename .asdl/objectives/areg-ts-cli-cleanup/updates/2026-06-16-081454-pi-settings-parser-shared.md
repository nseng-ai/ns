# Shared Pi Settings Parser Landed

## Summary

The `unify-pi-settings-parsing-check-skill-kind` branch extracts `.pi/settings.json` parsing into `ts/packages/areg/src/operations/pi-settings.ts` and reuses it from both `areg check` and `areg skill` kind flows. The branch also tightens `.pi` validation for symlink/non-file states and changes `areg check` to parse Pi settings only when local skills make the settings relevant.

Evidence considered: Graphite parent `areg-project-gateway-domain-refactor`; local branch diff with one commit (`c81711b01 Extract Pi settings parsing into shared operation`); PR #1653 (`https://github.com/dagster-io/asdl-tools/pull/1653`) corroborating the same file set; `pnpm --dir ts run test -- ts/packages/areg/test/unit/pi-settings.test.ts ts/packages/areg/test/scenario/check-cli.test.ts ts/packages/areg/test/scenario/skill-kind-list-show-cli.test.ts` passed; `pnpm --dir ts run check` passed.

## Objective Impact

Batch 1 finding B is now partially complete: the shared `.pi/settings.json` parser duplication is removed and covered by unit/scenario tests. The Batch 1 duplication row remains in progress because `inspectGenericReplacement`, `rejectTextState`, `errorInfo`, and the dead `init.ts` `errorInfo` export still need grep-verified cleanup before the row can be marked complete.

The change stays within the Objective's execution policy: it is scoped to `ts/packages/areg/**`, preserves CLI contract intent, and lands a behavior-preserving cleanup slice with tests.

## Follow-Ups

- Finish the remaining Batch 1 duplication cleanup: `inspectGenericReplacement`, `rejectTextState`, `errorInfo`, and the dead `init.ts` `errorInfo` export.
- After the remaining Batch 1 cleanup lands, re-run the relevant TS checks and update this Objective again before moving to Batch 2.
