# Parity Audit Documentation Summary

## Summary

Documented the outcomes from the interactive `@asdl/pi-extensions` non-FULL parity audit:

- `/cp-preview` / `/checkpoint-preview` were removed rather than retained as WAIVED metadata.
- Pi model-visible tools are no longer standalone parity metadata rows; tool-dependent command workflows own fallback documentation.
- `/code:changes` is WAIVED as a read-only Pi UX helper over ordinary git/worktree evidence.
- `/code:land` is PARTIAL, reflecting extracted/test-backed CCC core logic but missing non-Pi CLI+skill reachability.
- `/code:autoslot` remains PARTIAL because it mutates branch/worktree/slot state and still needs either a portable skill/CLI path or a deliberate WAIVED verdict.
- `/grill-ui` and `/grill-with-docs-ui` were renamed to `/pi:grill-me` and `/pi:grill-with-docs`.
- `/handoff-tab` was renamed to `/ccc:handoff-tab`.
- The model shortcut family remains grouped WAIVED as session-local model selection convenience.

## Objective Impact

The durable docs now distinguish command parity from Pi tool-call host bridges, explain the new namespace choices, and record the remaining actionable PARTIAL rows. The parity table remains command-focused while allowing selected non-tool UI primitives such as the worktree status line.

## Follow-Ups

- Move `/code:land` to FULL by adding a clinkr-based CLI entry plus installed skill.
- Resolve `/code:autoslot` by either adding portable reachability or recording a deliberate WAIVED verdict.
- Refresh historical/closed Objective prose only if a broader documentation rebaseline is requested; historical records may still mention old command names.
