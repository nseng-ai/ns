# Aretro child completed

## Summary

The `aretro-capability-extension` child Objective completed its command/API disposition slice. Aretro is now exposed as a package-owned SDL extension command face: `sdl aretro exec collect-evidence` and `sdl aretro exec read-evidence-detail`.

## Objective Impact

This advances parent step 4, per-capability migration, for Aretro:

- The standalone `aretro` bin/shim is retired rather than retained as a compatibility surface.
- `branch-retro` consumes the SDL command face directly.
- No `@sdl/aretro/api` Capability API was added because no current in-process consumer needs typed Aretro behavior.
- `@sdl/aretro` exports only explicit SDL command module subpaths, avoiding a broad root surface that could be mistaken for a peer Capability API.
- Aretro's deterministic evidence boundary is unchanged: semantic recommendations remain in `branch-retro` or another model-backed workflow.

Validation evidence is recorded in the child update `.sdl/objectives/aretro-capability-extension/updates/2026-06-28-sdl-aretro-hard-cutover.md`.

## Follow-Ups

No parent follow-up is required for Aretro unless a future in-process consumer appears and justifies a curated `@sdl/aretro/api`.
