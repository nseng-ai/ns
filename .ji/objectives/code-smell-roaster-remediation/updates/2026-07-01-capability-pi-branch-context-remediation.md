# Capability-Pi Branch-Context Remediation

## Summary

Remediated the `ts/packages/capability-pi/branch-context` sub-slice of the open `capability-pi` cluster from `references/capability-pi.md`.

- Fixed the duplicated create/upstack from-plan command skeleton by introducing `runCreateBranchContextCommand`, with command-specific usage, default-Graphite preview options, dry-run formatting, no-saved-plan reuse handling, and post-create launch behavior kept at the wrapper level.
- Fixed the duplicated selected saved-plan evidence projection by introducing `selectedSavedPlanEvidence`, shared by create-branch-context preview derivation and current-saved-plan implementation preview derivation.
- Removed the unused `BranchContextGtUpstackImplNewSessionContext` alias from the upstack launch module.

Validation passed on 2026-07-01:

- `pnpm --dir ts --filter @sdl/branch-context-pi run check`
- `pnpm --dir ts --filter @sdl/branch-context-pi run test`
- `just ts-format-check`
- `just ts-lint`
- `just ts-check`

## Objective Impact

The `capability-pi` roadmap row is now in progress with dispositions recorded for all three branch-context findings. The remaining `capability-pi` findings in `ccc`, `flow`, `handoff`, and `objective` stay open for later sub-slices.

## Follow-Ups

Continue the `capability-pi` cluster by selecting another subpackage slice; do not mark the full cluster complete until all 13 findings have dispositions.
