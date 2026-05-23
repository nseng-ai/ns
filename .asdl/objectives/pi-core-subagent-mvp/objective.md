# Pi Core Subagent MVP

## Thesis

Pi needs a minimal first-class child-session primitive that behaves like an awaited function call from an extension command: launch an isolated child Pi run, show enough parent-session progress to make it inspectable, stop on a structured terminal capture tool, and return that validated payload to the parent command without slash-command continuation hacks.

The motivating failure is the Objective stack implementation workflow, where completion currently depends on extension-injected slash text such as `/stack-impl-closeout ...`. `sendUserMessage()` intentionally bypasses slash-command expansion, so this control handoff is fragile. A core `runChildSession()` primitive should make the handoff explicit and typed.

The useful product shape is foreground child session + lightweight parent progress + terminal capture result + parent continuation. It is not a general subagent marketplace or background job system.

This Objective is now the canonical design record for the MVP. The former standalone `docs/pi/core-subagent-mvp-spec.md` was retired so the product contract, assumptions, risks, and review plan live in one durable Objective instead of drifting across duplicate documents.

## Scope

This Objective covers the Pi core primitive only:

- Add `ctx.runChildSession(...)` to `ExtensionCommandContext` only; non-command contexts do not gain this API.
- Expose `runChildSession()` as an awaited function-call-style parent continuation: parent command code waits for the child result and then performs its own side effects, orchestration, or status handling.
- Run child sessions as awaited, non-interactive foreground work: the parent command waits for a result and the child does not receive user replies while running.
- Use fresh child conversation context only for the MVP; parent-context inheritance is parked.
- Still construct the child session with normal Pi cwd-aware context such as project instructions, active tools, skills, date, and working directory.
- Use the same cwd and worktree by default, with sequential execution assumptions.
- Create a child session/runtime without replacing the parent runtime or active parent session.
- Persist each child session under a path derived from the parent session and expose the child `sessionFile` in the result and UI.
- Render lightweight parent-session progress when feasible, such as child title, state, current tool, tool count, turn count, elapsed time, session path, and terminal outcome.
- Keep the full child transcript out of the parent LLM context by default; the parent command receives the structured result and may decide what to append or summarize.
- Inject generic child boundary instructions for one delegated task: complete only the assigned task, do not orchestrate follow-up child sessions, use real tools for file changes, and finish with a supplied terminal capture tool when complete or blocked.
- Accept child-local terminal capture tool definitions as `runChildSession()` arguments rather than requiring globally registered tools. Each definition includes name, status, description, and parameter schema.
- Make terminal capture tools capture-only: validate and return the tool input; do not run arbitrary extension `execute()` code.
- Treat validated terminal tool input as the canonical structured payload.
- Return terminal metadata such as tool name, tool call id, mapped status, and validated input; there is no terminal `details` or content contract for the MVP.
- Fail fast if a child-local terminal tool name collides with any existing built-in, extension-registered, or SDK-registered tool in the child runtime.
- Stop the child run immediately after a valid terminal capture without requesting another model turn.
- Treat a terminal tool call with sibling tool calls in the same assistant message as an MVP protocol error, and do not silently execute an ambiguous mixed batch.
- Return deterministic statuses that parent commands can branch on, including completed, blocked, stopped-without-terminal, cancelled, and error/protocol-error-style outcomes.
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
- A subprocess-only `pi --mode json` architecture as the target core design; that pattern is evidence from extension workarounds, not the preferred core implementation.
- Pi core validation of domain-specific workflows such as whether an Objective stack slice committed changes, updated Branch Memory, or recorded Objective progress.
- Injecting the full child transcript into the parent LLM context by default.

## Completion Criteria

The Objective is complete when Pi core provides and documents a working MVP with evidence that:

