# CCC Cmux Dispatch Remediation

## Summary

The `ccc` cluster findings were re-probed and fixed in one package-local slice. The shared dispatch prompt path now lives in `dispatchTrackedBranchPrompt`, objective sidebar JSON exec/envelope handling is centralized in `runJsonExecCommand`, dispatch-plan checkout evidence no longer uses the single-field `CurrentCheckout` wrapper, and the unused `launch-status.ts` abstraction was removed after confirming it had no importers.

Validation passed for `pnpm --dir ts --filter @sdl/ccc run check`, `pnpm --dir ts --filter @sdl/ccc run test`, `just ts-format-check`, `just ts-lint`, `just ts-check`, and `just dprint-check` on 2026-06-30.

## Objective Impact

The **ccc** roadmap row now has dispositions for all 4 recorded findings and is marked complete. This reduces the open code-smell-roaster backlog by one cluster without changing observable CCC/cmux dispatch behavior.

## Follow-Ups

- Continue with another open cluster from `roadmap.md` in a future slice.
