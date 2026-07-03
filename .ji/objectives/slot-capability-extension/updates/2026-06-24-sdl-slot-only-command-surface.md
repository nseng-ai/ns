# Semantic Update — SDL-only Slot command surface

## Summary

PR #2113 changes the Slot command-face decision from “standalone `slot` remains canonical with `sdl slot` as an alias” to a hard cutover: `sdl slot ...` is now the only supported Slot CLI surface. The implementation removes the top-level `slot` bin/shim install path, deletes standalone Slot shell/completion command support and tests, routes first-party runtime subprocesses through `sdl slot ...`, and updates docs/user-facing command text accordingly.

## Objective Impact

- Revised the Objective thesis/scope/non-goals to reflect that `@sdl/slot` remains the Slot implementation and Peer API owner while SDL owns the supported command entrypoint.
- Updated the completed command-face roadmap row with the superseding hard-cutover decision.
- Advanced “Remove remaining CLI/deep sibling dependencies from orchestration packages” to in-progress: remaining command subprocesses now target the supported SDL command face, while future work still needs to distinguish acceptable command-face calls from machine-decision consumers that deserve Peer APIs.
- The older `2026-06-24-slot-command-face-alias.md` update remains historical provenance for the prior alias decision; this update supersedes it.

## Follow-Ups

- Decide which `sdl slot gt` stack discovery/free-stack consumers should become curated Peer APIs versus remain SDL command-face subprocesses.
- Finish classifying remaining orchestration-package Slot dependencies against the Peer API vs supported command-face boundary.
- Document Slot vocabulary/context once the Peer API and command-face boundary is stable enough for future implementers.
