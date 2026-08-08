# Semantic Pi Interaction Landed

## Summary

The Pi CLI bridge now provides invocation-scoped semantic confirmation and selection callbacks. When Pi has applicable UI, these operations delegate only to `ctx.ui.confirm` and `ctx.ui.select` while preserving activity phases. Confirmation returns the named `confirmed` or `declined` state. Selection returns `selected` with a value or the named `cancelled` state. When UI or a requested operation is unavailable, the callback throws an explicit error without touching terminal input or UI.

The shared host contract requires confirmation and selection from every host. It exposes only these semantic operations and their named results. It does not expose terminal streams, line readers, raw mode, key events, cursor state, resize behavior, or other terminal machinery. The standalone host provides terminal confirmation and explicit unsupported-operation errors where it cannot interact.

## Objective Impact

The fourth roadmap item is complete. Runner checkpoint `710a8f06b03cced1d40b3da207228610ac6d163f` records the implementation and passed the runner gate. Every ns host must now provide both semantic interaction operations. The Pi host maps user outcomes to named states and reports an error in headless or operation-missing contexts.

Child-reported validation includes the full TypeScript suite with 6,369 passing tests, typecheck, lint, formatting, style guard, focused host tests, and diff checks. Parent verification inspected the adapter and reran the two directly affected suites: 2 files and 49 tests passed. Default `just` remains blocked by pre-existing dprint drift in the unchanged Objective MCP reference.

## Follow-Ups

- Make structured output and rendering capability explicit per invocation.
- Add Pi-safe output capture, non-ANSI rendering, terminal-control sanitization, and the remaining end-to-end host scenarios.
- Keep broader terminal interaction models out of the shared contract unless future evidence justifies them.
