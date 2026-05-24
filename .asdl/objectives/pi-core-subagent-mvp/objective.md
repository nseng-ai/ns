# Pi Extension Child Session MVP

## Thesis

Pi still needs an awaited child-session primitive for extension-driven workflows, but the MVP should be implemented in this repository's Pi package/extension layer rather than in Pi core.

The motivating failure remains the Objective stack implementation workflow: completion currently depends on extension-injected slash text such as `/stack-impl-closeout ...`. `sendUserMessage()` intentionally bypasses slash-command expansion, so slash text is a fragile control handoff. The desired abstraction is still function-call shaped: parent extension code launches a focused child Pi run, waits for a structured terminal outcome, and then continues deterministically in parent code.

The strategy has changed. Local inspection of `pi-subagents` shows the viable base layer is a Pi package that registers parent-facing extension tools/commands, spawns child `pi --mode json -p` processes, injects child runtime extensions, parses JSONL session events, preserves child session artifacts, and returns structured results. That is the architecture to copy in small form.

This Objective therefore tracks a local extension/package child-session base layer for `asdl-tools`. It is not an upstream Pi core API project. The old `ctx.runChildSession()` plan and Pi-monorepo public type export surface are superseded unless later evidence proves a Pi core hook is required.

## Scope

This Objective covers a local child-session primitive implemented through Pi's extension and package systems:

- Implement a reusable TypeScript helper, `runChildSession(pi, ctx, options)`, in `ts/packages/pi-extensions/` for use by local Pi extensions.
- Treat the helper as a repo-local TypeScript helper surface, not as a method added to `ExtensionCommandContext`.
- Do not add stable npm-style package exports or subpaths for `runChildSession` until a first real repo-local parent-facing extension consumer demonstrates the need; source-local imports are acceptable during the contract and runner slices.
- Wire actual parent-facing extension resources, when they exist, through `ts/packages/pi-extensions/package.json`, project `.pi/settings.json`, and/or thin `.pi/extensions/*` shims so the extension resources load through normal Pi mechanisms.
- Launch child sessions by spawning a separate `pi` process in JSON event stream mode with `--mode json -p`.
- Use the same cwd and worktree by default, with sequential execution assumptions.
- Start with fresh child conversation history while still letting Pi build normal cwd-aware context such as project instructions, date, skills when enabled, and working directory.
- Inject one or more child runtime extensions with `--extension` to enforce child-session behavior instead of modifying Pi core.
- Ensure the parent orchestration extension does not recursively register the same parent-facing tool inside ordinary children; use child environment flags and/or `--no-extensions` plus explicit runtime extensions where needed.
- Persist or discover an inspectable child session file when possible, and return `sessionFile?: string` to the parent.
- Keep the full child transcript out of the parent LLM context by default; parent code receives the structured result and decides what to append, summarize, or ignore.
- Provide lightweight parent progress from parsed JSON events when feasible: child title, state, current tool, tool count, turn count, elapsed time, session path, and terminal outcome.
- Support child-local terminal capture tools supplied as options with name, status, description, and TypeBox parameter schema.
- Register terminal tools only inside the injected child runtime. Their execution is capture-only: validate input, record the terminal capture, request termination, and perform no domain side effects.
- Treat validated terminal input as the canonical structured payload.
- Return terminal metadata such as tool name, tool call id, mapped status, and validated input; there is no public terminal `details` contract for the MVP.
- Use the MVP result taxonomy: `completed`, `blocked`, `stopped-without-terminal`, `cancelled`, `error`, and `protocol-error`.
- Fail before or at child startup when a terminal capture tool name collides with an existing child tool, to the extent exposed by Pi's extension API.
- Detect terminal tool calls mixed with sibling tool calls and report `protocol-error` rather than treating the run as success. Preventing sibling execution before side effects is a best-effort goal under the public extension API, not an assumed core guarantee.
- Include unit/integration coverage using mocked child process JSONL and no real provider API calls.
- Document the local helper's function-call mental model, child process architecture, terminal capture semantics, collision rules, protocol-error handling, and limitations.

