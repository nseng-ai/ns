# Context-profiler Frame Behavior Remediation

## Summary

The remaining context-profiler finding from `references/local-pi-tools.md` was re-probed and fixed. `ProfilerView` still repeated `ViewFrame.type` dispatch across title breadcrumbs, frame metadata, frame body rendering, and non-chat input handling.

`view.ts` now centralizes per-frame behavior in the typed `frameBehaviors` table. Each frame variant owns its title crumbs, metadata, body renderer, input priority, and input handler in one entry, and the class reaches those entries through one exhaustive selector. This preserves existing overview, base-detail, turn-list, content, and chat behavior while making new frame variants a one-entry addition instead of several parallel switches.

Validation passed on 2026-07-01:

- `pnpm --dir ts --filter @local-pi-tools/context-profiler run check`
- `pnpm --dir ts --filter @local-pi-tools/context-profiler run test`
- `just ts-format-check`
- `just ts-lint`
- `just ts-check`
- `just dprint-check`

An initial `just ts-format-check` failure in `view.ts` was corrected with `just ts-format-fix` before rerunning validation.

## Objective Impact

This records a fixed disposition for the high-severity context-profiler Repeated Switches finding. Together with the earlier helper-dedupe sub-slice, all three recorded `ts/packages/local-pi-tools/context-profiler` findings now have fixed dispositions, reducing the remaining `local-pi-tools` backlog without changing context-profiler TUI behavior.

## Follow-Ups

Continue the `local-pi-tools` cluster with another coherent sub-slice such as grill row display/render context, pr-previews shared modal chrome/log split, runner-subagents presentation cleanup, or a dedicated large-controller slice for thermo-council or pr-feedback-watch.
