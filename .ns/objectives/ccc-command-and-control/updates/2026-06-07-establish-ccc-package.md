# Established CCC Package and Vocabulary

## Summary

The first implementation slice created the private TypeScript workspace package `@asdl/ccc` under `ts/packages/ccc/` and added durable CCC vocabulary. The slice added package metadata, TypeScript config, a deliberately small package identity export, a focused package identity test, `ts/packages/ccc/CONTEXT.md`, and relationship/context updates in `CONTEXT-MAP.md` and `ts/packages/pi-extensions/CONTEXT.md`.

No public slash-command registrations or command names changed in this slice.

## Objective Impact

The roadmap item for establishing the CCC package and vocabulary is complete. CCC now has a named package boundary and documented ownership language: CCC composes lower-level capabilities, while lower packages must not import `@asdl/ccc`.

Validation evidence: `bun run --cwd ts check`, `bun run --cwd ts test`, targeted `dprint check`, and `git diff --check` passed in the parent session.

The Objective remains open for the next migration slices, including moving the cmux workspace/sidebar suite and neutralizing shared session artifacts.

## Follow-Ups

- Move the cmux workspace/sidebar command suite into CCC while preserving public `/cmux:*` command names.
- Keep monitoring import direction so lower packages and neutral primitives do not import `@asdl/ccc`.
