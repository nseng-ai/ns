# Terminal-Capture Baseline Recorded

## Summary

Evidence from the local branch diff against Graphite parent `update-objective-stack-child-session-rewrite-brief` adds the Objective record itself. Code inspection of the current worktree shows child-session helper/runtime/demo infrastructure is present, but it remains terminal-capture oriented: `runChildSession` requires `terminalTools`, the demo extension reports structured terminal captures, no `run_child_session_text` tool was found, and `.pi/prompts/objective-stack-impl.md` is not present.

PR evidence was not required; local branch evidence and Graphite parent metadata were sufficient for this update.

## Objective Impact

The existing child-session infrastructure is useful baseline work for this Objective, but it does not complete the final-assistant-text return path, generic parent-callable text tool, or prompt-template entry point. The roadmap therefore remains active, starting with the final-text contract and parser/runner behavior.

The JSON-event-shape and no-useful-text risks remain open. The next implementation slice should pin the minimal event fields needed to return final assistant text with status, progress, diagnostics, and `sessionFile` evidence while preserving terminal-capture compatibility.

## Follow-Ups

- Define the final-text child-session result API.
- Teach the parser/runner to capture final assistant text without requiring terminal capture.
- Add fake-driven coverage for clean text returns, no-useful-text outcomes, and terminal-capture compatibility before adding `run_child_session_text` and the `/objective-stack-impl` prompt.
