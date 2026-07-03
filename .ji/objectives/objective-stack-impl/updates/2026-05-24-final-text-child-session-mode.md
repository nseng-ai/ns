# Final-Text Child Session Mode Implemented

## Summary

Evidence: local branch diff against Graphite parent `add-final-text-child-session-return-and-objective` adds final-text mode to the child-session helper. `runChildSession` now accepts `returnMode: "final-text"` without terminal tools; clean child stops with captured assistant text return `status: "final-text"` plus `finalText`, progress, elapsed data, stop reason, and `sessionFile` evidence.

Clean child stops without useful assistant text return `stopped-without-useful-text`. Cancellation, nonzero exit, stop-reason error handling, protocol errors, and terminal-capture compatibility remain represented in the result model and tests.

Verification: `cd ts/packages/pi-extensions && bun test && bun run check` passed. PR evidence was not required; local branch evidence and Graphite parent metadata were sufficient.

## Objective Impact

This completes the final-text contract, parser/runner behavior, and fake-driven coverage roadmap rows. It de-risks the Pi JSON event-shape concern by pinning assistant text extraction from `message_end`, `turn_end`, and `agent_end` events while ignoring non-assistant, thinking, tool-call, empty, and malformed content.

The Objective remains open because the generic parent-callable `run_child_session_text` tool, its tests, and the `/objective-stack-impl [objective-slug]` prompt have not been implemented yet.

## Follow-Ups

- Implement the generic parent-callable `run_child_session_text` tool in the engineered Pi extension layer, with a project-local discovery shim if needed.
- Add fake-driven coverage proving the tool passes explicit title/prompt arguments to a child session and returns final text/status/session-path evidence as an ordinary tool result.
- Add the current-session-only, brmem-free `/objective-stack-impl [objective-slug]` prompt and validate the remaining TypeScript and Markdown checks.
