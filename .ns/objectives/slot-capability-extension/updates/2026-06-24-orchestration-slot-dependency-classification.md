# Semantic Update — Orchestration Slot dependency classification

## Summary

Classified remaining Slot dependencies in orchestration/runtime packages against the Peer API versus supported command-face boundary. CCC checkout/autoslot/cmux dispatch remains Peer API appropriate because it composes slot checkout into in-process orchestration and test fakes through `SlotClient`. sdlcc stack-map checkout/model loading, Pi PR stack-feedback discovery, CCC dispatch dry-run previews, and land-stack managed-slot cleanup remain supported command-face appropriate because they are explicit agent/human command workflows or subprocess executions through `sdl slot ...`.

The inventory found no remaining deep `@sdl/slot/src/...` imports in the inspected orchestration/runtime package sources. It did find stale user-facing standalone `slot ...` wording, which was corrected to `sdl slot ...`.

## Objective Impact

- Marked the checkout Peer API migration row complete: CCC checkout consumers use `@sdl/slot/api` rather than parsing checkout JSON from a subprocess.
- Marked the remaining orchestration dependency classification row complete with explicit dispositions for Peer API usage, supported command-face subprocesses, and stale/deep dependencies.
- Updated stale Objective wording from `slot gt` to `sdl slot gt`.
- Left the Slot vocabulary/context documentation row open as the remaining non-parked work.

## Follow-Ups

- Document Slot vocabulary/context and the above-SDK boundary now that the remaining orchestration dependency classification is settled.
