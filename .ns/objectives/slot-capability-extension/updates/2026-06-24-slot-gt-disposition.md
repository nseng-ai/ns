# Semantic Update — `sdl slot gt` disposition settled

## Summary

Settled the `sdl slot gt` Peer API disposition. Structured stack facts remain supported through hidden command-face helpers by default (`sdl slot gt exec stack-branches` and `sdl slot gt exec stack-map-branches`). Mutating stack slot cleanup remains command-only as `sdl slot gt free-stack`. Human navigation remains command-only as `sdl slot gt up/down`. A future Peer API promotion should require a concrete first-party in-process consumer that needs composition beyond invoking the supported SDL command face.

## Objective Impact

- Marked “Decide and migrate `sdl slot gt` Peer API needs” complete in the roadmap.
- Updated active skill/reference guidance to spell runnable Graphite-aware Slot commands as `sdl slot gt ...` instead of the removed standalone `slot gt ...` surface.
- Preserved the above-SDK boundary: `@sdl/slot` owns Slot implementation and Peer APIs, while SDL owns the supported command entrypoint for these Graphite-aware command surfaces.
- Historical Objective updates and provenance were left untouched.

## Follow-Ups

- Finish classifying remaining orchestration-package Slot dependencies against the Peer API vs supported command-face boundary.
- Document Slot vocabulary/context once the remaining orchestration dependency row is complete enough to make the boundary durable for future implementers.
