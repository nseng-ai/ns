# Objective Stack Runner-Subagent Rewrite Brief

> **Staleness note:** This is a historical design brief. It still captures useful Objective-stack product constraints, but its old **child-session** API names are superseded by the repo-local **runner subagent** helper. For current helper vocabulary and statuses, read [Runner Subagent Helper](./runner-subagent-helper.md) first.

## Why this document exists

This brief captures the Objective stack implementation workflow, the failure mode that prompted a redesign, and the intended rewrite on top of the repo-local Pi extension runner-subagent helper.

It is written for a fresh agent so they do **not** need to rediscover:

- what the Objective stack command is supposed to do;
- what arguments and artifacts it owns;
- how the old implementation worked;
- what broke in the old tool/command handoff path;
- how the same feature should work over awaited runner subagents;
- what risks and design decisions remain open.

Read this together with the archived [Pi Core Subagent MVP Objective](../../.asdl/objective-archive/pi-core-subagent-mvp/objective.md) and the current [Runner Subagent Helper](./runner-subagent-helper.md). The original Pi-core `ctx.runChildSession()` / repo-local `runChildSession(...)` design is superseded for this repository: use `dispatchRunnerSubagent(pi, ctx, options)` from `ts/packages/pi-extensions/src/runner-subagent.ts`, not a Pi core API.

## Current runner-subagent implementation facts

The base runner-subagent abstraction now exists in this repository. These facts should guide the Objective stack rewrite:

- The helper is `dispatchRunnerSubagent(pi, { cwd, signal }, options)` from `ts/packages/pi-extensions/src/runner-subagent.ts`.
- Runner subagents are subprocesses shaped like `pi --mode json -p --no-extensions --extension <generated-runtime> --session <file> <prompt>`.
- Runner subagents start with fresh conversation history in the same cwd/worktree by default.
- Ordinary project extensions are not loaded in the subagent; only the generated terminal-capture runtime is injected for terminal mode.
- Terminal tools are capture-only. They validate and record input, request termination, and do not perform domain side effects.
- Completed/blocked payloads are returned at `result.terminal.input`; final-text mode returns `result.finalText`.
- Result statuses are `completed`, `blocked`, `final-text`, `stopped-without-terminal`, `stopped-without-useful-text`, `cancelled`, `error`, and `protocol-error`.
- The helper is non-interactive: it cannot receive additional user replies while the subagent is running.
- There are no stable package exports or subpaths yet; current consumers use source-local imports plus thin `.pi/extensions/*` shims.
- Mixed terminal-plus-sibling tool batches return `protocol-error`; an earlier sibling side effect may already have occurred before the parent can observe the violation.

## Glossary

- **Objective**: checked-in ASDL Objective under `.asdl/objectives/<slug>/`.
- **Objective slug**: directory/key name for the Objective. It must be a single safe path segment; no `/`, `..`, or surrounding whitespace.
- **Plan branch**: the git branch from which `/objective-stack-impl` is invoked. Canonical stack plans are stored on this branch in Branch Memory.
- **Stack plan**: Markdown document with frontmatter schema `asdl.stack-plan.v1`, Objective slug, and ordered planned branch names.
- **Slice**: one planned PR branch in the stack.
- **Slice branch**: a git/Graphite branch for one slice.
- **Slice ledger**: branch-local Branch Memory pointer from a slice branch back to the canonical stack plan and plan hash.
- **Completion handoff**: Branch Memory artifact whose existence marks a slice complete.
- **Terminal tool**: runner-subagent tool that ends the subagent run and returns structured data to the parent orchestrator.

## Broad product goal

The Objective stack feature should let a user say, effectively:

```text
Implement this Objective as a Graphite PR stack.
```

Pi should then supervise the whole stack, one PR slice at a time:

1. choose or plan the stack;
2. create/check out each branch in order;
3. launch a fresh focused runner subagent for that branch;
4. let the subagent implement, validate, update the Objective, commit/amend, and produce a handoff;
5. store the handoff and move to the next branch;
6. stop cleanly when complete, blocked, cancelled, or unsafe to continue.

