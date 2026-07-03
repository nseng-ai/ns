# Tools Packagechk Smell Remediation

## Summary

Remediated the `ts/packages/tools/packagechk` sub-slice from `references/tools.md`:

- `claim-command-shared.ts` now exposes `runClaimCommand`, which centralizes the duplicated npm/PyPI claim flow: request validation, optional registry precheck, dry-run output/result, publish-tool availability, confirmation, temp project write/execute/cleanup, and claimed-result reporting.
- `ClaimDryRunData` now carries `url` as explicit data; dry-run JSON uses it directly and human rendering formats the registry URL line without parsing a preformatted display string.
- `models.ts` now owns `CHECK_STATUS_POLICIES`, the shared status table for report exit-code priority, human-rendering kind, and claim precheck action.

Validation passed on 2026-07-01:

- `pnpm --dir ts --filter @sdl/packagechk run check`
- `pnpm --dir ts --filter @sdl/packagechk run test`
- `just ts-format-check`
- `just ts-lint`
- `just ts-check`

## Objective Impact

The `tools` roadmap row is now in progress with all three packagechk findings dispositioned as fixed. The broader tools cluster remains open for the areg and vibechk sub-slices; the areg overlap note with `ts-cli-core-structural-cleanup` still applies before touching areg.

## Follow-Ups

Continue `tools` with either the vibechk sub-slice or an areg sub-slice after checking overlap with `ts-cli-core-structural-cleanup`'s areg god-file decomposition row.
