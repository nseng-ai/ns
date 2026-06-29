# Roaster capability closure

## Summary

Roaster's child Capability migration is complete and the Objective is closed. The delivered shape matches the Phase 2 architecture target: Roaster domain behavior remains Roaster-owned and gateway-injected, the durable Command Face is `sdl roaster ...`, and `@sdl/roaster/api` is the curated in-process Capability API.

PR #2339 (`https://app.graphite.com/github/pr/nseng-ai/sdl-tools/2339`) provides the final cutover evidence for removing the standalone `roaster` CLI binary, package `bin` wiring, install shim, and obsolete binary-specific tests.

## Objective Impact

This completes the final roadmap row, “Close out Roaster capability migration and update parent Objective.” The closure records that all child completion criteria are satisfied:

- Roaster command behavior is reachable through SDL extension loading with side-effect-light discovery and selected command execution.
- Public skills and CI use `sdl roaster ...`.
- Review definitions, review-log Branch Memory namespace/key semantics, and guarded GitHub publication behavior are preserved.
- The standalone `roaster` binary has a recorded hard-cut disposition with no retained duplicate public implementation.
- Parent Objective `sdl-extension-architecture` now records Roaster as a completed child migration under Phase 2 step 4.

No live GitHub publication validation was performed during the migration or closure.

## Follow-Ups

- Reassess broad `@sdl/roaster` package-root exports only if a future API-narrowing slice wants to make `@sdl/roaster/api` the exclusive TypeScript consumer surface.
- Handle remaining non-binary CLI conformance polish, such as structured failure `data` and `review log` continuation/bound state, under the CLI conformance work rather than this closed Capability migration.
- Treat any future Roaster Graphite-stack or remediation-oriented product workflow as a separate Objective; this Objective closes Roaster's Capability architecture migration only.
