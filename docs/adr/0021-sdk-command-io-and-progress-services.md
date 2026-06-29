# ADR 0021: SDK command I/O and progress services

## Status

Accepted — refines ADR 0018 and ADR 0019 for the `command-io` and `progress-phase` SDK-provided service slice.

## Context

ADR 0018 classifies `@sdl/core/command-io` and `@sdl/core/progress-phase` as SDK-provided services: author-facing interfaces belong in `sdl-sdk`, implementations are hidden in the kernel, and capability code reaches the service through the vended `ctx` object. ADR 0019 repeats the `sdk-provided` placement pattern and preserves the invariant that the old `@sdl/core` doors are deleted in the same atomic relocation slice.

The existing code does not yet expose named SDK services. `SdlExtensionApi` has low-level output hooks (`stdout`, `stderr`, `onOutput`) plus `stdin`, `confirm`, `exec`, `textGenerator`, and `extensions`. `@sdl/core/command-io` layers a richer command-output abstraction over those hooks and Pi rich UI sinks. `@sdl/core/progress-phase` is pure event/listener vocabulary used by Flow to drive ordered progress presentation.

Current import inventory:

| Service          | Import sites / packages                                        | Current use                                                                                                      | Target need                                                                                                    |
| ---------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `command-io`     | `@sdl/kernel/src/sdk/command-io.ts`                            | adapts `SdlExtensionApi` low-level callbacks to `CommandIo`                                                      | kernel-owned construction of the SDK service                                                                   |
| `command-io`     | `@sdl/hosts/pi/src/commands/io.ts`                             | maps Pi UI status/notify/rich message channels to `CommandIo`                                                    | host/kernel adapter, not public author logic                                                                   |
| `command-io`     | `sdl-flow` CLI and land-stack code                             | consumes `CommandIo`, wraps CLI callbacks, clears phases with `runWithCommandIo`, and builds rich Pi land output | capability consumes `ctx.commandIo` or a command-provided `SdlCommandIo`; Flow keeps land presentation details |
| `command-io`     | `@sdl/ccc` CLI adapter                                         | wraps standalone CLI callbacks into `CommandIo`                                                                  | temporary edge adapter until standalone command hosts vend `ctx.commandIo`                                     |
| `command-io`     | core tests and capability tests                                | verifies factory behavior and injects fake/no-op output                                                          | tests can build object-literal fakes for the SDK interface; factory tests move with the kernel implementation  |
| `progress-phase` | Flow `cp`, `checkpoint`, `phase-stream*`, and `submit` modules | passes `ProgressPhaseEvent` / `ProgressPhaseListener` through lower workflows into Flow's presentation driver    | SDK progress event/listener vocabulary plus a `ctx.progress` sink for host-observed progress                   |

No non-Flow package currently imports `@sdl/core/progress-phase` directly.

## Considered options

### Option 1: explicit SDK services

Add SDK-owned interfaces and named context services: `ctx.commandIo` for command output and `ctx.progress` for generic phase-event emission/observation. The kernel constructs these services from host callbacks and UI bridges. Low-level `stdout`/`stderr`/`onOutput` stay as compatibility primitives.

Pros: directly satisfies the ADR wording that intrinsic services are reached through `ctx`; gives Flow a non-`@sdl/core` path; lets the next slice delete both old core doors atomically. Cons: grows the public SDK and must keep the service vocabulary deliberately small.

### Option 2: types-only SDK relocation

Move `CommandIo` and `ProgressPhaseEvent` / `ProgressPhaseListener` to `sdl-sdk`, leave helper factories in the kernel, and have consumers adapt `stdout`/`stderr`/`onOutput` manually.

Pros: smallest immediate SDK change and easy import repoint. Cons: only removes the `@sdl/core` import; it does not make the services reached through `ctx`, so it under-delivers ADR 0018 and the Objective roadmap.

### Option 3: split service shape

Add only `ctx.commandIo` and move progress as SDK vocabulary/types while Flow keeps local adapters until a later broader progress decision.

Pros: recognizes that `command-io` is already a host service while progress events are Flow-shaped today. Cons: leaves `progress-phase` halfway migrated and would make the next slice unable to honestly delete both old doors under the existing roadmap wording.

## Decision

Use **Option 1: explicit SDK services**, with narrow interfaces and compatibility hooks preserved.

`sdl-sdk` will export these author-facing names:

```ts
export type SdlNotifyLevel = "info" | "warning" | "error";

export interface SdlCommandMessageOptions {
  level?: SdlNotifyLevel;
  details?: unknown;
  isRichOnly?: boolean;
}

export interface SdlCommandIo {
  phase(message: string): void;
  notify(message: string, level?: SdlNotifyLevel): void;
  message(message: string, options?: SdlCommandMessageOptions): void;
  clearPhase(): void;
}

export type SdlProgressPhaseEvent =
  | { type: "phase-started"; phaseKey: string; label?: string }
  | { type: "phase-progress"; phaseKey: string; label: string }
  | { type: "phase-done"; phaseKey: string; detail?: string }
  | { type: "phase-failed"; phaseKey: string; detail: string };

export type SdlProgressPhaseListener = (event: SdlProgressPhaseEvent) => void;

export interface SdlProgress {
  phase(event: SdlProgressPhaseEvent): void;
}
```