## Non-Goals

This Objective does not include:

- Adding `ctx.runChildSession()` to Pi core.
- Exporting new public child-session types from the Pi monorepo.
- Creating an in-process child `AgentSession` or modifying Pi runtime/session internals.
- Rewriting `pi-subagents`, adopting its full agent registry, chains, parallel fanout, async/background jobs, intercom bridge, worktree management, or management UI.
- Rewriting the Objective stack extension to consume the new helper; that remains parked unless explicitly pulled into a later Objective or PR.
- Independent worktree management for children.
- Durable resume of an in-flight child run after Pi process restart.
- Interactive child sessions that receive user replies while running.
- Parent-context inheritance or filtering of parent-only orchestration artifacts beyond child boundary instructions and fresh-context defaults.
- Model/tool override machinery beyond what is needed to launch a normal child Pi process with injected terminal capture tools.
- Slash-command bridges or queued slash-command continuation APIs as the completion mechanism.
- Pi core validation of domain-specific workflows such as whether an Objective stack slice committed changes, updated Branch Memory, or recorded Objective progress.
- Injecting the full child transcript into the parent LLM context by default.

## Completion Criteria

The Objective is complete when this repository provides and documents a working extension-layer MVP with evidence that:

- `ts/packages/pi-extensions` exposes local public types for terminal tool definitions, child-session options, terminal capture metadata, result status taxonomy, and results.
- Local extension code can call a helper such as `runChildSession(pi, ctx, options)` without depending on Pi core changes.
- The local Pi package/plugin manifest or project shims load the parent-facing extension resources through Pi's supported extension/package system.
- A parent extension command/tool can launch a fresh-context child Pi process, await it, and receive a deterministic result.
- Child launch uses `pi --mode json -p` or the equivalent current Pi executable invocation, with robust command resolution for the running environment.
- Child sessions use the same cwd/worktree by default and receive normal Pi cwd-aware context while starting with fresh conversation history.
- The child runtime extension is injected explicitly and can register only the terminal capture tools requested for that child run.
- Child terminal capture tools validate inputs against supplied schemas, capture validated params, and map to `completed` or `blocked` parent statuses.
- Terminal result metadata includes tool name, tool call id, mapped status, and validated input, with no public `details` contract.
- A child that stops without a terminal tool returns `stopped-without-terminal` or a clearly non-success equivalent.
- Runtime/provider/spawn/session creation failures return `error` with useful diagnostics.
- Parent cancellation or abort returns `cancelled` when distinguishable and cleans up the child process best-effort.
- Mixed terminal-plus-sibling tool call batches are surfaced as `protocol-error`; if public Pi APIs cannot prevent sibling side effects before detection, that limitation is tested or documented before closure.
- Child `sessionFile` is returned when available, and blocked/error/cancelled outcomes remain inspectable when possible.
- Parent progress is available at least as parsed state suitable for a status line or widget; an intentionally minimal UI is acceptable if it exposes child title/state and session path.
- Parent LLM context is not polluted by the full child transcript by default.
- Regression coverage demonstrates that child completion does not rely on injecting slash-command text through `sendUserMessage()`.
- Tests do not call real model providers, use paid tokens, or require live Pi network/provider state.
- Documentation explains why this is an extension/package-layer primitive, not a Pi core API.

## Assumptions and Risks

Assumptions:

