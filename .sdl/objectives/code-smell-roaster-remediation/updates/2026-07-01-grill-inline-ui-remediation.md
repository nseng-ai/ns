# Grill Inline UI Remediation

## Summary

Re-probed the `local-pi-tools/grill` inline UI findings from `references/local-pi-tools.md`. The exceptional-row display strings/glyphs were still repeated across `view.ts` and `render.ts`, and the render helper call tree still threaded the `width`/`theme`/`primitives` data clump through multiple functions.

The slice fixed those production smells by adding one `exceptionalRowDisplay` source of truth for non-choice row labels/glyphs and by bundling the inline renderer's width/theme/primitives into `GrillAskRenderContext`. The public `renderGrillAskInlineUi` signature and user-visible labels/rendered output remain unchanged.

Validation passed:

- `pnpm --dir ts --filter @local-pi-tools/grill run check`
- `pnpm --dir ts --filter @local-pi-tools/grill run test`
- `just ts-format-check` after correcting formatting with `just ts-format-fix`
- `just ts-lint`
- `just ts-check`
- `just dprint-check`

## Objective Impact

The `local-pi-tools` cluster now has dispositions for the grill inline UI repeated-switch and render data-clump findings. This reduces the remaining open grill work to the larger `grill/src/extension.ts` divergent-change finding, which was intentionally left for a separate slice.

## Follow-Ups

- Remediate the remaining `local-pi-tools/grill` divergent-change finding in `src/extension.ts` as its own slice: split protocol/types, prompt constants/builders, and legacy execution/result mapping without changing tool behavior.
