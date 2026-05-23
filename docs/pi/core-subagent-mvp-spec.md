# Core Subagent MVP Spec

## Purpose

This document proposes a minimal first-class Pi subagent primitive that is just strong enough to rebuild the Objective stack implementation workflow from scratch.

The goal is **not** to clone `pi-subagents` as a full product. The goal is to move one fragile pattern into Pi core:

> Run an isolated child Pi session, stream its progress into the parent UI, stop on a structured terminal tool, and return that terminal result to the parent extension.

## Motivation

The current Objective stack implementation extension is slice-by-slice:

1. Plan an Objective as a Graphite PR stack.
2. Start a fresh session for the next incomplete PR slice.
3. The agent implements that slice.
4. The agent calls `stack_impl_slice_done` or `stack_impl_slice_blocked`.
5. The extension stores handoffs/status and starts the next slice.

The intended control handoff is currently implemented indirectly:

```ts
pi.sendUserMessage(`/stack-impl-closeout ${toolCallId}`, { deliverAs: "followUp" });
```

That path is broken because `sendUserMessage()` calls `prompt(..., { expandPromptTemplates: false })`. Pi therefore treats `/stack-impl-closeout ...` as a literal user message, not as an extension command. Tests missed this because they invoked the command handler directly or only asserted that slash text was queued.

A tactical fix would be a queued extension-command API. A better long-term primitive is a child-session API that lets the parent extension await the child result directly, avoiding slash-command continuation entirely.

## What we learned from `pi-subagents`

`/Users/schrockn/code/githubs/nicobailon/pi-subagents` has many features we do not need, but its core mechanics are useful evidence.

At its center, `pi-subagents` does this:

```text
parent Pi extension/tool
  -> spawn `pi --mode json -p <task>`
  -> parse child JSON events
  -> stream progress into the parent tool UI
  -> collect child session path and final assistant output
  -> return a structured result
```

Useful lessons:

- **Do not rely on slash-command continuation.** The child run is awaited directly and returns data to the parent.
- **Persist child sessions.** Child session files are derived from the parent session, making each delegated run inspectable later.
- **Progress can be lightweight.** The useful UI is mostly current tool, tool count, turn count, elapsed time, and recent output.
- **Child boundary instructions matter.** Children should know they are doing one assigned job, not orchestrating the parent workflow.
- **Forked parent context is risky.** If child sessions inherit parent history, parent-only orchestration messages and old subagent tool calls must be filtered. The MVP should default to fresh child context.
- **Pi extension commands lack `onUpdate`.** `pi-subagents` uses event-bus bridges and custom messages to work around this. A core primitive should expose progress UI directly.
- **Subprocess spawning is an extension workaround, not the ideal core design.** Core can run child sessions in-process and avoid CLI spawning, JSON parsing, Windows CLI resolution, and post-exit stdio cleanup.

Features intentionally not copied into the MVP:

- background async jobs
- parallel fanout
- isolated worktrees
- intercom/supervisor chat
- saved agent registry
- chains
- model fallback
- artifact directory management
- nested run trees
- slash-command bridges

## MVP concept

A subagent is a **foreground child session** launched by a parent extension command.

It has:

- the same cwd/worktree by default
- a fresh conversation context by default
- a persisted child session file
- normal Pi tools and extension tools
- live progress rendered in the parent UI
- one or more terminal tools that end the child run and return structured data

It does not have, in the MVP:

- parallel execution
- background execution
- independent worktree management
- durable resume after Pi process restart
- model/tool override machinery beyond inherited defaults
- a general user-facing agent marketplace or registry

## Proposed API

Add a method to `ExtensionCommandContext`:

