# Real Session Message Shape Gap Found

## Summary

Manual smoke of the subagent fleet detail navigator against a real explorer subagent session showed a closure-blocking gap in the current-action/timeline slice. The detail screen displayed token totals and trend data, but still showed `0 turns / 0 tools`, `current action: thinking / waiting for model output`, and `No timeline events yet`.

Inspection of the same child session JSONL showed that the session already contains useful activity, but in a different existing Pi event shape than the current timeline parser recognizes: top-level `message` records whose assistant content includes `toolCall` blocks, followed by top-level `message` records with `message.role = "toolResult"`. The current implementation primarily recognizes `message_end`, `turn_end`, `agent_end`, and `tool_execution_*` shapes.

## Objective Impact

This disproves the stronger form of the current-action assumption for real explorer sessions: existing session JSONL has enough information, but the parser does not yet support all emitted shapes. The Objective should remain open. The current-action roadmap row is now marked partial, and a new Work row tracks parser support for top-level Pi `message` events.

This is not a request for a new runner event protocol, semantic events, storage, CLI parity, or actuator controls. It is a narrow follow-up to derive the intended dashboard signals from an existing session JSONL shape already emitted today.

## Follow-Ups

- Extend `ts/packages/extensions/ns-pi-subagents/src/runner-subagents/timeline.ts` to parse assistant `toolCall` content and `toolResult` messages from top-level `message` events.
- Update the JSON-event progress/count parser used by the detail header so real sessions no longer show `0 turns / 0 tools` when tool calls and assistant messages are present.
- Add a sanitized fixture/test for the observed shape: assistant thinking/toolCall, toolResult, assistant text, and multiple tool calls.
- Re-run manual navigator smoke before closure.
