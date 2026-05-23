# Pi Core Subagent MVP

## Thesis

Pi needs a minimal first-class child-session primitive that behaves like an awaited function call from an extension command: launch an isolated child Pi run, show enough parent-session progress to make it inspectable, stop on a structured terminal capture tool, and return that validated payload to the parent command without slash-command continuation hacks.

The motivating failure is the Objective stack implementation workflow, where completion currently depends on extension-injected slash text such as `/stack-impl-closeout ...`. `sendUserMessage()` intentionally bypasses slash-command expansion, so this control handoff is fragile. A core `runChildSession()` primitive should make the handoff explicit and typed.

## Scope

This Objective covers the Pi core primitive only:

- Add `ctx.runChildSession(...)` to `ExtensionCommandContext` only.
- Run child sessions as awaited, non-interactive foreground work: the parent command waits for a result and the child does not receive user replies while running.
- Use fresh child conversation context only for the MVP; parent-context inheritance is parked.
- Use the same cwd and worktree by default, with sequential execution assumptions.
- Persist each child session under a path derived from the parent session and expose the child `sessionFile` in the result and UI.
- Accept child-local terminal capture tool definitions as `runChildSession()` arguments rather than requiring globally registered tools.
- Make terminal capture tools capture-only: validate and return the tool input; do not run arbitrary extension `execute()` code.
- Treat validated terminal tool input as the canonical structured payload.
- Fail fast if a child-local terminal tool name collides with any existing built-in or extension-registered tool in the child runtime.
- Treat a terminal tool call with sibling tool calls in the same assistant message as an MVP protocol error.
- Include tests and documentation sufficient for extension authors to use the primitive safely.

## Non-Goals

This Objective does not include:

- Rewriting the Objective stack extension to consume `runChildSession()`.
- A general subagent marketplace, named agent registry, chains, parallel fanout, background jobs, or supervisor chat.
- Independent worktree management.
- Durable resume of an in-flight child run after Pi process restart.
- Interactive child sessions that receive user replies while running.
- Parent-context inheritance or filtering of parent orchestration artifacts.
- Model/tool override machinery beyond inherited defaults, except for the child-local terminal capture tools.
- Slash-command bridges or queued slash-command continuation APIs.

## Completion Criteria

The Objective is complete when Pi core provides and documents a working MVP with evidence that:

- `ExtensionCommandContext` exposes `runChildSession(options)` and non-command contexts do not.
- A command can launch a fresh-context child session, await it, and receive a `RunChildSessionResult`.
- Child sessions are persisted under a parent-derived path, and the path is returned to the parent.
- Child-local terminal capture tools are supplied inline with name, status, description, and parameter schema.
- Terminal tool inputs are schema-validated, captured, returned to the parent, and treated as the canonical payload.
- Terminal tool names that collide with existing tools fail before the child run starts.
- A terminal tool call ends the child run without another model turn.
- A terminal tool call with sibling tool calls returns a clear protocol error and does not silently execute an ambiguous mixed batch.
- A child that stops without a terminal tool returns a non-success stopped/error-style result that the parent can handle.
- Cancellation returns a `cancelled` result and leaves the child session inspectable when possible.
- Parent UI exposes compact child-run progress or an explicitly accepted minimal first version, including child title/state and session path.
- Regression coverage demonstrates that child completion does not rely on injecting slash-command text through `sendUserMessage()`.
- Documentation explains the function-call mental model, fresh-context default, terminal capture semantics, collision rules, and non-goals.

## Assumptions and Risks

Assumptions:

- The immediate platform need is an awaited function-call primitive, not an interactive or background subagent system.
- Fresh child context is sufficient for the first consumers if callers include all necessary task context in the prompt.
- Capture-only terminal tools are enough for structured completion because parent commands can perform side effects after `await runChildSession()`.
- Existing Pi session/runtime machinery can be reused to create a child runtime without replacing the active parent session.
- A parent-derived child session path is practical without disrupting ordinary session listing or resume behavior.

Risks:

- UI progress may require more TUI plumbing than expected; the exact MVP display level remains an open design point.
- In-process child runtime isolation may uncover shared mutable extension state or stale-context hazards similar to session replacement.
- Terminal tool batch handling may interact with provider/tool-call streaming internals in ways that make pre-execution protocol errors difficult.
- Same-worktree child execution is safe only because MVP is sequential; future parallel use would need separate worktree isolation.
- If child sessions are too hidden in nested paths, recovery and inspection may be harder unless the parent result and UI make the session path obvious.

## Open Questions

- What is the minimum acceptable parent UI for MVP closure: a real compact foreground progress block, or a simpler first version that still exposes title, state, and session path?
- Should child session files appear in normal session lists, and if so how should nested child paths be labeled?
- What exact result status taxonomy should distinguish protocol errors, model/provider errors, stopped-without-terminal, and cancellation?
