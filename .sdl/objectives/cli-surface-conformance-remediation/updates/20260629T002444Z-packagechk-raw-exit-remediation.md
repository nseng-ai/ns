# Packagechk raw-exit remediation

## Summary

Continued Area (d) / ADR 0015 raw-exit reconciliation for the remaining current-source packagechk candidates.

Implemented in this slice:

- Added rendered default-command support to Clinkr so finite-result root/default commands can publish normal envelopes without forcing `isRawExit: true`.
- Migrated `packagechk NAME` from `isRawExit: true` to a rendered Clinkr default command with `resultSchema`, `handler`, and `renderHuman`.
  - All-available results return `ok(...)` / exit 0.
  - Taken-name results return `negative(...)` / exit 1 with the package-check report as structured data and human output on stderr.
  - Invalid registry-selection input returns `usageError(...)` / exit 2; registry/backend check errors return `failure("registry_check_failed", ...)` / exit 2.
  - Deprecated legacy `--show-json` now returns `usageError(...)` directing callers to `--format json`, so machine output is the normal Clinkr camelCase envelope.
- Migrated `packagechk claim-pypi` and `packagechk claim-npm` from `rawCommand(...)` to rendered Clinkr commands with `resultSchema` and `handler`.
  - Dry-runs return `ok(...)` / exit 0 with structured planned files and commands.
  - Successful real publishes return `ok(...)` / exit 0 with claimed package URL data.
  - Taken prechecks and interactive aborts return `negative(...)` / exit 1.
  - Invalid package names and missing non-interactive `--yes` return `usageError(...)` / exit 2.
  - Tool and publish failures return `failure(...)` / exit 2 with structured registry/package data.

Current raw-exit grep result after this slice:

- `ts/packages/tools/vibechk/src/cli.ts` `run` only.

`vibechk run` remains parked as an ADR 0015 raw-exempt process-control/third-party runner surface: `executeRun` invokes the selected runner, streams runner stdout/stderr through the workflow, persists a transcript and run bundle, and returns the runner's exit code. That contract is intentionally not a finite-result envelope.

## Validation

```bash
pnpm --dir ts exec vitest run \
  packages/tools/packagechk/test/scenario/claim.test.ts \
  packages/tools/packagechk/test/scenario/cli.test.ts
# 2 files, 19 tests passed

just ts-check
# passed
```

## Objective Impact

Area (d) is complete for current-source remediation: packagechk no longer contributes raw-exit candidates, and the sole remaining raw-exit surface (`vibechk run`) is intentionally parked under ADR 0015.
