# exec skillx Clinkr envelope divergence accepted

## Summary

Implemented the Objective decision that TypeScript `areg exec skillx parse|list|fetch|cleanup` should use normal Clinkr rendered-command behavior instead of preserving Python's raw-JSON hidden helper boundary.

This slice adds the `exec skillx` parser/handlers, real host/GitHub/`npx skills`/transient-workspace adapters, workspace cleanup ownership on `AregSkillxWorkspaceGateway`, package-local fake support, and unit/scenario/gateway coverage for parse/list/fetch/cleanup behavior.

Machine callers of the TypeScript implementation must pass `--format json` and read the Clinkr envelope. The old operation payloads remain nested under envelope `data` for success and domain-negative outcomes where applicable; Clinkr precondition failures use the standard failure envelope with `error_type` and `message`.

Focused validation passed:

- `pnpm --dir ts --filter @asdl/areg run check`
- `pnpm --dir ts --filter @asdl/areg run test`

## Objective Impact

This records an accepted divergence from the earlier raw JSON preservation expectation in the contract inventory. The hidden `exec skillx` roadmap row can now proceed with Clinkr envelope scenario coverage instead of raw-output parity tests.

Python `packages/areg` remains the active reference path for live users during this slice; the live `skills/skillx/SKILL.md` caller instructions are intentionally unchanged.

## Follow-Ups

- During the TypeScript cutover/distribution row, update `skills/skillx/SKILL.md` and any install/caller docs to teach `--format json` and Clinkr envelopes.
- Recheck for any Python fallback story at cutover before removing raw-JSON caller language.
