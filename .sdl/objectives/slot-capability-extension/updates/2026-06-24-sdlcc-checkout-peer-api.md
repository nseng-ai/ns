# Semantic Update — SDLCC checkout Peer API migration

## Summary

PR #2131 migrates SDLCC stack-map cmux activation from a direct `sdl slot checkout --format json --no-clipboard` subprocess plus local JSON parsing to the curated `@sdl/slot/api` Peer API. The activation path now accepts an injected `SlotClient`, calls `checkoutBranch()` when a selected branch lacks a known slot worktree path, and continues to use cmux subprocess execution only for workspace focusing/opening.

The branch also keeps SDL shell command option ownership concrete at the SDL call site and omits autoslot `env` when undefined under `exactOptionalPropertyTypes`.

## Objective Impact

- Broadened the checkout Peer API roadmap evidence from CCC-only to in-process sibling consumers including SDLCC.
- Updated the orchestration dependency classification: SDLCC stack-map workspace checkout is now Peer API appropriate, while SDLCC stack-map model loading remains a supported `sdl slot ...` command-face workflow.
- De-risked the assumption that SDLCC can depend on `@sdl/slot/api` without an architectural package cycle; workspace dependency validation and TypeScript checks passed.
- Left the Slot vocabulary/context documentation row open as the remaining non-parked work.

## Follow-Ups

- Document Slot vocabulary/context and the above-SDK boundary now that CCC, SDLCC, command-face, and `sdl slot gt` dispositions are settled.