`SdlExtensionApi` will grow named optional services:

```ts
interface SdlExtensionApi {
  commandIo?: SdlCommandIo | undefined;
  progress?: SdlProgress | undefined;
  // existing fields remain
}
```

The services are optional for the first relocation slice so older host/test contexts remain source-compatible. The kernel's real context should provide them by default when practical; command code that requires visible progress may fall back to the existing low-level hooks during the transition. A later compatibility cleanup can decide whether these become required once all hosts vend them.

The existing low-level fields keep their current meaning:

- `stdout` / `stderr` remain durable stream hooks and are still reserved for primary/diagnostic output.
- `onOutput` remains a transient live-output primitive tagged by `SdlOutputStream`.
- `ctx.commandIo` is the higher-level command-output service built from those hooks and/or richer host UI sinks.
- `ctx.progress` is the higher-level phase-progress sink. It carries structured phase events; it is not a generic task runner, not a Git/GitHub gateway, and not a place for Flow-specific phase lists.

## Placement of existing symbols in the next relocation slice

Move to `sdl-sdk` as public author-facing types:

- `NotifyLevel` → `SdlNotifyLevel`
- `CommandMessageOptions` → `SdlCommandMessageOptions`
- `CommandIo` → `SdlCommandIo`
- `ProgressPhaseEvent` → `SdlProgressPhaseEvent`
- `ProgressPhaseListener` → `SdlProgressPhaseListener`
- new `SdlProgress`

Move or keep behind the kernel/host boundary as implementation details:

- `CliCommandIoInput`
- `CliCommandIoOptions`
- `CommandIoChannels`
- `createCliCommandIo`
- `createCommandIo`
- `commandIoFromSdlExtensionApi`
- Pi rich-message/status adapters

Do not promote those factories to public `sdl-sdk` unless repeated extension-author use proves they are stable author API. Capability and host tests can fake `SdlCommandIo` / `SdlProgress` with object literals; factory behavior tests should move with the kernel implementation.

`runWithCommandIo` and `noopCommandIo` are convenience utilities rather than host implementations. The next slice may either keep them as local capability helpers or export SDK-named equivalents only if they are needed by author modules. They are not required to define the service shape.

## Flow migration guidance

Flow's lower-layer workflow hooks should import `SdlProgressPhaseEvent` and `SdlProgressPhaseListener` from `sdl-sdk`, not `@sdl/core/progress-phase`.

Flow command entry points should derive the listener they pass into lower layers from the command context:

- Prefer `ctx.progress?.phase` when the command wants host-observed structured progress.
- Keep Flow-owned presentation drivers (`phase-stream*`) responsible for Flow-specific phase ordering, Clinkr rendering, transcript tails, and TTY/non-TTY behavior.
- When Flow creates a local `PhaseStream`, bridge emitted SDK phase events into both the local stream and `ctx.progress?.phase` only where that is deliberate and non-duplicative.

This keeps the SDK progress shape general while preserving Flow's ownership of phase specs and rendering policy.

## Kernel and module-loader implications

The kernel constructs `ctx.commandIo` and `ctx.progress` when creating `SdlExtensionApi` instances. The real implementation may continue to reuse the current command I/O logic internally, but that logic should no longer be imported from `@sdl/core` after relocation.

`ts/packages/kernel/src/sdk/module-loader.ts` only needs changes for runtime value exports. The decided new SDK names are type-only, so the virtual `sdl-sdk` module does not need new runtime values unless a later slice deliberately promotes runtime helpers such as a no-op factory. If such helpers are promoted, `sdlSdkVirtualModule` and `ts/packages/kernel/docs/sdk-reference.md` must be updated together with `ts/packages/sdl-sdk/src/index.ts`.

## Compatibility and deletion stance

The next implementation slice can delete `@sdl/core/command-io` and `@sdl/core/progress-phase` atomically after:

1. SDK types and `SdlExtensionApi` fields exist.
2. Kernel/host adapters own command I/O construction.
3. Flow and CCC imports no longer reference the old core doors.
4. Factory tests have moved to the owning implementation package or been replaced by SDK-interface fake tests.
5. Source search confirms no live `@sdl/core/command-io` or `@sdl/core/progress-phase` imports remain.

## Non-goals

- No brmem relocation.
- No clock, timer, stdin, or CLI-entry relocation in this decision.
- No Git, GitHub, Graphite, cmux, or other external-tool gateway on `ctx`.
- No broad import repointing or service implementation in this design spike.
- No promotion of Flow phase specs or Clinkr rendering policy into `sdl-sdk`.
