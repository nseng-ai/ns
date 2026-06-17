# Semantic Update: slot shell/completion fake-backed TypeScript slice

## Summary

Implemented the fake-backed TypeScript `slot shell` and `slot completion` surface in `@asdl/slot`:

- Added `slot shell show|install` with preserved parent-shell wrapper bytes, `SLOT_CD_DIRECTIVE_FILE` behavior, shell detection, zsh/bash rc-path selection, marker blocks, and idempotent rc install semantics.
- Added `slot completion show|install` with zsh/bash rc install behavior, durable completion markers, and coexistence with shell integration blocks.
- Added shared shell/rc install helpers for supported shell resolution, rc path selection, marker block construction, and newline-safe idempotent writes.
- Strengthened fake-backed navigation coverage for clipboard failure and `--no-clipboard` skip fields.

Completion activation deliberately diverges from Python: Python installs `eval "$(_SLOT_COMPLETE={shell}_source slot)"`, but the TypeScript `@asdl/clinkr` sources currently do not implement Click-style `_SLOT_COMPLETE` completion sourcing. The TypeScript port therefore installs a `slot`-owned static zsh/bash completion source script instead of preserving a known-broken Click activation line. Scenario tests assert that the selected scripts render/install and do not claim `_SLOT_COMPLETE` support.

Validation run:

```bash
pnpm --dir ts/packages/slot run test
pnpm --dir ts/packages/slot run check
```

Both commands passed.

## Objective Impact

This is partial progress on the roadmap row `Port the OS-coupled surfaces: slot shell show|install, slot completion show|install, parent-shell cd directive, and clipboard.` The fake-backed repository-file slice is now implemented and tested against redirected HOME/rc files and existing fake gateways.

The roadmap row should remain unchecked: the required manual real-shell parity note has not been performed in this update. No real operator `~/.zshrc`, `~/.bashrc`, clipboard, `~/.slots`, or non-throwaway worktree was intentionally touched.

## Follow-Ups

- Perform the documented manual real-shell parity check in a throwaway HOME/rc and throwaway repo/pool before marking the full OS-coupled roadmap row complete.
- If `@asdl/clinkr` later grows a first-class completion protocol, reconsider whether `slot completion` should switch from the package-local static scripts to the framework-supported activation path.
