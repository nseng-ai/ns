# SDL Aretro hard cutover

## Summary

Aretro has hard-cut over to the SDL command face. The supported commands are now `sdl aretro exec collect-evidence` and `sdl aretro exec read-evidence-detail`, mounted through a checked-in `.sdl/extensions/aretro` manifest that re-exports package-owned SDL command modules from `@sdl/aretro`.

The standalone `aretro` bin, `just install-aretro` shim recipe, and `branch-retro` skill-local `aretro-run` source runner were retired rather than kept as compatibility forwarders. `branch-retro` now invokes `sdl aretro exec ...` directly.

## Objective Impact

This completes the command-face and Capability API disposition rows for the Aretro Capability Extension Objective:

- Command face: hard-cutover to `sdl aretro exec ...`.
- Capability API: command-face-only for now; no `@sdl/aretro/api` subpath was added because source search and current consumers show no in-process Aretro consumer.
- Exports: `ts/packages/aretro/package.json` no longer exposes a broad package root or bin; it exports only explicit SDL command module subpaths.
- Layering: SDL extension entry files only re-export package-owned command modules; command modules build real gateways/sources at the edge and reuse the injected Aretro operation context.
- Evidence boundary: Aretro still emits factual observations only; `branch-retro` remains responsible for semantic retrospective interpretation.

Validation evidence captured during the slice:

- `pnpm --dir ts --filter @sdl/aretro run test`
- `pnpm --dir ts --filter @sdl/aretro run check`
- `pnpm --dir ts exec vitest run --config vitest.integration.config.ts packages/kernel/test/integration/aretro-extension-cli.test.ts`

## Follow-Ups

No Aretro Capability API follow-up is open without a concrete in-process consumer. Broader CLI conformance findings for Aretro result/error shapes remain separate CLI-UX work and were not part of this command-face cutover.
