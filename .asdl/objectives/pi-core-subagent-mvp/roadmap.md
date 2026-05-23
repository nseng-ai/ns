# Roadmap

## Work

Implementation is planned as four review slices. Add a fifth slice only if parent-session progress rendering becomes too large for the final UI/tests/docs polish PR. Branch names and handoff keys are planning defaults; adjust them to the actual repository/workflow when the slice is implemented.

### PR 1 — Spec and public API contract

Branch: `pi-core-subagent-mvp/spec-api`
Parent: current Objective scaffold in `asdl-tools` for spec work; `main` in the Pi monorepo if exported Pi types land there.
Tracking: Objective files only, unless Pi API type files change in the same review slice.
Handoff: `handoffs/pi-core-subagent-mvp-pr1-spec-api.md`

Code/spec:

- [ ] Reconcile `docs/pi/core-subagent-mvp-spec.md` with resolved Objective decisions.
- [ ] Make the spec explicit that `runChildSession()` is available only on `ExtensionCommandContext`.
- [ ] Specify child-local terminal capture tools supplied inline with name, status, description, and parameter schema.
- [ ] Specify capture-only terminal semantics: validate and return terminal input; do not execute arbitrary extension tool code.
- [ ] Specify validated terminal input as the canonical structured payload, with no terminal `details` contract.
- [ ] Specify fresh child context only for MVP; parent-context inheritance remains parked.
- [ ] Specify terminal tool plus sibling tool calls as an MVP protocol error.
- [ ] Specify awaited, non-interactive foreground function-call semantics.
- [ ] Add/export public `runChildSession()` types if this slice includes Pi code: terminal tool definition, options, result, and result status taxonomy.

Objective update:

- [ ] Record a Semantic Update for the reconciled spec/API contract.
- [ ] Mark the spec roadmap item complete when the spec actually reflects the resolved decisions.
- [ ] Mark public API types complete only if the exported type surface lands in the same slice.

Likely files:

- `docs/pi/core-subagent-mvp-spec.md`
- `packages/coding-agent/src/core/extensions/types.ts`
- `packages/coding-agent/src/core/extensions/runner.ts`
- `packages/coding-agent/src/core/sdk.ts`
- `packages/coding-agent/src/core/index.ts`
- `packages/coding-agent/src/index.ts`

Validation:

- [ ] For spec-only work, run the repository's Markdown/doc validation or formatter check.
- [ ] For Pi type/API work, run `npm run check` from the Pi monorepo root.
- [ ] Add or run a targeted type/API test if behavior is introduced with the type surface.

### PR 2 — Fresh child runtime/session MVP

Branch: `pi-core-subagent-mvp/child-runtime`
Parent: PR 1.
Tracking: none outside Objective files unless implementation tracking notes are explicitly introduced.
Handoff: `handoffs/pi-core-subagent-mvp-pr2-child-runtime.md`

Code:

- [ ] Implement a non-replacing child-session runner in Pi core.
- [ ] Create a child `AgentSession` without replacing the parent runtime/session.
- [ ] Use the same cwd and worktree as the parent command.
- [ ] Start with fresh child conversation history.
- [ ] Persist the child session under a parent-derived session path.
- [ ] Return the child `sessionFile` to the parent command.
- [ ] Await child completion from the parent command.
- [ ] Ensure child prompting does not depend on slash-command expansion or queued slash text.
- [ ] Inject generic child boundary instructions for one delegated task.
- [ ] Return initial non-terminal statuses such as `stopped`, `error`, and `cancelled` even before terminal capture is complete.

Objective update:

- [ ] Record a Semantic Update for child runtime/session behavior and persistence shape.
- [ ] Mark the runtime/session roadmap item complete when parent replacement is avoided and `sessionFile` is returned.

Likely files:

- `packages/coding-agent/src/core/agent-session-runtime.ts`
- `packages/coding-agent/src/core/agent-session.ts`
- `packages/coding-agent/src/core/child-session.ts`
- `packages/coding-agent/src/core/sdk.ts`
- `packages/coding-agent/test/suite/run-child-session.test.ts`

Validation:

- [ ] Run the targeted child-session test file from `packages/coding-agent` after creating or modifying it.
- [ ] Run `npm run check` from the Pi monorepo root after code changes.

### PR 3 — Terminal capture and deterministic protocol semantics

Branch: `pi-core-subagent-mvp/terminal-capture`
Parent: PR 2.
Tracking: none outside Objective files unless implementation tracking notes are explicitly introduced.
Handoff: `handoffs/pi-core-subagent-mvp-pr3-terminal-capture.md`

Code:

- [ ] Implement child-local terminal capture tools from `runChildSession({ terminalTools })`.
- [ ] Validate terminal tool input against the supplied schema before capture.
- [ ] Capture validated params as the canonical terminal payload.
- [ ] Map terminal tool status to parent result statuses such as `completed` and `blocked`.
- [ ] Return terminal tool metadata including name, tool call id, and validated input.
- [ ] Fail before the child run starts when a child-local terminal tool name collides with any built-in, extension, or SDK tool available to the child runtime.
- [ ] Stop the child run immediately after terminal capture without requesting another model turn.
- [ ] Return a clear protocol error when an assistant message contains a terminal tool call plus sibling tool calls.
- [ ] Ensure sibling tool calls in a terminal mixed batch are not silently executed.
- [ ] Preserve deterministic handling for stopped-without-terminal, provider/model errors, and cancellation.

Objective update:

- [ ] Record a Semantic Update for terminal capture semantics and the final result taxonomy.
- [ ] Mark terminal capture and deterministic error-semantics roadmap items complete when tests cover the behavior.

Likely files:

- `packages/agent/src/types.ts`
- `packages/agent/src/agent-loop.ts`
- `packages/agent/src/agent.ts`
- `packages/coding-agent/src/core/child-session.ts`
- `packages/coding-agent/src/core/extensions/types.ts`
- `packages/agent/test/agent-loop.test.ts`
- `packages/coding-agent/test/suite/run-child-session.test.ts`

Validation:

- [ ] Run the targeted `packages/agent` test file if low-level batch hooks or protocol behavior change.
- [ ] Run the targeted `packages/coding-agent` child-session test file.
- [ ] Run `npm run check` from the Pi monorepo root after code changes.

### PR 4 — Parent UI, regression coverage, and extension docs

Branch: `pi-core-subagent-mvp/ui-docs-tests`
Parent: PR 3.
Tracking: none outside Objective files unless implementation tracking notes are explicitly introduced.
Handoff: `handoffs/pi-core-subagent-mvp-pr4-ui-docs-tests.md`

Code/UI/docs:

- [ ] Add compact parent-session progress rendering or explicitly settle the accepted minimal MVP UI.
- [ ] Ensure parent UI exposes child title, state, and `sessionFile` path.
- [ ] Include useful foreground progress such as current tool, tool count, turn count, and terminal outcome when feasible.
- [ ] Keep the full child transcript out of the parent LLM context by default.
- [ ] Preserve child session inspectability for blocked/error/cancelled outcomes when possible.
- [ ] Add regression coverage that child completion does not rely on `sendUserMessage("/slash-command")` or slash-command handoff text.
- [ ] Add end-to-end extension-command coverage using faux provider behavior and terminal capture.
- [ ] Update Pi extension docs with function-call mental model, command-context-only availability, fresh context, child-local terminal capture schemas, collision rules, protocol-error rule, and parked non-goals.
- [ ] Add or update an example command that uses `ctx.runChildSession()`.

Objective update:

- [ ] Record a Semantic Update for UI/docs/regression evidence.
- [ ] Mark UI, regression-test, and docs roadmap items complete when evidence lands.
- [ ] Resolve or narrow open Objective questions about UI shape, session listing, and result taxonomy.
- [ ] Ask before closing the Objective; do not create `closed.md` implicitly.

Likely files:

- `packages/coding-agent/src/modes/interactive/interactive-mode.ts`
- `packages/coding-agent/src/modes/interactive/components/child-session-progress.ts`
- `packages/coding-agent/docs/extensions.md`
- `packages/coding-agent/docs/sdk.md`
- `packages/coding-agent/examples/extensions/...`
- `packages/coding-agent/test/suite/regressions/...`
- `packages/coding-agent/test/suite/run-child-session.test.ts`

Validation:

- [ ] Run targeted UI/component tests if a new component is introduced.
- [ ] Run targeted child-session/regression tests.
- [ ] Run `npm run check` from the Pi monorepo root after code changes.

### Contingency PR 5 — Dedicated parent UI slice

Branch: `pi-core-subagent-mvp/child-progress-ui`
Parent: PR 3 or PR 4, depending on when the split is discovered.
Tracking: none outside Objective files unless implementation tracking notes are explicitly introduced.
Handoff: `handoffs/pi-core-subagent-mvp-pr5-child-progress-ui.md`

Use this only if PR 4 becomes too broad:

- [ ] Move compact child-run progress rendering and interactive cancellation polish into this dedicated slice.
- [ ] Keep PR 4 focused on docs, examples, regression coverage, and Objective closeout readiness.
- [ ] Record a Semantic Update explaining why the stack expanded from four to five PRs.

## Parked

- [ ] Objective stack extension rewrite that consumes `ctx.runChildSession()`.
- [ ] Interactive foreground child sessions that can receive user replies.
- [ ] Parent-context inheritance with filtering of parent-only orchestration artifacts.
- [ ] Parallel/background subagents and isolated worktree management.
- [ ] Durable resume of an in-flight child run after Pi process restart.
