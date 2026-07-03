# Kernel Reset and Changes Extension

## Summary

The first command-first architecture slice reset the SDL kernel command catalog and restored only `changes` as a direct project-local extension. `ts/packages/sdl/src/command-registry.ts` no longer imports or registers the prior repository workflow domain commands as built-ins. `.sdl/extensions/changes.ts` now implements `sdl changes` through the public `@sdl/sdl/sdk` surface only.

The `changes` extension deliberately duplicates the small existing behavior locally: read-only git snapshot commands, model default/env selection, prompt construction, 1–4 bullet validation, error wording, and output formatting. That duplication is not promoted to SDK in this slice; it is recorded as architecture evidence for comparison with later command migrations.

## Objective Impact

The reset row is complete for the first slice. The empty-kernel behavior is covered by SDL CLI/unit tests, project-local `changes` discovery/loading and clean/dirty/error behavior are covered by scenario tests, and source-search evidence shows default domain command registration is gone from the kernel registry.

`cp`, `submit`, and `regenerate-pr` are intentionally unavailable as SDL commands until later project-local extension slices restore them. Pi now keeps only the explicit `changes` mirrors for this first slice and removes unavailable mirror registration/parity records for checkpoint, submit, and PR regeneration surfaces. Narrow docs/context/push guidance were updated so active wording no longer describes these repository workflow commands as universal built-ins.

## Follow-Ups

- Migrate `cp` next as the first mutating project-local command extension, using the localized `changes` duplication as a baseline for deciding which git/model helpers are still extension-owned versus SDK candidates.
- Restore `regenerate-pr` and `submit` only through their planned project-local migration slices, not as compatibility stubs or renewed built-ins.
- Revisit dynamic Pi mirror discovery only after more command slices clarify whether exact static mirrors are sufficient.