```ts
interface ChildSessionTerminalTool {
  name: string;
  status: "completed" | "blocked";
}

interface RunChildSessionOptions {
  title?: string;
  prompt: string;
  terminalTools: ChildSessionTerminalTool[];
}

interface ChildSessionTerminalResult {
  name: string;
  toolCallId: string;
  input: Record<string, unknown>;
  content: Array<TextContent | ImageContent>;
  details: unknown;
  isError: boolean;
}

interface RunChildSessionResult {
  status: "completed" | "blocked" | "stopped" | "cancelled" | "error";
  sessionFile?: string;
  finalAssistantText?: string;
  terminalTool?: ChildSessionTerminalResult;
  error?: string;
}

interface ExtensionCommandContext {
  runChildSession(options: RunChildSessionOptions): Promise<RunChildSessionResult>;
}
```

Example for Objective stack:

```ts
const result = await ctx.runChildSession({
  title: `PR 2/3: ${slice.branch}`,
  prompt: slice.kickoffPrompt,
  terminalTools: [
    { name: "stack_impl_slice_done", status: "completed" },
    { name: "stack_impl_slice_blocked", status: "blocked" },
  ],
});

if (result.status === "completed") {
  await closeoutStackSlice(result.terminalTool?.details, deps);
}
```

The parent extension regains control after the child stops. It can then store handoffs, update status, start the next child session, or stop on blocked/error.

## Terminal tool semantics

Terminal tools are the structured completion channel from child to parent.

When a child calls a configured terminal tool:

1. Pi executes the tool normally.
2. Pi captures the tool call id, input, result content, result details, and error state.
3. Pi stops the child run after the current tool result is recorded.
4. Pi resolves `runChildSession()` with the mapped status.

This should be a core child-run policy, not just the existing `AgentToolResult.terminate` hint. Current low-level terminate semantics only stop when every tool result in a batch has `terminate: true`; terminal subagent completion needs stronger behavior. The child runner should treat a configured terminal tool as sufficient to end the child run.

If the child finishes without a terminal tool, return:

```ts
{ status: "stopped", finalAssistantText, sessionFile }
```

The parent extension decides whether that is recoverable.

## UI behavior

The MVP should render a compact foreground child-run block in the parent session, not switch the active session wholesale.

Minimum useful display:

```text
Objective stack child: PR 2/3 stack-impl-e2e-smoke-test/extend-fixture
State: running
Current tool: bash
Tools: 7
Turns: 3
Session: ~/.pi/agent/sessions/<parent>/<run-id>/session.jsonl
```

On completion, collapse to:

```text
✓ Completed PR 2/3 stack-impl-e2e-smoke-test/extend-fixture
Session: .../session.jsonl
Terminal tool: stack_impl_slice_done
```

On blocked/error/cancelled, render that status visibly and keep the child session path available.

The parent LLM context should not receive the full child transcript by default. The parent extension receives the structured result and may choose what summary or custom message to append.

## Session model

MVP defaults:

- Child uses the same `cwd` as the parent command.
- Child uses the same worktree.
- Child starts with fresh conversation history.
- Child still receives normal Pi system prompt construction for the cwd: project instructions, active tools, skills, date, and working directory.
- Child session file is persisted under a path derived from the parent session file when available.

Suggested session path shape:

```text
<parent-session-dir>/<parent-session-basename>/<child-run-id>/session.jsonl
```

If the parent session is ephemeral, Pi may use a temp child-session directory and still return `sessionFile` when created.

## Child boundary instructions

Pi core should inject a small child boundary into child sessions. For the Objective stack workflow, the extension prompt can add domain-specific instructions, but core should provide generic safety text like:

```text
You are a child session launched for one delegated task.
Complete only the assigned task.
Do not orchestrate follow-up child sessions unless explicitly instructed.
If you need to edit files, use the actual edit/write/bash tools; do not print pseudo tool calls or patches as final text.
When your task is complete or blocked, use one of the provided terminal tools.
```

The Objective stack prompt would then add:

```text
You are implementing exactly one planned PR slice.
Do not start another Objective stack slice yourself.
Finish by calling stack_impl_slice_done or stack_impl_slice_blocked.
```

## How Objective stack should use this

A rebuilt Objective stack extension can become a straightforward parent orchestrator:

