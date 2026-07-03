# Slot Navigation Migration Complete

## Summary

Completed the Slot actionable shell/navigation migration row for:

- `sdl slot checkout`
- `sdl slot co`
- `sdl slot gt up`
- `sdl slot gt down`

Verification found the implementation already routed the four command faces through Slot-local navigation presentation:

- `ts/packages/capabilities/slot/src/navigation-presentation.ts` defines `renderSlotNavigationSuccess(...)` on `@sdl/cli-theme`.
- `ts/packages/capabilities/slot/src/operations/checkout.ts` renders checkout/co through `renderCheckout(...)` and checkout-owned headlines/details.
- `ts/packages/capabilities/slot/src/operations/gt/navigation.ts` renders GT navigation through `renderGtNavigationResult(...)`.
- `ts/packages/capabilities/slot/src/operations/gt/up.ts` and `down.ts` export `renderGtUpNavigation` / `renderGtDownNavigation` from the shared GT renderer.
- `ts/packages/capabilities/slot/src/command-face.ts` wires `renderHuman` for `checkout`, `co`, `gt up`, and `gt down`.

The implementation patch added focused scenario coverage for material contracts that were not yet explicit: checkout alias human rendering, `--current` redirect details before the bare `cd ...` line, already-assigned checkout headlines, GT newly-checked-out/main-worktree/no-clipboard variants, and no-downstack negative behavior.

Validation run:

```bash
pnpm --dir ts exec vitest run --config vitest.config.ts \
  packages/capabilities/slot/test/unit/navigation-presentation.test.ts \
  packages/capabilities/slot/test/scenario/goto-cli.test.ts \
  packages/capabilities/slot/test/scenario/checkout-cli.test.ts \
  packages/capabilities/slot/test/scenario/gt-navigation-cli.test.ts
```

Result: 4 test files passed, 38 tests passed.

## Objective Impact

The actionable shell/navigation row is now complete. The Objective audit and roadmap now mark `checkout`, `co`, `gt up`, and `gt down` as Done alongside the existing `goto` pilot.

Confirmed preserved contracts:

- human success output uses the Slot-local `renderSlotNavigationSuccess` helper;
- generated `cd ...` commands remain bare, unstyled, and copyable;
- clipboard copied/failure/skipped guidance remains non-fatal and correct;
- JSON output remains free of house-style text;
- Shell Directive behavior remains owned by `prepareNavigation(...)`;
- negative GT cases keep their current exit/status behavior;
- old alternate booleans such as `is_already_assigned` do not leak into GT JSON output.

The repeated Slot consumers fit the Slot-local helper without command-specific presentation hacks, so the helper is stable for this row.

## Follow-Ups

Shared navigation extraction remains deferred. Reconsider a shared `@sdl/cli-theme` navigation renderer only after broader non-Slot navigation consumers appear or explicit Objective steering asks for it.
