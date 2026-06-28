# Handoff API Admin Core Established

## Summary

This update records the second implementation slice for `handoff-capability-extension`: an additive, curated `@sdl/handoff/api` surface and gateway-injected admin core for list/delete/gc-compatible behavior.

Changes made:

- Added the package export `@sdl/handoff/api` via `ts/packages/handoff/package.json`.
- Added `ts/packages/handoff/src/api.ts` as the curated API surface for identity helpers, summary schemas/types, existing storage/admin functions, and deleted-branch garbage-collection core functions.
- Added `ts/packages/handoff/src/gc-core.ts` with deterministic, gateway-injected deleted-branch GC planning and execution:
  - active-branch handoffs are kept;
  - deleted-branch handoffs are planned as `would_delete`;
  - execution calls the injected Branch Memory/Git-backed storage deps and reports `deleted`/`error` entries without using CLI interaction.
- Rewired `ts/packages/handoff/src/operations/gc.ts` so CLI confirmation and rendering stay in the CLI operation while deterministic GC planning/execution lives in Handoff-owned core.
- Added fake-backed tests for GC planning/execution and API exports under `ts/packages/handoff/test/unit/`.

Validation run by the parent session:

- `pnpm --dir ts exec vitest run --config vitest.config.ts packages/handoff/test` — passed, 8 files / 34 tests.
- `just ts-format-check` — passed.
- `just ts-check` — passed.
- `just ts-guard` — passed.

## Objective Impact

The `@sdl/handoff/api` / Domain Core roadmap row is now materially advanced and reviewable for admin operations (`list`, `delete`, `gc`). The slice preserves the storage-sensitive contracts recorded in `updates/2026-06-27T230253Z-handoff-surface-inventory-baseline.md`: namespace, key shape, slug validation, branch-scoped artifacts, deleted-branch GC behavior, and technical locator fields remain unchanged.

This slice intentionally does not implement SDL command leaves, create, pickup, Pi adapter rewiring, or standalone CLI removal. It creates the API/core seam that the next `sdl handoff list/delete/gc` leaf slice can consume.

## Follow-Ups

- Implement `sdl handoff list`, `sdl handoff delete`, and `sdl handoff gc` over `@sdl/handoff/api`.
- Extend `@sdl/handoff/api` later for deterministic create and pickup/read behavior when those leaves are implemented.
- Keep Pi adapters and the standalone `handoff` CLI unchanged until SDL command parity and call-site inventory are complete.
