# Infra Clinkr Remediation

## Summary

Re-probed and fixed the Clinkr findings from `references/infra.md`:

- `EXIT_CODE_BY_TYPE` now owns the Clinkr exit-type to process-code mapping; `exitCodeForExit`, machine-envelope construction, and `emitExit` derive exit codes from that single source instead of repeating parallel switches/literals.
- `completion.ts` now shares enum completion candidate construction through `enumValueCandidates`, preserving existing `option-value` and `positional-value` candidate output while removing three duplicated guard/filter/map blocks.
- `buildFailureMachineEnvelopeSchema` now exposes only the production-used `errorTypeSchema` override and keeps the status, exit-code, and message schemas fixed to the existing defaults.

Validation passed on 2026-07-01: `pnpm --dir ts --filter @sdl/clinkr run check`, `pnpm --dir ts --filter @sdl/clinkr run test`, `just ts-format-check`, `just ts-lint`, `just ts-check`, and `just dprint-check`.

## Objective Impact

This reduces the open `infra` cluster by fixing all three Clinkr findings without changing Clinkr CLI output, completion values, or machine-envelope semantics. The `infra` roadmap row remains open for the remaining clinkr-adjacent packages such as git, graphite, cli-runtime, cli-theme, core, github, test-kit, time, and exec.

## Follow-Ups

Continue the `infra` cluster as package-local sub-slices. Re-check `ts-cli-core-structural-cleanup` ownership before touching Git/GitHub/Graphite-adjacent infra findings, per the roadmap guidance.
