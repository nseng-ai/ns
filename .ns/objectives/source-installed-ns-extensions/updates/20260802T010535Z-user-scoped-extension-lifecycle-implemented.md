# User-scoped extension lifecycle implemented

## Summary

The four extension lifecycle commands now accept `--scope user` / `-s`, with project scope remaining the default and retaining its existing activation and acquisition behavior. User scope resolves the single XDG configuration path, consumes and edits only top-level `extensions`, canonicalizes local sources to lexical absolute paths, validates local descriptors for install and update, treats local update as an unchanged in-place validation, and removes declarations without requiring or deleting local source bytes.

User operations branch before repository preflight and project activation. They do not require Git, supported harnesses, acquisition, artifact inspection, or repository writes. A lifecycle-owned user-config gateway preserves unrelated TOML bytes and line endings and uses expected-state compare-and-write semantics. User success schemas and renderers distinguish command availability from project activation rather than synthesizing repository facts.

This slice deliberately defers user-managed npm storage: user-scoped npm install, update, and uninstall return stable actionable failures, while list remains successful and isolates each hand-authored npm declaration as an unavailable row without hiding valid local declarations.

## Objective Impact

The roadmap row for user-scoped extension lifecycle operations is complete. Fake-driven scenarios cover canonical and idempotent install, validation-before-write, missing and malformed inventory, mixed valid/missing/relative/npm rows, unchanged and dry-run update, recovery uninstall with missing source, absent declarations, and concurrent config changes. Real-host integration proves install, command discovery, list, update, and uninstall outside Git; absolute in-place persistence; exact CRLF and unrelated-content preservation; npm mutation/list contracts; XDG and HOME path behavior; and no repository artifacts.

Validation evidence:

- focused lifecycle, CLI-contract, and real-adapter/host tests passed;
- `just` passed, including dependency, format, lint, typecheck, default tests (6,058), TypeScript style guard (168), dprint, and Objective checks;
- `just ts-test-integration` passed (235 tests);
- `just ts-test-isolated` passed (16 tests);
- `git diff --check` passed.

## Follow-Ups

- Choose and implement the XDG-owned managed npm storage, update, and cleanup policy; the lifecycle error/diagnostic contract intentionally points to that deferred slice.
- Prove all eight intended source-checkout extension packages across repositories while keeping Skill Exposure project-local.
- Complete product-wide documentation for scope, command-only semantics, precedence, local/npm behavior, and moved-checkout recovery.
