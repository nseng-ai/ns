# Hosts Pi Smell Remediation

## Summary

Completed the remaining `hosts/pi` sub-slice in the `hosts` cluster. The CLI command bridge was split so live-progress widget/status state lives in `cli-command-live-progress.ts` and trace JSONL diagnostics live in `cli-command-trace.ts`, leaving `cli-extension.ts` focused on command registration, dispatch, and output rendering while preserving the existing `cliCommandTracePath` export. Skill prompt invocation now shares one notification/delivery helper, session replacement delivery modes derive from the canonical shared message-delivery union, and Pi notify-level call sites reuse the canonical `NotifyLevel` type with only command progress adding its `"success"` extension.

Re-probed `diagnosticErrorMessage`: it still has no production callers and is referenced only by `test/shared-errors.test.ts`, so the finding is disposed rather than removed because this Objective excludes test-source edits.

## Objective Impact

The `hosts` cluster now has dispositions for all 8 findings: the earlier `sdlcc` sub-slice fixed 3 findings, and this `pi` sub-slice fixed 4 findings and disposed 1 test-only speculative export. `roadmap.md` marks `hosts` complete with validation evidence.

Validation passed on 2026-07-01: `pnpm --dir ts --filter @sdl/pi run check`, `pnpm --dir ts --filter @sdl/pi run test`, `just ts-format-check`, `just ts-lint`, `just ts-check`, and `just dprint-check`.

## Follow-Ups

Continue with one of the remaining open clusters (`infra`, `capabilities`, `local-pi-tools`, or `tools`). No additional hosts follow-up is known.
