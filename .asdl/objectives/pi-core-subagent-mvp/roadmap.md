# Roadmap

## Work

- [ ] Reconcile `docs/pi/core-subagent-mvp-spec.md` with the resolved Objective decisions, especially capture-only child-local terminal tools and fresh-context-only MVP.
- [ ] Add public core types for `runChildSession()` on `ExtensionCommandContext`, including terminal capture tool definitions and result status types.
- [ ] Implement non-replacing child runtime/session creation with same cwd/worktree, fresh conversation context, parent-derived session persistence, and returned `sessionFile`.
- [ ] Implement child-local capture-only terminal tools, schema validation, collision checks, canonical input capture, and terminal-run stopping behavior.
- [ ] Implement deterministic error semantics for terminal tools with sibling tool calls, child stops without terminal tools, model/provider errors, and cancellation.
- [ ] Add parent-session progress rendering or settle the minimal accepted UI shape for MVP, ensuring title/state/session path are visible.
- [ ] Add core regression tests for awaited child completion, terminal payload capture, collision failure, no extra model turn after terminal capture, sibling-tool protocol error, stopped-without-terminal, cancellation, and absence of slash-command handoff.
- [ ] Update Pi extension docs with the function-call mental model, examples, terminal capture rules, and parked non-goals.

## Parked

- [ ] Objective stack extension rewrite that consumes `ctx.runChildSession()`.
- [ ] Interactive foreground child sessions that can receive user replies.
- [ ] Parent-context inheritance with filtering of parent-only orchestration artifacts.
- [ ] Parallel/background subagents and isolated worktree management.
- [ ] Durable resume of an in-flight child run after Pi process restart.