The extension should own the mechanical control plane. The subagent owns actual implementation work.

## Non-goals

The Objective stack feature should **not**:

- submit Graphite PRs automatically;
- run multiple PR implementation agents concurrently in the same worktree;
- silently repair branch/Graphite/plan drift;
- trust final assistant prose as completion;
- rely on slash-command text injected as a user message;
- make Branch Memory lifecycle state implicit or uninspectable.

## Current command surface

The old prototype extension was `.pi/extensions/asdl-stack-impl`. In this worktree that code is not a tracked current implementation; the rewrite should live in the engineered `ts/packages/pi-extensions` layer with a thin `.pi/extensions/*` shim, following the runner-subagent demo pattern.

### Primary Objective command

```text
/objective-stack-impl [--replan] [objective-slug]
```

Parameters:

- `objective-slug`:
  - optional in interactive UI mode;
  - required in non-UI mode;
  - when omitted in UI, the command lists open Objective directories under `.asdl/objectives/*/` and prompts the user to select one;
  - closed Objectives are directories containing `closed.md` and are excluded;
  - the selected Objective must have `objective.md` and `roadmap.md`.
- `--replan`:
  - always starts a new planning flow even if a canonical Branch Memory plan already exists;
  - replacement must be explicit and controlled;
  - replacement is total, not incremental.

Important semantics:

- The current git branch at invocation time becomes the **plan branch**.
- The canonical plan key is `stack-plans/<objective-slug>.md` on the plan branch.
- If the plan exists and `--replan` is not set, the command loads and validates it, then starts the first incomplete slice.
- If the plan does not exist, or `--replan` is set, the command starts planning before implementation.

### Generic stack command

```text
/stack-impl [--replace] <local-plan-file-or-branch-memory-key>
```

Parameters:

- `<local-plan-file-or-branch-memory-key>`:
  - if it resolves to a local file, the file is parsed as a stack plan and stored/reused/replaced in Branch Memory;
  - otherwise it is treated as an existing Branch Memory key in namespace `stack-plans` on the current branch.
- `--replace`:
  - permits overwriting a differing existing Branch Memory plan from a local file;
  - without `--replace`, differing content requires UI confirmation or fails closed.

This command is useful as a lower-level generic plan loader. The Objective-specific rewrite should primarily target `/objective-stack-impl`.

### Status command

```text
/stack-impl-status [local-plan-file-or-branch-memory-key]
```

Current behavior:

- with an explicit plan, report status for that plan;
- with no argument, infer the plan from the current branch's `stack-impls` ledger when possible;
- report plan, branch, ledger, handoff, worktree, git, and Graphite diagnostics.

### Current internal closeout command

```text
/stack-impl-closeout <tool-call-id>
```

This is an implementation detail of the old design. It should disappear in the runner-subagent rewrite.

## Current artifact contracts

### Stack plan

Stored in Branch Memory:

```text
namespace: stack-plans
branch:    <plan-branch>
key:       <objective-slug>.md
```

Required frontmatter:

```yaml
---
schema: asdl.stack-plan.v1
objective: <objective-slug>
planned_branches:
  - <branch-one>
  - <branch-two>
---
```

Validation rules:

- `schema` must be exactly `asdl.stack-plan.v1`.
- `objective` must match the selected Objective slug.
- `planned_branches` must be non-empty, unique, and non-empty strings.
- Planned branch names must not contain literal `---`; that string is used internally to escape `/` in branch-derived keys.
- Every planned branch string must appear literally in the Markdown body.

### Slice ledger

Stored on each slice branch:

```text
namespace: stack-impls
branch:    <slice-branch>
key:       <objective-slug>/<escaped-slice-branch>.md
```

The ledger is pointer-only:

```yaml
---
schema: asdl.stack-slice-ledger.v1
plan:
  branch: <plan-branch>
  namespace: stack-plans
  key: <objective-slug>.md
  sha256: <plan-content-hash>
---

This slice was started from the canonical Branch Memory stack plan above.
Completion is inferred from the derived handoff artifact on this branch.
```

The ledger intentionally does **not** contain mutable lifecycle fields like `running`, `complete`, or `blocked`.

