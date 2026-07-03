# Runner Subagents Result Base Remediation

## Summary

Re-verified the `local-pi-tools` runner-subagents duplicated-code finding in `subagent-process.ts`: terminal capture and final/stopped/cancelled/error/protocol-error result builders still repeated the same optional `title`, `elapsedMs`, `progress`, and optional `sessionFile` envelope. The slice now extracts that shared shape into a private `resultBase` helper and has each status-specific builder add only its own discriminant and payload fields.

Validation passed on 2026-07-01: `pnpm --dir ts --filter @local-pi-tools/runner-subagents run check`, `pnpm --dir ts --filter @local-pi-tools/runner-subagents run test`, `just ts-format-check`, `just ts-lint`, `just ts-check`, and `just dprint-check`.

## Objective Impact

This records a fixed disposition for one runner-subagents finding under the `local-pi-tools` cluster and moves that roadmap row from open to in-progress. The change reduces the duplicated result-construction surface without changing runner-subagent result behavior or package API shape.

## Follow-Ups

Continue the `local-pi-tools` cluster with another coherent sub-slice, such as the remaining runner-subagents presentation/status-switch findings or one of the smaller context-profiler/grill/pr-previews findings. Large divergent-change findings in `thermo-council` and `pr-feedback-watch` should remain dedicated slices.
