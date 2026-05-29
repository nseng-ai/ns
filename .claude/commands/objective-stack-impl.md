---
description: Implement an Objective as an orchestrated Graphite stack
argument-hint: "[objective-slug]"
---

# Objective Stack Implementation Orchestrator

You are the orchestrating Claude Code session. This is a current-session-only workflow: orchestrate
implementation of one asdl Objective as a small Graphite stack from this session.

Objective argument: `$ARGUMENTS`

## Non-goals and hard boundaries

- Do not start, create, or switch to a separate parent orchestration session.
- Do not use Branch Memory (`brmem`) for stack plans, slice ledgers, handoffs, recovery keys, or
  completion records.
- Delegate each implementation slice to a single subagent using the Agent/Task tool. Run only one
  subagent at a time in this worktree — never launch subagents in the background or in parallel,
  because they would collide on the shared working tree.
- Do not submit PRs automatically. Leave PR submission to an explicit user request.
- Do not invent hidden state, YAML registries, durable stack schemas, or deterministic parsing of
  freeform subagent text.

You (the orchestrating session) own planning, slice selection, subagent prompt construction,
subagent result interpretation, validation, Objective updates, commits/amends, and the decision to
continue or stop.

## Resolve the Objective

1. If `Objective argument` is non-empty, treat it as the explicit Objective slug or path.
   `$ARGUMENTS` is the explicit slug when provided.
2. If `Objective argument` is empty, do not infer the Objective from branch name, changed files,
   package names, PR titles, or keyword matches. Run:

   ```bash
   objective list --format md
   ```

   Show the open candidates and ask the user to choose before doing implementation work.
3. Normalize a path such as `.asdl/objectives/<slug>` to `<slug>`.
4. If `.asdl/objectives/<slug>/closed.md` exists, stop and report that the selected Objective is
   closed.

## Compact current context first

Before planning, write a concise prose compaction of the current conversation context:

- user intent and constraints;
- relevant decisions already made;
- known changed files, branches, and validation results;
- stale or noisy context to ignore;
- references to durable artifacts instead of copying large documents.

Do not write a handoff artifact. This is only in-session context compaction.

## Determine run horizon

Default mode: `whole-objective`.

- `whole-objective`: implement successive small Graphite stacks until no unblocked non-parked
  Objective roadmap work remains, validation fails, a product or design decision is needed, the
  worktree is unsafe, a subagent result cannot be interpreted safely, or the user asks to stop.
- `one-stack`: implement only the first planned 1 to 3 slice Graphite stack, then stop for
  inspection even if roadmap work remains.

Use `one-stack` only when the current user explicitly asks for a single stack, the first stack, or
stopping after inspection. Otherwise use `whole-objective`.

State the selected run horizon in conversation before dispatching any subagent. Keep this as your
own semantic judgment; do not add command-line flags or deterministic argument parsing.

## Inspect Objective and repository state

Read the selected Objective records:

- `.asdl/objectives/<slug>/objective.md`
- `.asdl/objectives/<slug>/roadmap.md`
- relevant files under `.asdl/objectives/<slug>/updates/`

Then inspect repository state:

- `git status --short`
- the current branch
- diff against the appropriate trunk or Graphite parent when useful
- source, test, prompt, or documentation files relevant to the next slice

Tracking gate: if material implementation progress appears present but is not recorded in the
Objective, stop and ask the user to run `objective-update` before continuing. If evidence is absent,
ambiguous, or unrelated, proceed with a short note.

## Plan a small Graphite stack in conversation

Before creating branches or dispatching subagents, draft a short visible "what will happen"
announcement for the next planned stack:

- selected run horizon: `whole-objective` or `one-stack`;
- first planned stack slices and branch names;
- 1 to 3 coherent slices by default;
- one Graphite branch per slice;
- each slice independently reviewable;
- expected validation for each slice;
- expected Objective update evidence for each slice;
- roadmap rows expected to remain after this stack, if any;
- exact stop conditions for this run;
- whether you intend to auto-plan another stack after this planned stack completes.

Use this repo's Graphite workflow (the `graphite` skill / `gt`) before creating branches, navigating
the stack, committing, amending, or restacking. Do not create a durable stack schema or side ledger.

## Execute one slice at a time

For each planned slice:

1. Check worktree state before branch or subagent work. Stop if it is unsafe for a subagent launch.
2. Create, navigate to, or amend the appropriate Graphite branch using the repo's normal Graphite
   workflow (`gt`).
3. Build a complete subagent prompt for exactly one focused implementation slice.
4. Launch a single subagent with the Agent/Task tool, passing a concise description and the full
   slice prompt. Do not run it in the background and do not launch a second subagent while one is
   running — only one subagent at a time in this worktree.
5. Read the subagent's returned final report (the tool result text).
6. Verify the work yourself regardless of what the report claims: inspect changed files, read the
   `git diff`, and run appropriate tests or checks. Treat the report as a claim to verify, not as
   ground truth.