### Completion handoff

Stored on each slice branch:

```text
namespace: session-artifacts
branch:    <slice-branch>
key:       handoffs/<objective-slug>-<escaped-slice-branch>.md
```

Completion is inferred from the presence of this derived handoff key.

### Branch escaping

For Branch Memory keys:

```ts
escaped = branch.replaceAll("/", "---")
```

Branch names containing literal `---` are rejected.

## Current slice implementation contract

The slice kickoff prompt currently instructs the agent to:

1. read the Branch Memory plan and Objective before editing code;
2. implement only the current branch's slice from the plan body;
3. update the Objective with landed-state semantics for the slice;
4. validate the slice and create/amend the Graphite commit;
5. call `stack_impl_slice_done` when complete;
6. call `stack_impl_slice_blocked` if blocked.

The current completion tool schema is:

```ts
stack_impl_slice_done({
  summary: string;
  validation: string;
  handoff_markdown: string;
  semantic_update_file?: string;
  followups?: string[];
})
```

The current blocked tool schema is:

```ts
stack_impl_slice_blocked({
  reason: string;
  attempted: string;
  next_steps?: string;
})
```

These schemas are good starting points for terminal tools in the runner-subagent rewrite.

## What was not working before

The old architecture used fresh sessions but did not have a structured way for a runner subagent/tool to return control to the parent command.

The critical broken path:

```ts
// stack_impl_slice_done tool
pendingCloseouts.set(toolCallId, payload);
pi.sendUserMessage(`/stack-impl-closeout ${toolCallId}`, { deliverAs: "followUp" });
```

Root cause:

- `pi.sendUserMessage()` calls `prompt(..., { expandPromptTemplates: false })`.
- Extension command dispatch only happens when prompt/template expansion is enabled.
- Therefore `/stack-impl-closeout ...` is delivered as literal user text from the extension, not as a slash command.
- The agent sees it as chat and may answer instead of invoking the handler.

Consequences:

- `stack_impl_slice_done` can queue text that looks like a command but never runs.
- The completion handoff may not be stored by the extension.
- The next planned branch may not be created or started.
- The workflow can stall after any slice.
- Manual recovery may emulate only part of closeout, missing the automatic next-slice start.

Tests missed this because:

- command tests invoked `stack-impl-closeout` directly;
- tool tests only asserted that slash text was queued;
- no regression test covered the full real path: tool call -> queued follow-up -> extension command dispatch -> closeout -> next slice.

The same class of bug also affects planning auto-continuation where code queues:

```ts
pi.sendUserMessage(`/objective-stack-impl ${objective}`, { deliverAs: "followUp" });
```

That is also slash-command text injected through `sendUserMessage()`, so it has the same command-dispatch hazard.

Other limitations of the old design:

- pending closeout payloads are only in memory;
- tools receive `ExtensionContext`, not `ExtensionCommandContext`, so tools cannot call `ctx.newSession()`;
- the internal closeout command exists only to recover command-context abilities after a tool call;
- the extension uses command/message choreography instead of a real runner-subagent lifecycle;
- user-facing failure mode is confusing because the literal slash text looks like it should have worked.

## Desired runner-subagent-based architecture

The Objective stack command becomes a parent orchestrator. It should run runner subagents and await structured terminal results directly.

High-level shape over the implemented helper:

```ts
import { dispatchRunnerSubagent } from "./runner-subagent.ts";

async function objectiveStackImpl(pi, args, ctx) {
  const objective = await resolveObjective(args);
  const plan = await loadOrPlanStack(objective, ctx);

  for (;;) {
    const slice = await findNextIncompleteSlice(plan);
    if (!slice) return complete;

    await prepareSliceBranchAndLedger(slice);

    const result = await dispatchRunnerSubagent<StackSliceTerminalInput>(
      pi,
      { cwd: ctx.cwd, signal: ctx.signal },
      {
        title: `${objective.slug}: ${slice.branch}`,
        prompt: buildSlicePrompt(slice),
        cwd: ctx.cwd,
        terminalTools: [
          { name: "stack_impl_slice_done", status: "completed", description, parameters: doneSchema },
          { name: "stack_impl_slice_blocked", status: "blocked", description, parameters: blockedSchema },
        ],
      },
    );

    if (result.status === "completed") {
      await closeoutStackSlice(result.terminal.input);
      continue;
    }

    await recordStopOrBlock(result);
    return;
  }
}
```

