# Vocabulary and active-doc guidance swept to ji

## Summary

Updated active guidance to use `ji` vocabulary instead of live `SDL` product language. The sweep covered the root agent/context entrypoints (`AGENTS.md`, `CONTEXT.md`, `CONTEXT-MAP.md`), the rename orientation, active docs outside historical ADRs, first-party skills, and package-local Markdown/context guidance under `ts/`. `CONTEXT.md` now has the canonical `ji` glossary entry with lowercase-always/no-expansion guidance and `SDL` / `Source Development Lifecycle` in Avoid. ADR 0024 now records the superseding npm target `@nseng-ai/ji` and no longer tells readers to claim `@ji`.

The sweep deliberately left actual current package specifiers, package names, directory names, and compatibility-boundary names such as `@sdl/*`, `@sdl-local/*`, `sdl-flow`, `sdl-land`, and `sdlcc` for the separate package-scope roadmap row.

## Objective Impact

- The vocabulary-sweep roadmap row is complete for active guidance: no non-historical active Markdown guidance now introduces `SDL` as the product name or tells agents to target `@ji/*`.
- The cross-cutting orientation now points agents at `@nseng-ai/*` / `@nseng-ai/ji`, aligning future sessions with the npm decision.
- Root context now encodes the casing/no-expansion rule directly, making `ji` the canonical term for future domain-language work.

## Follow-Ups

- Run the package-scope sweep separately to rename actual workspace package specifiers and remaining lowercase package/path surfaces (`@sdl/*`, `@sdl-local/*`, `sdl-flow`, `sdlcc` → `jicc`) according to the roadmap.
- Historical ADRs and the naming brief still mention `SDL`/`asdl` as historical/rejected names; leave those as provenance unless a separate historical-record policy changes.