- `ExtensionCommandContext` exposes `runChildSession(options)` and non-command contexts do not.
- A command can launch a fresh-context child session, await it, and receive a `RunChildSessionResult` that lets parent code continue deterministically.
- Child sessions are created without replacing the active parent session/runtime.
- Child sessions use the same cwd/worktree by default and receive normal Pi cwd-aware context while starting with fresh conversation history.
- Child sessions receive generic boundary instructions for one delegated task.
- Child sessions are persisted under a parent-derived path, and the path is returned to the parent.
- Child-local terminal capture tools are supplied inline with name, status, description, and parameter schema.
- Terminal tool inputs are schema-validated, captured, returned to the parent, and treated as the canonical payload.
- Terminal result metadata includes the terminal tool name, tool call id, mapped status, and validated input, with no `details` contract required for the MVP.
- Terminal tool names that collide with existing tools fail before the child run starts.
- A terminal tool call ends the child run without another model turn.
- A terminal tool call with sibling tool calls returns a clear protocol error and does not silently execute an ambiguous mixed batch.
- A child that stops without a terminal tool returns a non-success stopped/error-style result that the parent can handle.
- Cancellation returns a `cancelled` result and leaves the child session inspectable when possible.
- Parent UI exposes compact child-run progress or an explicitly accepted minimal first version, including child title/state and session path.
- Parent LLM context is not polluted by the full child transcript by default.
- Regression coverage demonstrates that child completion does not rely on injecting slash-command text through `sendUserMessage()`.
- Documentation explains the function-call mental model, command-context-only availability, fresh-context default, child boundary instructions, terminal capture semantics, collision rules, protocol-error rule, and non-goals.

## Assumptions and Risks

Assumptions:

- The immediate platform need is an awaited function-call primitive, not an interactive or background subagent system.
- Prior `pi-subagents` extension work proves the useful mechanics: launch a child run, stream lightweight progress, preserve an inspectable session path, collect a terminal outcome, and return structured data to the parent.
- Core should prefer an in-process child runtime over spawning `pi --mode json`, unless reuse constraints make the subprocess pattern temporarily necessary.
- Fresh child context is sufficient for the first consumers if callers include all necessary task context in the prompt.
- Capture-only terminal tools are enough for structured completion because parent commands can perform side effects after `await runChildSession()`.
- Existing Pi session/runtime machinery can be reused to create a child runtime without replacing the active parent session.
- A parent-derived child session path is practical without disrupting ordinary session listing or resume behavior.
- Inheriting the normal active tool environment is acceptable for the MVP; allowlists and model/tool override machinery can wait.
- Lightweight parent progress such as title, state, current tool, tool count, turn count, elapsed time, session path, and terminal outcome is enough for first inspectability.
- Parent extensions remain responsible for domain-specific validation after a child returns, including Objective stack slice validation.
- The Objective record is the canonical MVP design/spec record; implementation docs can link here until Pi extension docs contain user-facing guidance.
- The remaining work is reviewable as a four-slice stack: Objective/API contract, child runtime/session MVP, terminal capture/protocol semantics, and UI/tests/docs polish.
- A fifth slice should be added only if parent-session progress rendering requires enough TUI plumbing to blur the final polish PR.
- The Objective record lives in `asdl-tools`, while Pi core implementation lives in the Pi monorepo. Review boundaries may need to respect that repository split even when the semantic plan describes one slice.

Risks:

- UI progress may require more TUI plumbing than expected; the exact MVP display level remains an open design point.
- In-process child runtime isolation may uncover shared mutable extension state or stale-context hazards similar to session replacement.
- Terminal tool batch handling may interact with provider/tool-call streaming internals in ways that make pre-execution protocol errors difficult.
- Same-worktree child execution is safe only because MVP is sequential; future parallel use would need separate worktree isolation.
- If child sessions are too hidden in nested paths, recovery and inspection may be harder unless the parent result and UI make the session path obvious.
- If public API/type changes and Objective edits cannot land together because they belong to different repositories, the first implementation slice may need a coordination PR in `asdl-tools` plus a Pi implementation PR.
- If sibling-tool protocol errors require pre-execution batch inspection, terminal capture work may need low-level changes in `packages/agent` as well as `packages/coding-agent`.
- Fresh child context may fail if early callers omit necessary task context from prompts; examples and docs need to show complete kickoff prompts.
- If inherited active tools are too broad for some users, allowlist support may need to move earlier than planned.
- Because the Objective is now the canonical design record, later user-facing docs must avoid reintroducing a second drifting spec; they should extract and link back to the durable contract.

## Open Questions

- What is the minimum acceptable parent UI for MVP closure: a real compact foreground progress block, or a simpler first version that still exposes title, state, and session path?
- Should child session files appear in normal session lists, and if so how should nested child paths be labeled?
- What exact result status taxonomy should distinguish protocol errors, model/provider errors, stopped-without-terminal, and cancellation?
- Should public API type exports land as a small first Pi-monorepo PR before runtime work, or be folded into the child runtime slice?
- Can compact child-run progress stay in the final polish slice, or should UI become a dedicated fifth PR after implementation reveals the TUI surface area?
