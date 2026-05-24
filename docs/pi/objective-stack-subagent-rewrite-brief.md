# Objective Stack Subagent Rewrite Brief

## Why this document exists

This brief captures the current Objective stack implementation workflow, the failure mode that prompted a redesign, and the intended rewrite on top of a minimal Pi core subagent primitive.

It is written for a fresh agent so they do **not** need to rediscover:

- what the Objective stack command is supposed to do;
- what arguments and artifacts it owns;
- how the current implementation works;
- what broke in the old tool/command handoff path;
- how the same feature should work over first-class child sessions/subagents;
- what risks and design decisions remain open.

Read this together with the [Pi Core Subagent MVP Objective](../../.asdl/objectives/pi-core-subagent-mvp/objective.md), which is the canonical design record for the core child-session primitive.

## Glossary

- **Objective**: checked-in ASDL Objective under `.asdl/objectives/<slug>/`.
- **Objective slug**: directory/key name for the Objective. It must be a single safe path segment; no `/`, `..`, or surrounding whitespace.
- **Plan branch**: the git branch from which `/objective-stack-impl` is invoked. Canonical stack plans are stored on this branch in Branch Memory.
- **Stack plan**: Markdown document with frontmatter schema `asdl.stack-plan.v1`, Objective slug, and ordered planned branch names.
- **Slice**: one planned PR branch in the stack.
- **Slice branch**: a git/Graphite branch for one slice.
- **Slice ledger**: branch-local Branch Memory pointer from a slice branch back to the canonical stack plan and plan hash.
- **Completion handoff**: Branch Memory artifact whose existence marks a slice complete.
- **Terminal tool**: child-session tool that ends the subagent run and returns structured data to the parent orchestrator.

## Broad product goal

The Objective stack feature should let a user say, effectively:

```text
Implement this Objective as a Graphite PR stack.
```

Pi should then supervise the whole stack, one PR slice at a time:

1. choose or plan the stack;
2. create/check out each branch in order;
3. launch a fresh focused child session for that branch;
4. let the child agent implement, validate, update the Objective, commit/amend, and produce a handoff;
5. store the handoff and move to the next branch;
6. stop cleanly when complete, blocked, cancelled, or unsafe to continue.

The extension should own the mechanical control plane. The child agent owns actual implementation work.

## Non-goals

The Objective stack feature should **not**:

- submit Graphite PRs automatically;
- run multiple PR implementation agents concurrently in the same worktree;
- silently repair branch/Graphite/plan drift;
- trust final assistant prose as completion;
- rely on slash-command text injected as a user message;
- make Branch Memory lifecycle state implicit or uninspectable.

## Current command surface

The current extension is `.pi/extensions/asdl-stack-impl`.

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

This is an implementation detail of the old design. It should disappear in the subagent rewrite.

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

These schemas are good starting points for terminal tools in the subagent rewrite.

## What was not working before

The old architecture used fresh sessions but did not have a structured way for a child session/tool to return control to the parent command.

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
- the extension uses command/message choreography instead of a real child-run lifecycle;
- user-facing failure mode is confusing because the literal slash text looks like it should have worked.

## Desired subagent-based architecture

The Objective stack command becomes a parent orchestrator. It should run child sessions and await structured terminal results directly.

High-level shape:

```ts
async function objectiveStackImpl(args, ctx) {
  const objective = await resolveObjective(args);
  const plan = await loadOrPlanStack(objective, ctx);

  for (;;) {
    const slice = await findNextIncompleteSlice(plan);
    if (!slice) return complete;

    await prepareSliceBranchAndLedger(slice);

    const result = await ctx.runChildSession({
      title: `${objective.slug}: ${slice.branch}`,
      prompt: buildSlicePrompt(slice),
      terminalTools: [
        { name: "stack_impl_slice_done", status: "completed" },
        { name: "stack_impl_slice_blocked", status: "blocked" },
      ],
    });

    if (result.status === "completed") {
      await closeoutStackSlice(result.terminalTool!.input /* or details */);
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

The parent already has command-context capabilities and receives the terminal tool payload directly.

## Planning phase over subagents

The planning phase can also be represented as a child session, but it has one extra UX requirement: the planner may need to collaborate with the user before final confirmation.

There are two possible MVP-compatible designs.

### Preferred: interactive foreground child session

Core `runChildSession()` supports a foreground child that can receive user replies until it calls a terminal tool.

Planning terminal tools:

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

Flow:

1. `/objective-stack-impl <slug>` detects no existing plan or `--replan`.
2. Parent launches a planning child session with Objective contents, roadmap, Semantic Updates, destination, schema, and replacement mode if applicable.
3. Planner talks with the user as needed.
4. Planner calls `objective_stack_plan_confirmed` only after explicit user confirmation.
5. Parent validates the plan markdown and asks controlled UI confirmation before storing/replacing Branch Memory.
6. Parent continues directly to slice implementation.

This removes XML marker scraping and slash-command auto-continuation.

### Simpler fallback: planning remains command/session-based initially

If the core subagent MVP does not support interactive child/user continuation, keep planning as a normal command-driven flow temporarily and use child sessions only for implementation slices.

This is less clean but still fixes the main completion auto-advance problem.

In that fallback, avoid `sendUserMessage("/objective-stack-impl ...")`; use a real queued-command API or ask the user to rerun explicitly until planning can use terminal tools.

## Slice phase over subagents

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
5. Launch a child session for exactly that slice.
6. Wait for `stack_impl_slice_done` or `stack_impl_slice_blocked`.
7. On done:
   - find and validate the current branch ledger;
   - reload the referenced plan;
   - verify plan hash matches the ledger;
   - verify current branch is in the plan;
   - store `handoff_markdown` under the derived session-artifacts handoff key;
   - continue to the next incomplete slice.
8. On blocked/cancelled/stopped/error:
   - do not auto-advance;
   - notify and preserve session path/status for recovery.

## Expected child-session prompt

A slice child prompt should include at least:

```text
You are implementing one Objective stack slice in a child session.
Do not start or plan another slice.
Do not submit PRs.
Finish only by calling stack_impl_slice_done or stack_impl_slice_blocked.

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

