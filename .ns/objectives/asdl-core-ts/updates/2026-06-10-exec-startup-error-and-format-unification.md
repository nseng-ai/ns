# Exec startup error and failure format unification

- Restored an explicit `startupError` field on `@asdl/core/exec` results so Node spawn failures remain distinguishable from ordinary exit-127 command failures.
- Unified shared exec failure presentation on the `formatCommandFailure` dialect and added `formatCommandStartupFailure` for startup failures.
- Removed duplicated asdl-dev startup heuristics and command-runner type declarations, plus shared gateway command-failure detail formatting.
- Single-sourced planned-branch brmem error sizing through `MAX_ERROR_CHARS` from `@asdl/core/exec`.