- The immediate platform need is an awaited function-call primitive for local extension workflows, not an interactive or background subagent system.
- `pi-subagents` proves the extension/package pattern: parent extension registration, child `pi --mode json` process, injected runtime extension, JSONL event parsing, inspectable artifacts, and structured parent result.
- A subprocess child runner is acceptable for the MVP and avoids upstream Pi core coupling; PR 2 fake-driven tests de-risked command resolution, cwd/session-file setup, JSONL progress parsing, cancellation, stderr-bounded errors, and clean no-terminal stops without real provider calls.
- PR 1 evidence supports that a local TypeScript helper surface is enough for repo-local consumers to import and narrow the contract without Pi core changes; PR 2 evidence replaces the not-implemented placeholder with an awaited child process runner, while terminal capture, injected child runtime behavior, and first-consumer wiring still need later slices.
- Stable npm-style package exports and subpaths are not valuable before a real repo-local parent-facing consumer exists; export or shim wiring belongs with that consumer rather than with the placeholder contract.
- Fresh child context is sufficient when callers include all task context in the prompt.
- Capture-only terminal tools are enough for structured completion because parent code performs domain side effects after the child returns.
- Same-worktree child execution is safe for this MVP because child sessions are awaited sequentially.
- Child environment flags can prevent local parent-facing orchestration tools from recursively registering in ordinary child runs.
- A temp-file or environment-mediated child runtime configuration can pass terminal tool definitions and result sink paths safely enough for local use.
- Lightweight progress parsed from JSON events is enough for first inspectability; PR 2 proves title/state/current tool/tool count/turn count/elapsed/session path/stop-reason progress without returning the full transcript.
- Parent extensions remain responsible for domain-specific validation after a child returns, including Objective stack slice validation.
- The Objective slug remains `pi-core-subagent-mvp` for continuity even though the title and strategy now refer to the extension-layer MVP.

Risks:

- Public Pi extension APIs may not allow a mixed terminal-plus-sibling tool batch to be blocked before sibling tool side effects occur; exact no-side-effect protocol enforcement may require a future Pi core hook or a documented limitation.
- Child process command resolution may still differ across installed Pi versions, local source runs, Bun/Node wrappers, and package-installed extensions. PR 2 narrows this with safe current-script reuse and installed-`pi` fallback tests, but live environment coverage remains useful.
- Child extension loading can accidentally include parent orchestration extensions unless child flags and launch arguments are carefully controlled.
- JSON event shapes can drift across Pi versions; PR 2 narrows parser assumptions to session, agent, turn, message, and tool execution events with malformed-line failure handling, but version drift remains a compatibility risk.
- Session file discovery can be unreliable if Pi changes `--session` behavior or session header/event fields. PR 2 mitigates this by creating an explicit parent-side session path and allowing parser header events to update the returned path.
- TypeBox schema validation inside the child runtime must avoid relying on unavailable bundled dependencies when loaded as a Pi package.
- Subprocess cleanup on abort, provider failure, or terminal capture may leave partial sessions or temp files; PR 2 tests abort-triggered child termination and bounded diagnostics, while durable cleanup policy remains best-effort.
- Fresh child context may fail if early callers omit necessary task context from prompts; examples and docs need to show complete kickoff prompts.
- If inherited active tools are too broad for some users, allowlist support may need to move earlier than planned.
- If the extension-layer abstraction later proves insufficient, the Objective may need a narrow upstream Pi hook, but that should be evidence-driven rather than the default plan.

## Open Questions

- The helper remains the direct `runChildSession(pi, ctx, options)` function through PR 2; should a factory or wrapper be added when a real consumer needs more ergonomics?
- Should child processes default to `--no-extensions` plus explicit runtime extensions, or load normal extensions with child environment flags that make parent orchestration extensions no-op?
- What is the most robust way to pass terminal tool schemas and result sinks to the child runtime: temp config file, environment variables, or generated runtime extension file?
- Should the explicit parent-created child session path remain the long-term default, or should a later consumer prefer discovery-only behavior?
- How much parent UI is needed for the MVP: status line only, chat custom message, widget, or tool renderer integration?
- Can terminal tool collisions be checked completely through public Pi extension APIs before registration, or only detected in the child runtime?
- Is mixed terminal-plus-sibling protocol enforcement acceptable as detect-and-report in the extension-layer MVP, or does it require an upstream Pi hook before Objective closure?
- Which first local consumer should prove the base layer: a small diagnostic/demo command, the stack-run extension skeleton, or a minimal Objective-stack closeout prototype?