## Parent/child responsibility split

Parent Objective stack command:

- resolves Objective and plan;
- owns Branch Memory plan storage;
- owns branch/Graphite setup;
- owns ledger writes and validation;
- launches child sessions;
- stores completion handoffs;
- decides whether to continue;
- reports status/recovery diagnostics.

Child slice session:

- reads plan/Objectives/handoffs;
- edits code/docs/tests for exactly one slice;
- writes Objective Semantic Update;
- runs validation;
- creates or amends Graphite commit;
- drafts handoff markdown;
- calls terminal done/blocked tool.

Core Pi subagent primitive:

- creates persisted child session;
- streams child progress;
- exposes child session path;
- detects terminal tools;
- stops child after terminal state;
- returns structured terminal payload to parent;
- handles cancellation.

## Minimal core requirements for this rewrite

Required:

- `ctx.runChildSession({ prompt, title, terminalTools })` on `ExtensionCommandContext`.
- Same cwd/worktree sequential child sessions.
- Fresh child context by default.
- Child session file returned in result.
- Terminal tool result returned to parent with input/details/content/isError.
- Child progress visible in parent UI.
- Cancellation returns `status: "cancelled"`.

Strongly desired for full current UX:

- interactive foreground child sessions that can receive user replies before terminal tool completion, especially for planning.

Not required for v1 rewrite:

- parallel child sessions;
- background jobs;
- worktree isolation;
- intercom;
- durable parent promise resume after Pi process restart;
- model/tool overrides;
- child-session marketplace/named agents.

## Testing targets for the rewrite

Core Pi tests:

- child session starts with a prompt and persists a session file;
- child progress reports current tool/tool count;
- terminal tool returns structured input/details to parent;
- terminal tool stops the child without another model turn;
- child stopping without terminal tool returns `status: "stopped"`;
- cancellation returns `status: "cancelled"`;
- slash-command text is not involved in child completion.

Objective stack extension tests:

- existing plan loads and first incomplete slice starts in a child session;
- no-plan path starts planning child or controlled fallback;
- confirmed plan stores to `stack-plans/<slug>.md` on plan branch;
- slice done terminal result stores derived handoff and advances to next slice;
- final slice done reports complete and does not start another child;
- blocked terminal result stops and does not write completion handoff;
- dirty worktree fails before branch creation;
- plan hash drift fails closed;
- existing branch without valid ledger fails closed;
- no `pi.sendUserMessage("/stack-impl-closeout ...")` or equivalent slash injection remains.

Regression test that would have caught the old bug:

```text
objective-stack child calls stack_impl_slice_done
  -> parent receives terminal result
  -> closeout stores handoff
  -> parent starts next child slice
```

Do not test this by directly calling the closeout handler; the bug was in the handoff path.

## Risks and open decisions

### Planning interactivity

The full current planning UX assumes user collaboration before final plan confirmation. If `runChildSession()` is single-prompt only, planning needs a fallback. Preferred fix is interactive foreground child support.

### Terminal tool payload source

`stack_impl_slice_done` currently returns the payload as tool input and result details. The rewrite should return both input and details and choose one canonical contract. Recommendation: treat the validated tool input as canonical, because it is schema-checked before execution.

### Multiple tool calls in one child assistant message

If a terminal tool appears with sibling tools, core must define deterministic behavior. Recommendation: execute/record the current batch consistently, then stop before any further model turn.

### Same-worktree sequencing

The Objective stack must remain sequential. Starting PR child sessions concurrently in the same worktree is unsafe.

### Runtime isolation

Child extension runtime should not share mutable parent session state. Any parent state needed after the child must be plain serialized data or the structured terminal result.

### Recovery after Pi restart

The MVP can rely on git state, Branch Memory, and child session files for recovery. Durable in-flight child job resume is out of scope.

## Recommended implementation sequence

1. Implement Pi core `runChildSession()` MVP with terminal tool detection.
2. Add core tests using a simple terminal tool fixture.
3. Rebuild Objective stack implementation slice closeout on `runChildSession()`.
4. Remove `/stack-impl-closeout` and pending closeout map.
5. Add the full done -> closeout -> next-child regression test.
6. Rework planning to use a planning terminal tool if interactive child sessions are available; otherwise use a controlled fallback without slash injection.
7. Update docs and skills to describe the new parent/child lifecycle.

## Summary

The Objective stack extension wants to be a deterministic parent orchestrator for a sequence of PR-slice child sessions.

The old design approximated that with fresh sessions plus slash-command follow-ups, but `sendUserMessage()` intentionally bypasses slash-command dispatch. That made auto-advance unreliable.

The new design should use a core child-session primitive. Each child returns a terminal tool result directly to the parent, letting the parent store handoffs and continue the stack without command-text hacks.
