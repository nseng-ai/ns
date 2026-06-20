# Shared File-State Helper Landed

## Summary

The latest local branch state extends the Batch 1 duplication cleanup by adding `ts/packages/areg/src/operations/file-state.ts` and reusing its `rejectTextState` / optional-directory validation helpers from Pi settings, init, and project-agent parsing. This removes the duplicated `rejectTextState` implementations that remained after the shared `.pi/settings.json` parser landed, while preserving the same error-shape intent for those call sites.

Evidence considered: Graphite parent `areg-project-gateway-domain-refactor`; local branch diff includes commits `c81711b01 Extract Pi settings parsing into shared operation`, `eeb645967 [cp] Record Pi settings parser progress`, and `a57dddb7e Address PR review comments (batch 1/1)`. PR #1653 corroborates the parser slice, but the latest local file-state helper commit is ahead of the PR evidence seen here. Verification: `pnpm --dir ts run test -- ts/packages/areg/test/unit/pi-settings.test.ts ts/packages/areg/test/scenario/check-cli.test.ts ts/packages/areg/test/scenario/skill-kind-list-show-cli.test.ts` passed; `pnpm --dir ts run check` passed.

## Objective Impact

Batch 1 finding B remains in progress, but one more named duplication is now removed: `rejectTextState` is centralized instead of implemented separately in init/project-agent parsing. The row should continue to track the remaining verbatim/dead-code cleanup rather than be marked complete.

## Follow-Ups

- Finish the remaining Batch 1 duplication cleanup: `inspectGenericReplacement`, `errorInfo`, and the dead `init.ts` `errorInfo` export.
- After those remaining items land, rerun relevant TS checks and update the Objective before moving to Batch 2.
