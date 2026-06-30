# Clinkr Omission-Only Shapes Narrowing

## Summary

Narrowed a Clinkr-internal optional-undefined slice in `ts/packages/infra/clinkr` after scoped inventory and classification.

Before the slice, a scoped grep under `ts/packages/infra/clinkr` found 16 `?: ... | undefined` candidates. After the slice, the same grep reports 10 remaining candidates. The removed declarations are omission-only fields where explicit present-key `undefined` has no domain or compatibility meaning:

- `ClinkrIo.caps?: Caps`
- `RenderCapabilities.caps?: Caps`
- `EmitExitOptions.renderHuman?: ...` and `renderMarkdown?: ...`
- `ClinkrNegativeOptions.data?: T`
- `OptionSpec.short?: string`
- `ScenarioClinkrInteraction.depsInteraction?: ClinkrInteraction`
- `runForTest(... options.io?: ClinkrIo)`

Construction paths were normalized where needed to preserve exact optional property semantics: `resolveIo`, `renderCapabilities`, and `group` now omit `caps`, `renderHuman`, and `renderMarkdown` keys instead of constructing present-key `undefined` values.

Validation passed:

- `pnpm --dir ts run check`
- `pnpm --dir ts run test -- --runInBand ts/packages/infra/clinkr` (Vitest accepted the command and ran the configured suite)
- `pnpm --dir ts run fmt:check`
- `pnpm --dir ts run lint`

## Objective Impact

This advances the continuous cleanup row with a coherent `@sdl/clinkr` internal/result/presentation/helper slice. The semantic claim is that these fields model absence by omission, not by explicit `undefined`; the implementation now matches that claim at construction sites instead of widening types to accommodate present-key `undefined`.

The slice also produced reusable classification evidence: Clinkr's public dependency-injection and helper option bags still have external callsites that pass maybe-undefined properties directly, so they were preserved in this slice unless a local construction path could be normalized without editing other packages.

## Follow-Ups

- Preserve Clinkr option/input/dependency bags such as `ClinkrIoOverrides`, `CreateClinkrInteractionOptions`, and `createScenarioClinkrInteraction` options until a separate boundary-normalization slice updates all producers to omit undefined keys.
- The remaining Clinkr scoped grep count includes one local test option (`test/caps.test.ts`) and several compatibility/input option surfaces; do not mechanically narrow them without producer evidence.
