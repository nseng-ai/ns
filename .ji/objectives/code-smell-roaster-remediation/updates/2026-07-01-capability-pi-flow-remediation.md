# Capability-Pi Flow Remediation

## Summary

Remediated the `capability-pi/flow` sub-slice from `references/capability-pi.md`.
`smart-restack.ts`, `stack-squash.ts`, and `code-workflows.ts` now share flow
command registration contracts through `command-support.ts`, and both Graphite
command paths use the same `runFlowGraphiteCommand` adapter instead of repeating the
`piExecApiToCommandExecApi` → `execApiToCommandRunner` → `runGraphiteCommand`
chain.

Validation passed on 2026-07-01:

- `pnpm --dir ts --filter @sdl/flow-pi run check`
- `pnpm --dir ts --filter @sdl/flow-pi run test`
- `just ts-format-check`
- `just ts-lint`
- `just ts-check`
- `just dprint-check`

## Objective Impact

This fixes both recorded `ts/packages/capability-pi/flow` findings: the duplicated
Pi command contract definitions and the duplicated Graphite command-runner wiring.
The broader `capability-pi` row remains in progress because its handoff and
objective sub-slices are still open.

## Follow-Ups

Continue the `capability-pi` cluster with either the handoff or objective
sub-slice, re-verifying each finding against current code before editing.
