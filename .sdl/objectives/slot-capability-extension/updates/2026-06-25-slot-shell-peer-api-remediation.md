# Semantic Update — Slot shell and checkout side-effect remediation

## Summary

PR #2135 tightens the Slot command-face and Peer API boundary after the SDLCC checkout migration. Shell marker/CD-wrapper helpers moved from `@sdl/slot/shell-support` to the neutral `@sdl/core/shell-support` subpath, while SDL now owns both `sdl shell ...` and the compatibility `sdl slot shell ...` mounting. Slot no longer exposes shell command builders or accepts SDL shell-group injection.

The same remediation preserves canonical `@sdl/slot/api` checkout targets through CCC instead of mapping them through a local CCC DTO, and makes Slot Peer API checkout side effects explicit through predicate-named options (`shouldCopyClipboard`, `shouldWriteCdDirective`) that default to safe non-interactive behavior for in-process callers.

## Objective Impact

- Reinforces the completed command-face strategy: `@sdl/slot` owns Slot implementation and Peer APIs, while SDL owns the supported shell command mounting and parent-shell wrapper behavior.
- Reinforces the completed checkout Peer API migration: CCC now consumes the canonical Slot checkout target shape without dropping Peer API fields through a local wrapper.
- Reduces ambiguity for the remaining documentation slice by settling where generic shell support lives and how checkout side effects are controlled at the Peer API boundary.
- Leaves the Slot vocabulary/context documentation row open as the remaining non-parked work.

## Follow-Ups

- Document Slot vocabulary/context and the above-SDK boundary, including the SDL-owned shell mounting boundary, the `@sdl/core/shell-support` helper home, and the safe default side-effect behavior for Slot Peer API checkout.
- Keep timeout/abort behavior as separate follow-up design work if future Slot Peer API callers need cancellation or timeout semantics.
