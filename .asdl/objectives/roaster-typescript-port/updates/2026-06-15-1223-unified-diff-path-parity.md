# Unified Diff Path Parity Hardened

## Summary

The TS roaster unified-diff parser has been hardened for path cases that matter to CI parity: prefixed rename/copy metadata paths are preserved where expected, quoted UTF-8 paths decode correctly, and parsed diff results are readonly to match the intended immutable parser contract.

Evidence: local branch diff against `roaster-typescript-unified-diff-parser-scaffold`; PR #1597 corroborates the same file set. Verification: `pnpm --dir ts --filter @asdl/roaster run test` and `pnpm --dir ts --filter @asdl/roaster run check` passed.

## Objective Impact

This advances the pure-core/scaffold roadmap slice from not-started to in-progress. The unified-diff parsing sub-surface is more trustworthy, but the broader row remains open because token estimation, review-definition parsing, path-applicability globs, and `asdl.toml [roaster.diff]` config conversion still need their own porting and parity evidence.

The path-parity risk is partially de-risked for rename/copy metadata and quoted UTF-8 paths; it is not evidence that all pure-core or CI behavior is complete.

## Follow-Ups

- Finish the remaining pure-core surfaces named in the roadmap row.
- Keep path/config parity covered by direct unit tests as each remaining parser/config surface is ported.
