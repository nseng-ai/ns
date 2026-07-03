# Vibechk Smell Remediation

## Summary

The `vibechk` sub-slice of the **tools** cluster was re-verified and remediated. The duplicated command startup/ENOENT handling in `repository.ts` and `runners.ts` now goes through one package-local exec helper, the artifact output-bounds contract is shared from `models.ts`, and report truncation bullets now use one formatting helper for both single-run and comparison reports.

Validation passed for `pnpm --dir ts --filter @sdl/vibechk run check` and `pnpm --dir ts --filter @sdl/vibechk run test` during implementation; repo-level TS format/lint/typecheck validation is recorded in the roadmap for the kept slice.

## Objective Impact

This records fixed dispositions for all three `ts/packages/tools/vibechk` findings from `references/tools.md`, reducing the remaining open **tools** work to the `areg` findings. No behavior change or cross-package ownership issue was identified.

## Follow-Ups

- Continue the **tools** cluster with the remaining `areg` findings, checking the noted overlap with `ts-cli-core-structural-cleanup` before touching the areg god-file/decomposition finding.
