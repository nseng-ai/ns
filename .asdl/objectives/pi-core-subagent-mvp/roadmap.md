# Roadmap

## Work

The Objective has pivoted from a Pi core primitive to a local Pi extension/package child-session base layer. The slug remains `pi-core-subagent-mvp` for continuity, but the implementation target is now `ts/packages/pi-extensions` and project Pi package wiring in this repository.

The retired Pi-core plan is superseded: do not add `ctx.runChildSession()` to Pi core, do not export new child-session types from the Pi monorepo, and do not start from an in-process child `AgentSession` unless later evidence shows the extension-layer approach cannot satisfy the MVP.

Implementation is planned as four review slices. Branch names and handoff keys are planning defaults; adjust them to the actual repository/workflow when each slice is implemented.

### PR 1 — Strategy pivot and local API contract

Branch: `pi-core-subagent-mvp/extension-contract`
Parent: current Objective branch.
Tracking: Objective files, local extension/package type surface, and package wiring only.
Handoff: `handoffs/pi-core-subagent-mvp-pr1-extension-contract.md`

Code/spec:

- [x] Reframe the Objective from Pi core `ctx.runChildSession()` to a local extension/package child-session primitive.
- [x] Record `pi-subagents` as the architectural precedent: parent extension, child `pi --mode json`, injected child runtime, JSONL parser, inspectable session/artifact path, structured result.
- [x] Supersede the Pi-monorepo public type export plan and the previous in-process child runtime roadmap.
- [x] Add local public TypeScript types in `ts/packages/pi-extensions/src/run-child-session.ts` or a nearby module: terminal statuses, failure statuses, terminal tool definition, options, terminal capture, and result union.
- [x] Define the local helper contract, `runChildSession(pi, ctx, options)`, without monkey-patching Pi's `ExtensionCommandContext`.
- [ ] Add or update package/plugin wiring so the local extension resources are discoverable through Pi's supported package/extension mechanisms.
- [x] Add a type-only or fake-driven test proving the local type/helper surface is consumable from local extension code.

Objective update:

- [x] Record a Semantic Update for the strategy pivot from Pi core to extension/package layer.
- [x] Mark the old public Pi core type-surface plan as superseded, not complete.
- [x] Mark local type/helper surface complete only after code lands in `ts/packages/pi-extensions`.

Likely files:

- `.asdl/objectives/pi-core-subagent-mvp/objective.md`
- `.asdl/objectives/pi-core-subagent-mvp/roadmap.md`
- `.asdl/objectives/pi-core-subagent-mvp/updates/...`
- `ts/packages/pi-extensions/package.json`
- `ts/packages/pi-extensions/src/run-child-session.ts`
- `ts/packages/pi-extensions/test/run-child-session.test.ts`
- `.pi/settings.json`
- `.pi/extensions/*.ts` if thin shims remain necessary

Validation:

- [x] Run the targeted TypeScript package check or explain any existing workspace setup blocker.
- [x] Run targeted tests for the new local helper/type surface if a test file is added.

### PR 2 — Child process runner and JSON event parser

Branch: `pi-core-subagent-mvp/child-process-runner`
Parent: PR 1.
Tracking: local extension package implementation only.
Handoff: `handoffs/pi-core-subagent-mvp-pr2-child-process-runner.md`

Code:

- [ ] Implement robust Pi command resolution for spawning the current Pi executable or installed `pi` fallback.
- [ ] Launch child runs with `--mode json -p` from the parent cwd.
- [ ] Use the same cwd and worktree by default.
- [ ] Create or discover an inspectable child session path and return `sessionFile?: string` when available.
- [ ] Parse child JSONL events for assistant messages, tool execution starts/ends, tool results, usage, errors, and final stop reasons.
- [ ] Track lightweight progress: state, current tool, tool count, turn count, elapsed time, session path, and final status.
- [ ] Propagate parent abort/cancellation to the child process and report `cancelled` when distinguishable.
- [ ] Return `stopped-without-terminal` when the child stops cleanly without a terminal capture.
- [ ] Return `error` for spawn failures, provider/runtime errors, malformed JSONL that prevents reliable interpretation, and session setup failures.
- [ ] Keep the full child transcript out of parent LLM context by default.
- [ ] Cover parser and process-runner behavior with mocked child stdout/stderr/process exits; do not call real providers.

Objective update:

- [ ] Record a Semantic Update for the subprocess runner, event parser, session path, and cancellation behavior.
- [ ] Mark child runner/parser roadmap items complete when fake-driven tests prove the behavior.

Likely files:

- `ts/packages/pi-extensions/src/run-child-session.ts`
- `ts/packages/pi-extensions/src/run-child-session/child-process.ts`
- `ts/packages/pi-extensions/src/run-child-session/json-events.ts`
- `ts/packages/pi-extensions/test/run-child-session.test.ts`
- `ts/packages/pi-extensions/test/run-child-session-json-events.test.ts`

Validation:

- [ ] Run targeted Bun/TypeScript tests for process-runner and JSON parser behavior.
- [ ] Run the TypeScript package check after code changes, or record the workspace setup blocker if unrelated.

### PR 3 — Injected child terminal-capture runtime