The old internal command disappears:

```text
/stack-impl-closeout <tool-call-id>  // remove
```

The parent already has command-context capabilities and receives the terminal tool payload directly. Domain side effects such as Branch Memory handoff writes happen in parent code after `dispatchRunnerSubagent` returns.

## Planning phase over runner subagents

The planning phase can also be represented as a runner subagent, but it has one extra UX requirement: the planner may need to collaborate with the user before final confirmation.

The implemented helper is non-interactive, so the first rewrite must not depend on an interactive planning subagent. Use runner subagents for implementation slices first. Planning should remain parent-driven or command/UI-driven until interactive subagent replies exist.

### Current MVP path: planning remains parent/session-based initially

For the first rewrite, keep planning as a normal command-driven or parent-UI flow and use runner subagents only for implementation slices.

This is less clean than interactive planning but still fixes the main completion auto-advance problem.

Avoid `sendUserMessage("/objective-stack-impl ...")`; use a real queued-command API if one exists, perform the continuation directly in parent code, or ask the user to rerun explicitly. The parent must validate and store/reuse/rewrite plans in Branch Memory.

A non-interactive subagent may be useful later to draft a candidate plan, but explicit user confirmation and Branch Memory writes still belong to the parent command.

### Future option: interactive foreground runner subagent

If a future runner-subagent primitive can receive user replies until a terminal tool is called, planning can move into a foreground runner subagent.

Future planning terminal tools:

```ts
objective_stack_plan_confirmed({
  plan_markdown: string;
})

objective_stack_plan_blocked({
  reason: string;
  attempted?: string;
  next_steps?: string;
})
```

Future flow:

1. `/objective-stack-impl <slug>` detects no existing plan or `--replan`.
2. Parent launches a planning runner subagent with Objective contents, roadmap, Semantic Updates, destination, schema, and replacement mode if applicable.
3. Planner talks with the user as needed.
4. Planner calls `objective_stack_plan_confirmed` only after explicit user confirmation.
5. Parent validates the plan markdown and asks controlled UI confirmation before storing/replacing Branch Memory.
6. Parent continues directly to slice implementation.

This would remove XML marker scraping and slash-command auto-continuation from planning too.

## Slice phase over runner subagents

For each slice:

1. Determine the first planned branch without a completion handoff.
2. Fail closed if the worktree is dirty.
3. If the slice branch does not exist:
   - `git checkout -b <slice-branch> <intended-parent>`;
   - `gt track -p <intended-parent>`;
   - write the slice ledger.
4. If the branch exists:
   - validate an existing ledger when present;
   - fail if an existing branch has no valid ledger unless currently on that branch and recovery is safe;
   - check out the branch;
   - ensure Graphite tracking points at the intended parent.
5. Launch a runner subagent for exactly that slice.
6. Wait for `stack_impl_slice_done` or `stack_impl_slice_blocked`.
7. On done:
   - find and validate the current branch ledger;
   - reload the referenced plan;
   - verify plan hash matches the ledger;
   - verify current branch is in the plan;
   - store `handoff_markdown` under the derived session-artifacts handoff key;
   - continue to the next incomplete slice.
8. On blocked/cancelled/stopped-without-terminal/error/protocol-error:
   - do not auto-advance;
   - notify and preserve session path/status for recovery.

## Expected runner-subagent prompt

A slice subagent prompt should include at least:

