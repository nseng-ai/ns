# Tools Areg Smell Remediation

## Summary

The `areg` sub-slice of the **tools** cluster was re-verified and remediated. The open findings still matched current production code and were addressed with package-local refactors: mutation operation behavior now lives in one handler table, missing check-skill inspection construction is shared, project mutation target resolution is centralized, init TOML and managed-Markdown helpers moved into focused modules, write-target validation no longer has a forwarding wrapper, and agent list validation is shared between `sdl.toml` and legacy `areg.json` parsing.

Validation passed for `pnpm --dir ts --filter @sdl/areg run check`, `pnpm --dir ts --filter @sdl/areg run test`, `just ts-format-check`, `just ts-lint`, `just ts-check`, and `just dprint-check`.

## Objective Impact

This records fixed dispositions for all six `ts/packages/tools/areg` findings from `references/tools.md`. With the previously recorded `packagechk` and `vibechk` sub-slices, the **tools** cluster now has dispositions for all 12 findings and is marked complete in `roadmap.md`.

The overlap check against `ts-cli-core-structural-cleanup` found that areg real-gateway god-file decomposition was already complete there; this slice stayed within the separate code-smell findings in current areg production modules.

## Follow-Ups

- Continue with another open cluster such as `infra`, `capabilities`, or `local-pi-tools`; check the Objective's ownership-overlap notes before selecting those clusters.
