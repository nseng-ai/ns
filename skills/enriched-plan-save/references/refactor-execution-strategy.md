# Refactor execution strategy

When a saved plan includes same-shape edits across multiple files, explicitly choose how the executor should make the change.

- For TypeScript symbol/API refactors, prefer deterministic AST/codemod tooling when a suitable repo tool exists; use `ts-morph-analyze` for AST inspection before designing broad TypeScript changes.
- Prefer deterministic AST/codemod tooling for purely syntactic refactors when a suitable repo or installed skill tool exists.
- For 1-4 files or semantic doc/spec changes, prefer reading affected sections and making precise edits; do not recommend opaque ad hoc `text.replace()` scripts for semantic changes.
- For 5+ file-local edits, especially mixed code/docs/tests or prose-aware refactors, recommend `refactor-swarm`.
- Require a final grep or equivalent stale-terminology check when changing names or concepts.