```ts
for (;;) {
  const slice = await findNextIncompleteSlice(plan);
  if (!slice) break;

  await prepareBranchAndLedger(slice);

  const result = await ctx.runChildSession({
    title: `${plan.objective}: ${slice.branch}`,
    prompt: slice.kickoffPrompt,
    terminalTools: [
      { name: "stack_impl_slice_done", status: "completed" },
      { name: "stack_impl_slice_blocked", status: "blocked" },
    ],
  });

  if (result.status === "completed") {
    await closeoutStackSlice(result.terminalTool!.details, deps);
    continue;
  }

  await recordStoppedOrBlockedStatus(result);
  break;
}
```

This removes:

- pending closeout maps keyed by tool call id
- `/stack-impl-closeout` as an internal command
- `pi.sendUserMessage("/stack-impl-closeout ...")`
- dependency on slash-command dispatch through user-message injection
- manual recovery when a slash command is treated as plain chat

## Implementation notes

Preferred core implementation is in-process:

1. Create a child `SessionManager` and session file.
2. Create a child `AgentSession`/runtime using the same cwd, settings, model registry, tools, and resource loader semantics as the parent.
3. Bind a child extension runtime independently from the parent runtime.
4. Add child-run hooks for terminal tool detection and progress capture.
5. Render child progress in the parent UI through core UI primitives.
6. Resolve the parent command's `runChildSession()` promise when the child reaches a terminal state.

Avoid using `pi --mode json` internally unless core reuse makes in-process execution impractical. The subprocess pattern is proven by `pi-subagents`, but it exists mostly because extensions cannot create true child sessions themselves.

## Risks and assumptions

### Same-worktree assumption

MVP assumes sequential execution in the same worktree. Parallel child sessions in the same worktree are unsafe and should not be supported by this primitive initially.

### No durable mid-run resume

If Pi exits while a child is running, the MVP may lose the supervising promise. The child session file and git/Branch Memory state should be enough for human recovery. Durable job resume can come later.

### Terminal tool robustness

The child may stop without calling a terminal tool, or may call one too early. The parent extension must treat `stopped` and `blocked` as first-class outcomes and avoid auto-advancing.

### Multiple tool calls in one assistant message

Existing agent termination hints are batch-based. The child runner must define clear semantics when a terminal tool appears alongside sibling tool calls. The safest MVP policy is: terminal tool detection ends the child after the current tool batch is recorded, and no further model turn is requested.

### Extension runtime isolation

Parent and child extension instances must not share mutable session-bound state accidentally. The parent command is awaiting the child, but the child loads its own extension runtime. Stale-context protections similar to session replacement still matter.

### Context inheritance

Fresh child context is the MVP default. Forked context is attractive later, but it requires filtering parent-only orchestration artifacts from child context. `pi-subagents` has substantial code just to do this safely.

### User cancellation

Esc/cancel should abort the active child run and return `{ status: "cancelled" }`. The parent extension must decide whether to leave branch state as-is, write a partial status artifact, or simply notify.

### Validation is still domain-specific

Pi core should not know whether a stack slice committed changes, updated an Objective, or wrote Branch Memory handoffs. The Objective stack extension must validate those domain requirements before accepting a terminal `completed` result.

## Open questions

- Should `runChildSession()` be available only on `ExtensionCommandContext`, or also from tools/events?
  - MVP recommendation: command context only.
- Should terminal tools be existing registered tools or child-local tools declared in `runChildSession()`?
  - MVP recommendation: existing registered tools by name.
- Should child sessions inherit active tool selection exactly, or should the caller pass an allowlist?
  - MVP recommendation: inherit active tools; add allowlist later.
- Should the child session be visible as a normal switchable Pi session while running?
  - MVP recommendation: return and display the session path; richer navigation can come later.
- Should terminal tool `details` or `input` be the canonical structured payload?
  - MVP recommendation: return both. Objective stack should treat the tool input/details schema as its contract and avoid scraping text.

## Conclusion

The minimal core feature is not a full subagent platform. It is:

> foreground child session + live progress + terminal tool result + parent continuation.

That primitive directly addresses the Objective stack failure mode and provides a clean foundation for rebuilding the Objective stack extension without slash-command handoff hacks.
