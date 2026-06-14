# TypeScript brmem export CLI slice

## Summary

Implemented the public TypeScript `brmem export` operation in `ts/packages/brmem`. The standalone TypeScript CLI now routes `export` to a real operation instead of the `not_implemented` placeholder, while hidden `exec resolve-prompt`, wrapper/skill cutover, Python fallback deletion, and TypeScript consumer rewiring remain out of scope.

The export operation preserves the accepted public contract for this slice: omitted `--namespace` exports only the Base Namespace, `--namespace base` targets the Base Namespace, named Namespace exports are supported, `--branch` overrides current-branch resolution, omitted `--output-dir` creates a fresh temp output directory, relative `--output-dir` resolves under the CLI cwd, Entries are sorted by Entry Key, JSON fields use the Python-compatible snake_case shape, empty selection returns negative exit `1`, `--dry-run` performs preflight without writing, and all targets are preflighted before any file write.

Filesystem safety is covered with real temp-directory/symlink scenario tests for output path files, broken output symlinks, target symlinks, target directories, parent files, parent symlinks, existing-file conflicts, overwrite, dry-run non-mutation, unsafe Entry Key segments, duplicate target paths, missing diagnostics/content, and gateway failure surfacing. A targeted RealGitBrmemGateway smoke proves public CLI export reads real Snapshot Refs and materializes Base Namespace Entries through the shared git-backed storage layer.

## Validation Evidence

Passed:

- `pnpm --dir ts/packages/brmem run check`
- `pnpm --dir ts/packages/brmem run test`
- `pnpm --dir ts exec vitest run --config vitest.config.ts packages/clinkr/test packages/brmem/test`
- `pnpm --dir ts run check`

Attempted full TypeScript workspace tests:

- `pnpm --dir ts run test` — failed in existing `packages/asdl-dev/test/scenario/preview-url-cli.test.ts` cases because `asdl-dev cp` is currently reported as `unknown command 'cp'`. This is the same unrelated workspace blocker recorded by the previous copy slice and is outside the brmem export implementation.

## Objective Impact

The combined roadmap row `Port copy and export` is now marked `[x]`: public TypeScript `copy` and `export` CLIs are implemented and validated.

## Follow-Ups

- Keep `exec resolve-prompt`, wrapper/skill cutover, Python fallback deletion, and TypeScript consumer rewiring pending for their own roadmap rows.
- Do not generalize a shared filesystem gateway from this slice alone; export uses direct Node filesystem operations with real temp-directory/symlink coverage as planned.
