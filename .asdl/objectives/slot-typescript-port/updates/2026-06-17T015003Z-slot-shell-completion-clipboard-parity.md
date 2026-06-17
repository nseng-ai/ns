# Semantic Update: slot shell/completion/cd/clipboard parity slice

## Summary

Implemented the TypeScript `slot` OS-coupled parity slice with automated fake/tmp evidence:

- Added `slot shell show|install` with zsh/bash detection, `unsupported_shell`, exact parent-shell wrapper bytes, shell-integration markers, rc idempotency, parent creation, and trailing-newline handling through an injected rc filesystem.
- Added `slot completion show|install` with distinct completion markers and the same injected rc install behavior.
- Added minimal static shell-completion script generation to `@asdl/clinkr` because Clinkr had no Click-style `_SLOT_COMPLETE` mechanism. This is the intentional framework-coupled divergence from Python's activation line.
- Added scenario evidence that parent-shell cd directives are written only in human navigation mode and suppressed under `--format json` / `--json-schema`.
- Added scenario evidence that clipboard failures remain non-fatal and `--no-clipboard` reports skipped clipboard fields.

## Objective Impact

The roadmap row "Port the OS-coupled surfaces" now has automated fake/tmp coverage for shell, completion, cd-directive suppression, and clipboard parity. The implementation deliberately broadened scope to `@asdl/clinkr` after discovering no usable Clinkr completion mechanism; completion output now emits Clinkr-generated static zsh/bash scripts rather than Python/Click `_SLOT_COMPLETE={shell}_source slot` activation bytes.

Manual real-shell parity was not run in this slice by decision: it is now explicitly deferred to the cutover/distribution row, where wrapper installation and actual shell `cd` behavior must be checked in a throwaway rc before TypeScript distribution is considered complete.

## Follow-Ups

- During cutover/distribution, perform and record manual real-shell parity: install/source the wrapper in a throwaway zsh/bash rc, run navigation, confirm the shell changes directory, and confirm JSON/json-schema invocations do not cd.
- If future commands need dynamic/value completion, extend Clinkr's current static completion support deliberately rather than reviving the Click `_SLOT_COMPLETE` line.
