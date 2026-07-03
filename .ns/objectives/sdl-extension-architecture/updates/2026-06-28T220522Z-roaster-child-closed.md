# Roaster child Objective closed

## Summary

The Roaster child Objective `roaster-capability-extension` is closed. Roaster now satisfies the Phase 2 Capability target: command behavior is provided through the SDL extension command face (`sdl roaster ...`), domain logic remains gateway-injected and Roaster-owned, `@sdl/roaster/api` is the curated in-process Capability API, and active public guidance/CI use the SDL face.

The final cutover PR evidence is PR #2339 (`https://app.graphite.com/github/pr/nseng-ai/sdl-tools/2339`), which removed the standalone `roaster` binary, package bin wiring, install shim, and obsolete binary-specific tests.

## Objective Impact

Phase 2 step 4 has been updated to record Roaster as a completed child migration. The remaining unspawned child capabilities are still pr-address and aretro; Roaster should no longer be listed as merely spawned or in progress.

Roaster closure also de-risks the command-face duplication concern for this capability: there is no retained standalone public `roaster` command implementation alongside `sdl roaster ...`.

## Follow-Ups

- Continue Phase 2 step 4 sequencing for the remaining unspawned capability children: pr-address and aretro.
- Keep Roaster package-root export narrowing and non-binary CLI conformance polish out of this parent step unless a future Objective explicitly picks them up.
