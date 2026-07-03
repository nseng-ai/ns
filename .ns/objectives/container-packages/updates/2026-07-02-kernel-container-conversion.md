# Kernel Container Conversion

## Summary

Converted `@sdl/kernel` into a declared container and folded the former `sdl-sdk` package into the pure `@sdl/kernel/sdk` subpackage. Kernel runtime internals that previously lived under `src/sdk/` now live under `src/runtime/`, while the SDK subpackage owns only the extension-author API surface. Live workspace imports and manifests now point at `@sdl/kernel/sdk` / `@sdl/kernel`, and `ts/packages/sdl-sdk` was deleted.

Topology evidence: package count 39 → 38, topology circles 48 → 52, `sdl-sdk` disappeared as a top-level package/circle and reappeared as `@sdl/kernel/sdk`; kernel circles are `cli`, `extensions`, `operations`, `runtime`, and `sdk`. The orphan count stayed unchanged at 19 with no new kernel orphan.

## Objective Impact

Advances the approved fold sequence and resolves the kernel conversion row as **converted**. This keeps the ADR 0012 SDK/runtime distinction as a subpackage boundary instead of a separate published package, preserving extension-author SDK behavior at the new `@sdl/kernel/sdk` import path.

The conversion also surfaced the pre-existing kernel → Capability Kit shell-support edge at topology-circle granularity, so the style guard/topology debt table now records that specific CLI shell-support debt instead of letting it be hidden by the former unsplit kernel circle. Validation passed with kernel tests, targeted extension tests, style guard, format, typecheck, dprint, default TS tests, integration tests, lint, and dependency checks.

## Follow-Ups

- Continue with the next approved conversion row, `@sdl/capability-kit` → container.
- When a later slice relocates or lowers the shell wrapper helper, remove the recorded `@sdl/kernel` → `@sdl/capability-kit` shell-support debt.