```text
You are implementing one Objective stack slice in a runner subagent.
Do not start or plan another slice.
Do not submit PRs.
Finish only by calling stack_impl_slice_done or stack_impl_slice_blocked.
Do not call a terminal tool in the same assistant turn as any sibling tool call.
The terminal tool is capture-only; parent code stores handoffs and advances the stack after you return.

Objective slug: <slug>
Objective path: .asdl/objectives/<slug>/

Canonical Branch Memory plan:
- Branch: <plan-branch>
- Namespace: stack-plans
- Key: <slug>.md
- SHA-256: <hash>

Current planned branch: <slice-branch>
Intended parent branch: <parent-branch>
Slice ledger: stack-impls/<ledger-key> on branch <slice-branch>
Expected completion handoff: session-artifacts/<handoff-key> on branch <slice-branch>
Previous handoff locator: <previous-handoff-or-none>

Instructions:
1. Read the Branch Memory plan and Objective before editing code.
2. Implement only the current branch's slice from the plan body.
3. Update the Objective with landed-state semantics for this slice.
4. Validate the slice and create/amend the Graphite commit.
5. When complete, call stack_impl_slice_done with validation evidence and handoff markdown.
6. If blocked, call stack_impl_slice_blocked.
```

## Parent/subagent responsibility split

Parent Objective stack command:

- resolves Objective and plan;
- owns Branch Memory plan storage;
- owns branch/Graphite setup;
- owns ledger writes and validation;
- launches runner subagents;
- stores completion handoffs;
- decides whether to continue;
- reports status/recovery diagnostics.

Slice runner subagent:

- reads plan/Objectives/handoffs;
- edits code/docs/tests for exactly one slice;
- writes Objective Semantic Update;
- runs validation;
- creates or amends Graphite commit;
- drafts handoff markdown;
- calls terminal done/blocked tool.

Local runner-subagent helper:

- spawns a fresh subagent Pi process in JSON mode;
- injects only the generated terminal-capture runtime for terminal mode;
- creates or discovers an inspectable runner subagent session path;
- parses lightweight subagent progress into the final result;
- detects terminal capture tools and protocol violations;
- stops the subagent after terminal state;
- returns structured terminal input to parent as `result.terminal.input` in terminal mode;
- can return useful assistant final text as `result.finalText` in final-text mode;
- handles cancellation best-effort.

## Minimal runner-subagent requirements for this rewrite

Available now:

- `dispatchRunnerSubagent(pi, { cwd: ctx.cwd, signal: ctx.signal }, { prompt, title, cwd: ctx.cwd, terminalTools })`.
- Same cwd/worktree sequential runner subagents.
- Fresh subagent context by default.
- Runner subagent session file returned when available.
- Terminal payload returned as canonical validated `result.terminal.input` in terminal mode.
- Final assistant text returned as `result.finalText` in final-text mode.
- Result statuses: `completed`, `blocked`, `final-text`, `stopped-without-terminal`, `stopped-without-useful-text`, `cancelled`, `error`, and `protocol-error`.
- Lightweight progress in the final result and via `onProgress(update)` callbacks; callers can show progress plus UI-only activity in their own status/widget while waiting.
- Cancellation returns `status: "cancelled"` when distinguishable.
- Collision checks at subagent startup through `pi.getAllTools()`.
- Mixed terminal-plus-sibling tool batches surface as `protocol-error`.

Not available in the current helper:

- A built-in runner-subagent method on `ExtensionCommandContext`.
- Interactive foreground runner subagents that can receive user replies before terminal tool completion.
- A public terminal `details`, `content`, or `isError` result contract.
- Stable package exports/subpaths for helper imports.

Not required for v1 rewrite:

- parallel runner subagents;
- background jobs;
- worktree isolation;
- intercom;
- durable parent promise resume after Pi process restart;
- model/tool overrides;
- runner-subagent marketplace/named agents.

## Testing targets for the rewrite

Runner-subagent helper tests already cover the base abstraction under `ts/packages/pi-extensions/test/`:

- runner subagent starts with a prompt and persists a session file;
- subagent progress tracks current tool/tool count;
- terminal tool returns structured validated input to parent;
- terminal tool stops the subagent without another model turn;
- subagent stopping without terminal tool returns `status: "stopped-without-terminal"`;
- cancellation returns `status: "cancelled"`;
- protocol violations return `status: "protocol-error"`;
- slash-command text is not involved in subagent completion.

Objective stack rewrite tests:

