# Core Root Export Removed

## Summary

Removed the vestigial `@sdl/core` root `.` export and repointed the remaining live bare importer to an explicit public subpath.

Implementation evidence:

- `ts/packages/infra/core/package.json` no longer exports `"."`.
- `ts/packages/hosts/pi/src/sessions/harness-session.ts` now imports `truncatedSha256Digest` from `@sdl/core/primitives`.
- `ts/packages/infra/core/src/index.ts` was deleted because the root barrel was no longer exported or referenced.
- Style-guard fixture strings in `ts/packages/infra/core/test/integration/typescript-style-guard.test.ts` now use `@sdl/core/primitives`, so they continue to test first-party alias behavior without documenting bare `@sdl/core` as an allowed current surface.

## Validation

- `rg -n 'from "@sdl/core"|from '\''@sdl/core'\''|import\("@sdl/core"\)|require\("@sdl/core"\)' ts/packages` returned no matches.
- `rg -n '"\."\s*:' ts/packages/infra/core/package.json` returned no matches.
- `just ts-deps-check` passed.
- `just ts-format-check` passed.
- `just ts-lint` passed.
- `just ts-check` passed.
- `just ts-test` passed: 373 files, 3626 tests.
- `just ts-test-integration` passed: 30 files, 169 tests.
- `just dprint-check` passed.

## Objective Impact

The roadmap row “Delete the vestigial `@sdl/core` root `.` export if it is still only supporting convenience imports; repoint live bare importers at explicit subpaths” is satisfied by this slice.
