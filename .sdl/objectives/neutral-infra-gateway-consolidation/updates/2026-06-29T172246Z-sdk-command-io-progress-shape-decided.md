# SDK Command I/O and Progress Shape Decided

## Summary

Completed the design-only spike for the SDK-provided `command-io` and `progress-phase` services. ADR 0021 records the chosen shape: add narrow explicit SDK services on `SdlExtensionApi` as optional `ctx.commandIo?: SdlCommandIo` and `ctx.progress?: SdlProgress`, while preserving the existing low-level `stdout` / `stderr` / `onOutput` hooks as compatibility primitives.

Consumer inventory found `command-io` imports in kernel, Pi host, Flow, CCC, and tests. Uses split into SDK interface consumption (`CommandIo`, `NotifyLevel`, message options), host/kernel adapters (`createCommandIo`, `createCliCommandIo`, `commandIoFromSdlExtensionApi`), lifecycle/no-op helpers (`runWithCommandIo`, `noopCommandIo`), Pi rich UI/status bridges, and Flow/CCC standalone CLI adapters. `progress-phase` imports are Flow-only and consist of pure `ProgressPhaseEvent` / `ProgressPhaseListener` vocabulary feeding Flow-owned phase presentation drivers and lower-layer `onPhase` hooks.

The spike evaluated three options: explicit SDK services, types-only SDK relocation, and a split shape that only gives command I/O a named service. It chose explicit SDK services because the types-only and split options would remove `@sdl/core` imports without satisfying the Objective's "reached through `ctx`" intent for both services.

## Objective Impact

This refines the open roadmap row for moving SDK-provided services. The next implementation slice now has an exact target surface:

- `sdl-sdk` exports `SdlNotifyLevel`, `SdlCommandMessageOptions`, `SdlCommandIo`, `SdlProgressPhaseEvent`, `SdlProgressPhaseListener`, and `SdlProgress`.
- `SdlExtensionApi` grows optional `commandIo?: SdlCommandIo` and `progress?: SdlProgress` fields.
- Command I/O factories/channels and Pi/kernel construction remain implementation details owned by kernel/host code, not public author SDK helpers.
- Flow imports progress vocabulary from `sdl-sdk` and derives host-observed progress from `ctx.progress?.phase`, while Flow keeps its phase specs and Clinkr rendering policy.
- The kernel virtual `sdl-sdk` module needs no runtime-value change for the decided type-only exports unless a later implementation slice promotes runtime helpers.

No old `@sdl/core` doors were deleted in this spike, and no broad Flow/CCC/Pi imports were repointed.

## Follow-Ups

- Implement ADR 0021 in one atomic relocation slice: add SDK types/fields, move kernel/host command I/O construction out of core, repoint Flow/CCC/Pi imports, move/replace tests, and delete `@sdl/core/command-io` plus `@sdl/core/progress-phase` in the same slice.
- Update `ts/packages/kernel/docs/sdk-reference.md` and `ts/packages/sdl-sdk/src/index.ts` when the SDK fields/types are implemented.
- During implementation, decide locally whether `runWithCommandIo` / `noopCommandIo` remain local helpers or get SDK-named equivalents; they are not part of the minimum service shape.
