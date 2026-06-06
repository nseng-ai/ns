# Command Output Summaries Subsumed

## Summary

The standalone `command-output-summaries` Objective is now absorbed into `cross-harness-parity` as a bounded shared-primitive workstream.

The absorbed work remains the same product goal: provide a harness-neutral summarized-command CLI/helper that writes full command logs to payload artifacts and returns bounded deterministic summaries. The durable ownership changed because the central architectural constraint is parity: the first implementation must be shared CLI/helper plus skill guidance, with Pi only as an optional adapter.

## Objective Impact

`cross-harness-parity` now owns command-output summaries in its thesis, scope, roadmap, completion criteria, assumptions/risks, and open questions. The parity table remains one row per actual Pi command/tool; command-output summaries has no table row until an implemented Pi surface exists.

This reduces duplicate Objective tracking while preserving the payload artifact relationship: implementation should still build on the carry-forward contract in `agent-payload-artifacts`.

## Follow-Ups

- Implement the new roadmap row for parity-native command-output summaries as a shared CLI/helper.
- If a Pi command/tool is added later, add or refresh a parity-table row and require FULL parity through the shared CLI/helper plus skill guidance.
- Keep broad bash interception, Pi-only command summarization, LM default summarization, all-command migration, payload retention/GC, and token-budget measurement parked unless a future Objective explicitly reopens them.
