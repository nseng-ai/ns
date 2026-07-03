# Refresh Current Confirmation Prototype Evidence

## Summary

Provenance: objective-refresh basis target=de66cf7a76f8a8026e6c1a6b3c328d05fa5847b9 from=1a8c75acae899635a50d7ea4e885077d6e694c6c

The current checkout already contains a partial confirmation prototype: `ts/packages/clinkr/src/confirmation.ts` exports `confirmFromStdin`, `ts/packages/asdl-core/src/stdin.ts` keeps full-stream `readStdin()` separate from one-line `readStdinLine()`, and `slot`, `handoff`, and `packagechk` call sites use the Clinkr confirmation helper. Targeted Vitest coverage passed for Clinkr confirmation, the one-line stdin primitive, and the slot/handoff scenario paths that exercise confirmation prompts.

## Objective Impact

The Objective is no longer purely pre-implementation. The first three roadmap rows are now marked in progress because a low-level helper and migrations exist, but the durable Clinkr user-interaction seam is still incomplete: command operations still pass raw stdin/stderr functions into `confirmFromStdin`, `@asdl/clinkr/src/testing` has no semantic fake interaction helper, and no documentation explains when to use confirmation, Clinkr IO, or full-stream stdin readers.

## Follow-Ups

- Decide whether `confirmFromStdin` should remain public, become internal plumbing, or be replaced by a named Clinkr interaction/confirmation object.
- Add a fake/test interaction seam that scenario tests can use without modeling raw stdin or EOF mechanics.
- Migrate confirmation call sites away from per-operation raw stdin/stderr wiring after the higher-level seam exists.
- Document the boundary between interactive confirmation, Clinkr IO, and full-stream stdin payload readers.