Branch: `pi-core-subagent-mvp/terminal-capture-runtime`
Parent: PR 2.
Tracking: child runtime extension and protocol semantics.
Handoff: `handoffs/pi-core-subagent-mvp-pr3-terminal-capture-runtime.md`

Code:

- [ ] Implement the injected child runtime extension used only inside child sessions.
- [ ] Pass terminal tool definitions and result sink information to the child runtime through a temp config file, generated runtime extension, or explicitly documented equivalent.
- [ ] Register child-local terminal capture tools with name, status, description, and TypeBox parameter schema.
- [ ] Validate terminal tool inputs in the child runtime before accepting a capture.
- [ ] Capture validated params as the canonical terminal payload.
- [ ] Map terminal tool statuses to parent result statuses such as `completed` and `blocked`.
- [ ] Return terminal metadata including name, tool call id, mapped status, and validated input.
- [ ] Avoid a public terminal `details` or result-content contract.
- [ ] Fail early when a terminal tool name collides with a built-in, extension, or SDK tool visible to the child runtime, to the extent public Pi APIs expose this.
- [ ] Request child termination immediately after a valid terminal capture.
- [ ] Detect terminal tool calls mixed with sibling tool calls and report `protocol-error`.
- [ ] Test and document whether sibling side effects can be prevented before detection through public extension APIs; if not, record the limitation and mitigation.
- [ ] Preserve deterministic handling for stopped-without-terminal, provider/model errors, malformed terminal payloads, collision failures, protocol errors, and cancellation.

Objective update:

- [ ] Record a Semantic Update for terminal capture semantics and the final result taxonomy.
- [ ] Resolve or narrow the open question about mixed terminal-plus-sibling enforcement.
- [ ] Mark terminal capture roadmap items complete when tests cover the behavior and limitations.

Likely files:

- `ts/packages/pi-extensions/src/run-child-session.ts`
- `ts/packages/pi-extensions/src/run-child-session/child-runtime.ts`
- `ts/packages/pi-extensions/src/run-child-session/terminal-tools.ts`
- `ts/packages/pi-extensions/test/run-child-session-terminal-tools.test.ts`
- `ts/packages/pi-extensions/test/run-child-session-protocol.test.ts`

Validation:

- [ ] Run targeted terminal-capture and protocol tests.
- [ ] Run the TypeScript package check after code changes, or record the workspace setup blocker if unrelated.

### PR 4 — Parent integration, docs, and first consumer proof

Branch: `pi-core-subagent-mvp/integration-docs`
Parent: PR 3.
Tracking: local extension integration, docs, and first consumer proof.
Handoff: `handoffs/pi-core-subagent-mvp-pr4-integration-docs.md`

Code/docs:

- [ ] Add a minimal local command, diagnostic command, or extension test harness that uses the child-session helper end to end.
- [ ] Decide whether the first real consumer is a small demo command, the stack-run extension skeleton, or an Objective-stack closeout prototype.
- [ ] Expose parent progress through an intentionally minimal UI path: status line, widget, custom message, or tool renderer integration.
- [ ] Ensure parent UI or command output exposes child title/state and `sessionFile` path.
- [ ] Preserve child session inspectability for blocked/error/cancelled outcomes when possible.
- [ ] Add regression coverage that child completion does not rely on `sendUserMessage("/slash-command")` or slash-command handoff text.
- [ ] Document the extension/package-layer function-call mental model, child process architecture, fresh context, terminal capture schemas, collision handling, protocol-error handling, cancellation, session artifacts, and non-goals.
- [ ] Document why Pi core changes were intentionally avoided and what evidence would justify revisiting that decision.
- [ ] Keep any user-facing docs linked to or extracted from this Objective rather than recreating a second drifting design spec.

Objective update:

- [ ] Record a Semantic Update for integration, docs, UI/progress, and first consumer evidence.
- [ ] Mark UI/progress, regression-test, docs, and first-consumer roadmap items complete when evidence lands.
- [ ] Ask before closing the Objective; do not create `closed.md` implicitly.

Likely files:

- `ts/packages/pi-extensions/src/run-child-session.ts`
- `ts/packages/pi-extensions/src/<first-consumer>.ts`
- `ts/packages/pi-extensions/test/...`
- `docs/pi/...` if user-facing docs are needed in this repository
- `.pi/extensions/...` if project shims are part of the integration surface

Validation:

- [ ] Run targeted integration tests for the first consumer.
- [ ] Run the TypeScript package check after code changes, or record the workspace setup blocker if unrelated.

## Parked

- [ ] Upstream Pi core `ctx.runChildSession()` API and Pi-monorepo public type exports.
- [ ] In-process child `AgentSession` implementation in Pi core.
- [ ] Full Objective stack extension rewrite that consumes the local child-session helper.
- [ ] Interactive foreground child sessions that can receive user replies.
- [ ] Parent-context inheritance with filtering of parent-only orchestration artifacts.
- [ ] Parallel/background subagents and isolated worktree management.
- [ ] Durable resume of an in-flight child run after Pi process restart.
- [ ] A general subagent marketplace, named agent registry, management UI, or intercom/supervisor bridge.
