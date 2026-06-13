# CCC Handoff Tab Rename

## Summary

Renamed the focused cmux handoff command from `/handoff-tab` to `/ccc:handoff-tab` while keeping its parity classification WAIVED.

## Objective Impact

The command name now reflects that the value is CCC/cmux session orchestration over the portable handoff artifact contract. The parity table row remains WAIVED with `handoff-create` plus manual `handoff-pickup` as the agent-neutral fallback.

## Follow-Ups

- Continue the command-only parity audit with `/code:land` next.
- Historical/closed Objective records still mention `/handoff-tab`; refresh them only if a deliberate documentation rebaseline is requested.
