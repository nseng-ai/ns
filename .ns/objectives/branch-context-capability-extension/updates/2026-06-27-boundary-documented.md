# Branch Context Boundary Documented

## Summary

The documentation/tracking slice records the final Branch Context de-Pi boundary. `ts/packages/branch-context/CONTEXT.md` now says the Branch Context Capability API owns portable Branch Context behavior: Branch Memory attachment semantics, saved-plan-to-Attached Plan behavior, attached-plan loading, implementation prompt content, branch-context evidence, and gateway-injected creation/attachment/reuse helpers. It also records that concrete Pi slash-command registration, `/sdl:branch-context:impl-attached-plan`, and launch-command formatting belong to Pi/CCC presentation code because Pi is a Presentation Host above capabilities.

`ts/packages/hosts/pi/CONTEXT.md` now records the Pi-owned Branch Context command surface and formatter, while pointing domain/API behavior back to `@sdl/branch-context/api`.

Final stale-edge evidence for the completed stack:

- `rg -n "@sdl/pi" ts/packages/branch-context ts/packages/branch-context/package.json` — no matches.
- `rg -n "IMPL_BRANCH_CONTEXT_COMMAND_NAME|formatImplBranchContextCommand" ts/packages/branch-context ts/packages/ccc ts/packages/hosts/pi ts/scripts/typescript-style-guard` — matches only in CCC Pi-launch construction and Pi command surfaces/tests; no Branch Context package matches.
- Prior implementation-slice evidence remains recorded in `updates/2026-06-27-command-surface-moved.md` and `updates/2026-06-27-pi-package-edge-removed.md`: Branch Context/Pi/CCC package tests for the command-surface move, clean Branch Context check/test, and clean `just ts-guard` after the manifest-edge and guard tightening.

Final validation for this slice/stack:

- `dprint check CONTEXT-MAP.md ts/packages/branch-context/CONTEXT.md ts/packages/hosts/pi/CONTEXT.md .sdl/objectives/branch-context-capability-extension/roadmap.md .sdl/objectives/branch-context-capability-extension/orientation.md .sdl/objectives/branch-context-capability-extension/updates/2026-06-27-boundary-documented.md .sdl/objectives/sdl-extension-architecture/roadmap.md .sdl/objectives/sdl-extension-architecture/updates/2026-06-27-branch-context-depi-boundary-complete.md` — passed.
- `just ts-check` — passed.
- `just ts-test` — 354 files / 3510 tests passed.
- `just ts-guard` — passed.

## Objective Impact

This completes the remaining open documentation and tracking rows. Branch Context is now documented as a clean above-SDK Capability with no `@sdl/pi` dependency; the Pi-owned command surface is documented locally in the Pi context; and parent Phase 2 tracking has evidence that the Branch Context de-Pi boundary is complete or closure-ready.

The Objective is not closed by this update; closure can be handled separately by the parent/maintainer.

## Follow-Ups

- Parent/maintainer should decide whether to close `branch-context-capability-extension`.
- Continue the parent `sdl-extension-architecture` Phase 2 sequence with remaining capability child migrations and broader CCC clean-consumer work.
