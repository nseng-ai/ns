# Read-Objective Command Implemented

## Summary

PR 4 is complete. The hidden `objective exec read-objective` command now reads one explicit slug-named Objective record, rejects missing or path-shaped slug input with stable JSON negative envelopes, reports file-presence and update inventory facts, and renders raw Markdown for `objective.md`, `roadmap.md`, and sorted direct `updates/*.md` in Markdown mode.

## Objective Impact

This finishes the second deterministic Objective CLI mechanic in the steelthread. Agents can now load one selected Objective record with one tested command while keeping selection, interpretation, and Markdown meaning outside the CLI. The command preserves the slug-only contract and avoids embedding raw Markdown content in JSON output.

## Follow-Ups

- Continue with PR 5: `objective exec tracking-gate-facts <slug-or-path> --base-ref <ref>`.
- Later update Objective skills/docs to delegate record-reading mechanics to the new command while retaining semantic decision rules.