- existing plan loads and first incomplete slice starts in a runner subagent;
- no-plan path starts controlled parent/session planning fallback;
- confirmed plan stores to `stack-plans/<slug>.md` on plan branch;
- slice done terminal result stores derived handoff and advances to next slice;
- final slice done reports complete and does not start another subagent;
- blocked terminal result stops and does not write completion handoff;
- dirty worktree fails before branch creation;
- plan hash drift fails closed;
- existing branch without valid ledger fails closed;
- no `pi.sendUserMessage("/stack-impl-closeout ...")` or equivalent slash injection remains.

Regression test that would have caught the old bug:

```text
objective-stack subagent calls stack_impl_slice_done
  -> parent receives terminal result
  -> closeout stores handoff
  -> parent starts next subagent slice
```

Do not test this by directly calling the closeout handler; the bug was in the handoff path.

## Risks and open decisions

### Planning interactivity

Resolved for the current helper: interactive subagent replies are not available. The first Objective stack rewrite should keep planning parent/session-based and use runner subagents for implementation slices. Interactive foreground planning remains a future option.

### Terminal tool payload source

Resolved: the canonical terminal contract is validated tool input at `result.terminal.input`. Do not rely on result `details`, `content`, or `isError` for domain data.

### Multiple tool calls in one subagent assistant message

Resolved for the current helper: terminal-plus-sibling tool batches return `protocol-error`. Public Pi event ordering may still allow an earlier sibling side effect before the violation is observed, so subagent prompts should explicitly forbid sibling terminal batches and parent code must treat `protocol-error` as non-complete.

### Same-worktree sequencing

Still required: the Objective stack must remain sequential. Starting PR runner subagents concurrently in the same worktree is unsafe.

### Runtime isolation

Resolved for the base helper: runner subagents run with `--no-extensions` plus only the generated terminal runtime. Future Objective stack subagents that need ordinary subagent extensions must opt in deliberately and re-open isolation/collision decisions.

### Helper import/package boundary

Resolved for the MVP: use repo-local source imports and thin `.pi/extensions/*` shims. Add stable package exports or subpaths only if the Objective stack consumer proves they are needed.

### Recovery after Pi restart

Still out of scope: rely on git state, Branch Memory, and runner subagent session files for recovery. Durable in-flight runner-subagent job resume is not implemented.

## Recommended implementation sequence

1. Implement the Objective stack command in the engineered `ts/packages/pi-extensions` layer and expose it through a thin `.pi/extensions/*` shim.
2. Port or rebuild plan validation, Branch Memory plan storage, branch/Graphite setup, ledger writes, and status diagnostics in testable modules.
3. Keep planning parent/session-based for the first rewrite; avoid slash-command auto-continuation and do not depend on interactive subagent replies.
4. Launch each implementation slice with `dispatchRunnerSubagent(pi, { cwd: ctx.cwd, signal: ctx.signal }, options)` and subagent-local `stack_impl_slice_done` / `stack_impl_slice_blocked` terminal tools.
5. On `completed`, close out from `result.terminal.input`: validate ledger/plan hash/current branch, store the derived completion handoff, and continue to the next incomplete slice.
6. On `blocked`, `cancelled`, `stopped-without-terminal`, `error`, or `protocol-error`, stop without writing a completion handoff and surface diagnostics plus the runner subagent path when available.
7. Remove `/stack-impl-closeout`, pending closeout maps, `sendUserMessage("/..." )` continuation hacks, and any tests that only exercise the old closeout command directly.
8. Add the full done -> closeout -> next-subagent regression test using the real parent handoff path and a fake runner-subagent dispatcher.
9. Update docs and skills to describe the new parent/subagent lifecycle.

## Summary

The Objective stack extension wants to be a deterministic parent orchestrator for a sequence of PR-slice runner subagents.

The old design approximated that with fresh sessions plus slash-command follow-ups, but `sendUserMessage()` intentionally bypasses slash-command dispatch. That made auto-advance unreliable.

The new design should use the repo-local runner-subagent helper. Each subagent returns a terminal tool result directly to the parent, letting the parent store handoffs and continue the stack without command-text hacks.
