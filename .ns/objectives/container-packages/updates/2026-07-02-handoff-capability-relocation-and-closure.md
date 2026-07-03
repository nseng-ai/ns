# Handoff Relocated and Objective Closure Ready

## Summary

The final directory-placement gap in the approved target layout is resolved. `@sdl/handoff` moved from `ts/packages/handoff/` to `ts/packages/capabilities/handoff/` while keeping its package name, public exports, container subpackages (`core`, `operations`, `pi`, `sdl`), and no-remainder status.

Mechanical follow-ups were included: the package test script now points at `packages/capabilities/handoff/test`, the package tsconfig inherits from the workspace root at the correct depth, the pnpm lockfile now links `@sdl/handoff` to `packages/capabilities/handoff`, kernel command-module resolution points at the relocated package, the `.pi` Claude adapter imports the relocated Pi extension, and `CONTEXT-MAP.md` / the approved target layout point at the relocated handoff context/package files.

Validation passed for the relocation: `pnpm --dir ts --filter @sdl/handoff run check`, `pnpm --dir ts --filter @sdl/handoff run test`, `just`, `just ts-test-integration`, and `just ts-test-typescript-style-guard`. Topology extraction still reports 21 packages, 87 topology circles, zero package cycles, zero circle cycles, and only the two accepted debt-tier violations (`@sdl/brmem` → `@sdl/capability-kit` and `@sdl-local/pi-tools` → `@sdl/capability-kit`).

## Objective Impact

The approved end-state tree is now matched for the capability tier: handoff, objective, ccc, branch-context, plans, address, aretro, roaster, slot, and flow all live under `ts/packages/capabilities/`. The parent roadmap row for executing approved conversion slices can be checked because every child conversion row has a resolved disposition and the late handoff placement gap is closed.

All completion criteria read as satisfied: vocabulary and ADR are recorded; `sdl.subpackages` is the single topology/guard config; the approved inventory covers every original package; top-level packages are reduced from 44 to 21 with no cycles; the three top-level categories are recorded; every conversion row is resolved; and keep-standalone rationale is recorded in the approved inventory.

## Follow-Ups

- Close the `container-packages` Objective with closure prose and a `closed.md` marker.
- Parked items remain intentionally out of scope: per-subpackage tier declarations and requiring every subpath export to resolve into a declared subpackage.
- The two accepted debt-tier edges remain tracked as placement-decision debt outside this Objective's closure gate.
