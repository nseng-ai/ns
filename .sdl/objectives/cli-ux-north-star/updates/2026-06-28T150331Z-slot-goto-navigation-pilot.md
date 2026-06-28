# Slot goto navigation pilot

## Summary

`sdl slot goto` is now the actionable Slot navigation output pilot for the CLI house-style rollout.

What changed:

- Added a Slot-local pure renderer, `ts/packages/capabilities/slot/src/navigation-presentation.ts`, for successful navigation surfaces. It uses `@sdl/clinkr/theme` primitives (`resultBlockHeadline`, `dim`, `paint`) over clinkr render caps and does no I/O or `process.*` access.
- `renderGoto` now accepts clinkr `RenderCapabilities`, builds the existing `slot -> branch` headline (including the operation-in-progress suffix), and delegates to the Slot-local renderer.
- The generated `cd ...` command remains a bare, unstyled, copyable line. It is still printed even when Shell Directive output is active.
- Clipboard copied guidance remains present; clipboard failure remains non-fatal and still leaves the `cd ...` command visible. `--no-clipboard` continues to omit a clipboard status line.
- `runGoto`, the result schema, JSON output, clipboard side effects, exit codes, and Shell Directive file semantics are unchanged.

Tests added/updated:

- `ts/packages/capabilities/slot/test/unit/navigation-presentation.test.ts` covers the renderer, the bare `cd ...` line under ANSI-capable rendering, non-fatal clipboard failure guidance, and ASCII glyph degradation.
- `ts/packages/capabilities/slot/test/scenario/goto-cli.test.ts` now asserts the human `goto` output shape for success, operation state, and clipboard failure while preserving the existing JSON and Shell Directive checks.

## Objective Impact

- `cli-surface-audit.md` marks `sdl slot goto` as Done and leaves `checkout/co` plus `gt up/down` as the remaining Slot navigation consumers.
- `roadmap.md` records `goto` as the pilot for the actionable shell/navigation row, with clinkr-wide navigation extraction still deferred until repeated Slot consumers prove the same shape.
- This validates the scoped extraction discipline for the navigation row: first build a Slot-local helper, then migrate the remaining Slot navigation surfaces before deciding whether a shared `@sdl/clinkr/theme` navigation renderer is warranted.

## Follow-Ups

- Migrate `sdl slot checkout` / `sdl slot co` to the Slot-local navigation presentation helper, preserving their assignment/creation messages and side effects.
- Migrate `sdl slot gt up` / `sdl slot gt down` to the same helper after verifying their Graphite navigation wording fits the pilot grammar.
- After at least one or two more consumers use the same shape, decide whether to promote a shared navigation renderer into `@sdl/clinkr/theme`.

## Evidence

Validation run after implementation:

- `pnpm --dir ts exec vitest run --config vitest.config.ts packages/capabilities/slot/test/unit/navigation-presentation.test.ts packages/capabilities/slot/test/scenario/goto-cli.test.ts` — passed.
- `pnpm --dir ts exec vitest run --config vitest.config.ts packages/capabilities/slot/test/scenario/checkout-cli.test.ts packages/capabilities/slot/test/scenario/gt-navigation-cli.test.ts` — passed.
- `just ts-format-check` — initially found formatting drift in the new renderer; `just ts-format-fix` was run, then `just ts-format-check` passed.
- `just ts-lint` — passed with pre-existing warnings in `packages/sdl/test/scenario/handoff-cli-contract.test.ts`.
- `just ts-check` — passed.
- `just ts-test` — passed.
- `just ts-guard` — passed.
- `just ts-deps-check` — passed.
- `just dprint-check` — initially found Markdown table formatting drift in `cli-surface-audit.md`; `just dprint-fix` was run, then `just dprint-check` passed.
