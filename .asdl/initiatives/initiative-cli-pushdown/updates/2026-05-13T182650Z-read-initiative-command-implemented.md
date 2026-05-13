# Read-Initiative Command Implemented

## Summary

PR 4 is complete. The hidden `initiative exec read-initiative` command now reads one explicit slug-named Initiative record, rejects missing or path-shaped slug input with stable JSON negative envelopes, reports file-presence and update inventory facts, and renders raw Markdown for `initiative.md`, `roadmap.md`, and sorted direct `updates/*.md` in Markdown mode.

## Initiative Impact

This finishes the second deterministic Initiative CLI mechanic in the steelthread. Agents can now load one selected Initiative record with one tested command while keeping selection, interpretation, and Markdown meaning outside the CLI. The command preserves the slug-only contract and avoids embedding raw Markdown content in JSON output.

## Follow-Ups

- Continue with PR 5: `initiative exec tracking-gate-facts <slug-or-path> --base-ref <ref>`.
- Later update Initiative skills/docs to delegate record-reading mechanics to the new command while retaining semantic decision rules.