7. Immediately record a current-session slice result entry before interpreting completion. Include:

   - slice title;
   - branch;
   - whether the subagent returned a usable final report;
   - parent validation commands and pass/fail/skipped results;
   - Objective update recorded, if any;
   - commit hash if committed;
   - blockers or ambiguity.

8. If meaningful progress was made and validated, run `objective-update` with evidence from the
   slice.
9. Commit or amend only after parent-side validation, using the repo's Graphite workflow.
10. Continue to the next planned slice. When no planned slices remain, use the
    planned-stack-exhausted gate instead of silently finalizing.

## Interpret the subagent's result

The Agent/Task tool returns the subagent's final assistant text directly as the tool result; there
is no separate status enum or session-file artifact to inspect.

- Read the returned report as a claim and verify it independently with file inspection, `git diff`,
  and appropriate tests or checks. Do not blindly trust completion claims.
- If the subagent errored, was interrupted, or returned no usable report, do not advance the stack.
  Inspect git state and the working tree to understand what happened, then decide whether to retry,
  ask the user, or stop. Record blockers if the subagent made material progress or exposed a real
  issue.

## Subagent prompt requirements

Every subagent prompt must include all context the subagent needs. Do not rely on hidden parent
context.

Include:

- selected Objective slug and relevant narrative summary;
- branch and slice goal;
- exact files or areas likely relevant;
- explicit constraints and non-goals;
- validation commands to run, or why validation should not be run;
- instructions to return a final report with:
  - outcome;
  - changed files;
  - validation performed and results;
  - blockers or ambiguities;
  - recommended next step.

## When a planned stack is exhausted

When all currently planned slices are complete:

1. Re-check worktree state.
2. Review the selected Objective roadmap semantically, focusing on non-parked `[ ]` and `[~]` work.
3. State in conversation:
   - planned stack complete;
   - remaining non-parked roadmap work;
   - proposed next stack, if any;
   - whether validation and worktree state permit continuing.
4. If in `whole-objective` mode and no stop condition applies, plan the next 1 to 3 slice stack and
   continue.
5. If in `one-stack` mode and work remains, ask the user whether to continue.
6. If no unblocked non-parked work remains, proceed to the final digest and recommend inspection,
   Objective closure, or PR submission as appropriate.

This gate is current-session-only. Do not create durable stack state, hidden schemas, or side
ledgers.

## Validation guidance

Choose validation appropriate to the files changed:

- Prompt-only changes: `dprint check <path>` or `just dprint-check`.
- TypeScript changes: `cd ts/packages/<pkg> && bun test && bun run check`.
- Python changes: `just check` (and the relevant package's tests).
- Broader readiness when practical: `just check`.

Autofix policy:

- If dprint fails, run `just dprint-fix` instead of hand-formatting Markdown or TOML.
- If Python `ruff` failures appear and are relevant to the slice, use `just fix` before hand-editing
  formatter output.

## Stop and ask the user when

- Objective selection is absent or ambiguous;
- the selected Objective is closed;
- material progress appears unrecorded in the Objective;
- the worktree is unsafe for branch or subagent work;
- a subagent errored, was interrupted, or returned no usable report and you cannot safely determine
  the working-tree state;
- validation fails in a way that needs product or design input;
- the selected Objective appears complete and the remaining action is user inspection, Objective
  closure, or PR submission;
- in `one-stack` mode, the planned stack is complete and roadmap work remains;
- in `whole-objective` mode, planned-stack completion is not a stop condition unless no unblocked
  roadmap work remains or another listed stop condition applies.

## Manual recovery notes

If this session or a subagent fails, recover manually from inspectable artifacts:

- `git status`, diffs, commits, and Graphite stack state;
- Objective files and updates;
- this session's transcript.

Do not expect Branch Memory ledgers, hidden state, or durable stack schemas for this workflow.

## Final response requirements

When you stop, produce a final response with a section titled exactly:

```md
## Stack implementation digest
```

Use this structure, adapting details honestly to the run:

```md
## Stack implementation digest

### Objective

- slug: `<objective-slug>`
- state: open/closed/unknown

### Slices attempted

| slice     | branch     | validation | commit           |
| --------- | ---------- | ---------- | ---------------- |
| `<slice>` | `<branch>` | `<result>` | `<hash-or-none>` |

### What changed

- Parent-authored summary of meaningful code, prompt, test, or docs changes.
- Mention files changed only when they help the reader inspect the run.

### Validation

- `<command>` — passed/failed/skipped, with short interpretation.

### Objective tracking

- Objective updates recorded: yes/no, with file names if known.
- Updates still needed: yes/no, with reason.

### Why stopped

- reason: planned stack exhausted / objective complete / validation failed / awaiting user decision
  / unsafe worktree / subagent ambiguity / user requested stop / other
- remaining non-parked roadmap work: yes/no/unknown, with short summary
- run horizon: whole-objective/one-stack

### Recommended next action

- Inspect diff / continue next slice / run objective-update / close Objective / ask for product
  decision.
- State that PR submission was intentionally left undone unless the user requested it.
```
