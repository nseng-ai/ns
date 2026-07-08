# Top-Level Message Parsing Implemented

## Summary

The local branch `message-event-parsing-observability` implements the parser compatibility follow-up found during real-session smoke. The ns-pi-subagents session parsing path now recognizes top-level Pi `message` events whose assistant content contains `toolCall` blocks, and top-level `message.role = "toolResult"` records.

This is compatibility parsing for the existing child-session JSONL shape, not a new runner event protocol. The implementation stays inside `ts/packages/extensions/ns-pi-subagents/` parser/detail behavior and targeted tests.

## Objective Impact

The current-action/timeline gap recorded in `2026-07-07-174600-real-session-message-shape-gap.md` is addressed at the parser/test level. The roadmap now marks the top-level-message parsing row complete and returns the current-action pane row to complete, with the caveat that manual navigator re-smoke has not yet been recorded.

Targeted coverage proves assistant visible text, private thinking blocks not being exposed as narration, assistant tool calls, pending current-action tools, matched and unmatched tool results, nonzero turn/tool header counts, and detail timeline entries for a sanitized top-level-message-only session.

Validation passed locally:

- `pnpm --dir ts --filter @nseng-ai/ns-pi-subagents test`
- `pnpm --dir ts --filter @nseng-ai/ns-pi-subagents check`
- `pnpm --dir ts run fmt:check`
- `pnpm --dir ts run lint`
- `pnpm --dir ts run check`

## Follow-Ups

- Run manual fleet navigator smoke against a real child/explorer session that previously showed token totals but `0 turns / 0 tools` before closing the Objective.
- If the real shape varies beyond the sanitized fixture, record the variation as a new parser compatibility finding rather than adding a runner event protocol by default.
