# SDL CLI Theme Package Extraction Landed

## Summary

The first extraction slice moved SDL house-style presentation primitives out of Clinkr into the new `@sdl/cli-theme` workspace package at `ts/packages/infra/cli-theme/`. The former Clinkr theme source/tests now live in that package, use public `@sdl/clinkr` caps types and `@sdl/core/terminal-escapes`, and preserve the existing palette/glyph/result-block/status-line/table/text behavior.

Live consumers in Flow, CCC, Slot, and Objective now import `@sdl/cli-theme`; their package manifests depend on the new workspace package. `@sdl/clinkr` no longer exports `./theme`, no longer carries the `ansis` dependency, and its stream tests use local deterministic fixtures instead of depending on the theme package.

## Objective Impact

- Completed the package-establishment, consumer-rewire, old-export-removal, boundary-test, and overlapping CLI UX guidance rows for the extraction slice.
- `core-import-isolation` now enforces that Clinkr production source does not import `@sdl/cli-theme` and that `log-update` remains constrained to `src/stream/**`.
- `@sdl/cli-theme` has a package-boundary test that rejects capability/domain imports, Clinkr private subpaths, `process.*`, and command exit primitives.
- Current CLI UX house-style/audit/objective/roadmap guidance names `@sdl/cli-theme` for house-style primitives while preserving historical Semantic Updates as provenance.
- The Objective remains open for the planned post-extraction consolidation assessments.

Validation evidence recorded during the slice:

- `just ts-deps-check` passed.
- Focused Vitest for `packages/infra/cli-theme/test`, `packages/infra/clinkr/test/core-import-isolation.test.ts`, and `packages/infra/clinkr/test/stream/sink.test.ts` passed.
- Consumer-focused Vitest for Flow phase-stream, Slot navigation presentation, Objective tests, and CCC tests passed.
- `just ts-format-check`, `just ts-lint` (with pre-existing warnings only), `just ts-check`, `just ts-test`, `just ts-guard`, and `just dprint-check` passed after formatter fixes.

## Follow-Ups

- Rebaseline the migrated-command duplication analysis against `@sdl/cli-theme` instead of stale `@sdl/clinkr/theme` paths.
- Assess the remaining consolidation candidates one by one: outcome/result discriminator mapping, success-with-warnings rendering, caps-resolution helper placement, Slot navigation footer migration, table/Markdown table consolidation, and status-to-intent mapping helpers.
- Add a package-specific `ts/packages/infra/cli-theme/CONTEXT.md` and update `CONTEXT-MAP.md` during a focused repo-ontology/package-context pass rather than broadening this extraction slice.
