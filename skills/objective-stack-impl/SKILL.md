---
name: objective-stack-impl
description: Implement one asdl Objective as a small Graphite stack from the current agent session. Use when the user asks to implement an Objective as a stack outside the Pi /objective:stack-impl picker, or when a wrapper injects an explicit slug.
---

# Objective Stack Implementation Orchestrator

You are the current parent agent session. Orchestrate implementation of one asdl Objective as a small Graphite stack from this session.

## Non-goals and hard boundaries

- Do not start, create, or switch to a separate parent orchestration session.
- Do not use Branch Memory (`brmem`) for stack plans, slice ledgers, handoffs, recovery keys, or completion records.
- Do not use stack-specific child terminal tools such as `stack_impl_slice_done` or `stack_impl_slice_blocked`.
- Use the harness's repo-local runner subagent helper for delegated implementation slices when available. In Pi/Codex environments that expose `dispatch_runner_subagent`, use that tool. If no equivalent helper is available, stop before delegation and ask the user how to proceed.
- Run only one runner subagent at a time in this same worktree. Do not launch parallel same-worktree subagents.
- Do not submit PRs automatically. Leave PR submission to an explicit user request.
- Do not invent hidden state, YAML registries, durable stack schemas, or deterministic parsing of freeform subagent text.

The parent agent owns planning, slice selection, subagent prompt construction, subagent result interpretation, validation, Objective updates, commits/amends, and the decision to continue or stop.

## Resolve the Objective

1. If the user or wrapper supplied an Objective slug/path, treat it as the explicit Objective selection. The Pi `/objective:stack-impl` extension wrapper normally preselects this value before loading this skill.
2. If no Objective is explicit, do not infer it from branch name, changed files, package names, PR titles, or keyword matches. Run:

   ```bash
   objective list --format md
   ```

   Show the open candidates and ask the user to choose before doing implementation work.
3. Normalize a path such as `.asdl/objectives/<slug>` to `<slug>`.
4. If `.asdl/objectives/<slug>/closed.md` exists, stop and report that the selected Objective is closed.

## Compact current context first

Before planning, write a concise prose compaction of the current conversation context:

- user intent and constraints;
- relevant decisions already made;
- known changed files, branches, and validation results;
- stale or noisy context to ignore;
- references to durable artifacts instead of copying large documents.

Do not write a handoff artifact. This is only in-session context compaction.

## Inspect Objective and repository state

Read the selected Objective records:

- `.asdl/objectives/<slug>/objective.md`
- `.asdl/objectives/<slug>/roadmap.md`
- relevant files under `.asdl/objectives/<slug>/updates/`

Then inspect repository state:

- `git status --short`
- the current branch
- diff against the appropriate trunk or Graphite parent when useful
- source, test, skill, prompt, or documentation files relevant to the next slice

Tracking gate: if material implementation progress appears present but is not recorded in the Objective, stop and ask the user to run `objective-update` before continuing. If evidence is absent, ambiguous, or unrelated, proceed with a short note.

## Preview and confirm the execution plan

Before creating branches, committing, amending, or dispatching subagents, present a concise execution preview and ask the user to confirm. Do not proceed until the user explicitly confirms the latest preview.

The preview is conversational only. Do not create a durable stack schema, side ledger, Branch Memory record, or hidden state from it.

The preview must include:

- selected Objective slug;
- whether this is one planned stack or whether the parent expects to propose more work after the stack;
- 1 to 3 planned PRs/Graphite branches by default;
- one high-level thesis per planned PR/branch;
- why each planned PR/branch is independently reviewable;
- expected validation for the planned work;
- expected Objective update evidence, if meaningful progress is made;
- expected Objective state at the end of the planned execution;
- exact stop conditions;
- a reminder that PR submission is intentionally left undone unless the user explicitly asks for it.

Use a compact shape like:

```text
Proposed Objective implementation plan

Objective: `<slug>`

I plan to implement this as:

1. `<branch-or-pr-name>`
   - Thesis: <one sentence>
   - Validation: <short command/evidence summary>

2. `<branch-or-pr-name>`
   - Thesis: <one sentence>
   - Validation: <short command/evidence summary>

Expected Objective state at the end:

- <roadmap/update/closure expectation>
- PR submission remains manual.

Stop conditions: <short list>

Proceed with this execution plan?
```

Proceed only after an explicit affirmative response such as `yes`, `proceed`, or a clear equivalent. If the user asks for changes, revise the preview and ask again. If the user declines, is ambiguous, or asks a question, answer or stop; do not execute the plan yet.

Use this repo's Graphite workflow instructions before creating branches, navigating the stack, committing, amending, or restacking.

## Execute one slice at a time

For each planned slice:

1. Confirm that the user explicitly approved the latest execution preview. If not, stop and ask for confirmation before doing branch or subagent work.
2. Check worktree state before branch or subagent work. Stop if it is unsafe for a subagent launch.
3. Create, navigate to, or amend the appropriate Graphite branch using the repo's normal Graphite workflow.
4. Build a complete subagent prompt for exactly one focused implementation slice.
5. Call the runner subagent helper with a concise title and the full prompt.
6. Wait for the subagent result. Do not launch another subagent while it runs.
7. Inspect the returned status, final text, diagnostics, progress, and session file when present.
8. Immediately record a current-session slice result entry before interpreting completion. Include:

   - slice title;
   - branch;
   - subagent status;
   - subagent session file path when present;
   - whether useful final text was available;
   - parent validation commands and pass/fail/skipped results;
   - Objective update recorded, if any;
   - commit hash if committed;
   - blockers or ambiguity.

9. Treat only an explicit useful final-text status as a successful subagent-return candidate.
10. Even for useful final text, verify the work yourself with file inspection, git diff, and appropriate tests or checks.
11. For any non-final or ambiguous status, inspect diagnostics and the subagent session file before deciding whether to retry, ask the user, or stop.
12. If meaningful progress was made and validated, run `objective-update` with evidence from the slice.
13. Commit or amend only after parent-side validation, using the repo's Graphite workflow.
14. Decide whether to continue to the next slice or stop for user inspection.

## Subagent prompt requirements

Every subagent prompt must include all context the subagent needs. Do not rely on hidden parent context.

Include:

- selected Objective slug and relevant narrative summary;
- branch and slice goal;
- exact files or areas likely relevant;
- explicit constraints and non-goals;
- validation commands to run, or why validation should not be run;
- instructions to return final assistant text with:
  - outcome;
  - changed files;
  - validation performed and results;
  - blockers or ambiguities;
  - recommended next step.

## Interpret runner subagent statuses

- Useful final text: read the prose and verify independently. Do not blindly trust completion claims.
- Stopped without useful text, stopped without terminal result, cancelled, error, or protocol error: inspect diagnostics and any session file before deciding whether to retry, ask the user, or stop.
- Terminal-capture statuses such as `completed` or `blocked` are not expected for this workflow. Do not treat them as completion without inspection.

## Validation guidance

Choose validation appropriate to the files changed:

- Skill-only changes: `dprint check skills/objective-stack-impl/SKILL.md` or `just dprint-check`.
- Pi wrapper changes: `just ts-check` and `just ts-test`.
- Broader readiness when practical: `just check`.

Autofix policy:

- If dprint fails, run `just dprint-fix` instead of hand-formatting Markdown or TOML.
- If Python `ruff` failures appear and are relevant to the slice, use `just fix` before hand-editing formatter output.

## Stop and ask the user when

- Objective selection is absent or ambiguous;
- the selected Objective is closed;
- material progress appears unrecorded in the Objective;
- the execution preview has not been explicitly confirmed;
- the user requests changes to the plan;
- the parent agent needs to plan a materially different stack than the one the user confirmed;
- the worktree is unsafe for branch or subagent work;
- a subagent result is non-final or ambiguous and cannot be safely interpreted;
- validation fails in a way that needs product or design input;
- all planned work is complete and the remaining action is user inspection, Objective closure, or PR submission.

## Manual recovery notes

If this session or a subagent fails, recover manually from inspectable artifacts:

- `git status`, diffs, commits, and Graphite stack state;
- subagent session file paths returned by the runner subagent helper;
- Objective files and updates;
- the current parent session transcript.

Do not expect Branch Memory ledgers, hidden extension state, or durable stack schemas for this v1 workflow.

## Stack implementation digest telemetry

Before the final response, use the current-session slice result list to collect all non-empty subagent session file paths.

If no subagent session files are available:

- do not run `objective exec runner-subagent-usage`;
- state: `Runner subagent usage telemetry unavailable: no subagent sessionFile paths were returned.`

If one or more subagent session files are available, run:

```bash
objective exec runner-subagent-usage --format md <session-file>...
```

If the command succeeds, include its Markdown output directly when compact enough. Otherwise, compactly transcribe the aggregate totals, model refs, and any non-ok per-file rows.

If the command fails, include the attempted command, quote the stdout/stderr failure text, and state that telemetry is unavailable due to command failure.

If the command reports rows such as `missing`, `not_file`, `read_error`, `invalid_json`, or `no_usage`, keep the overall digest. Call out unavailable subagent rows and trust the command aggregate for ok sessions only.

Use telemetry only for factual usage accounting: per-subagent and aggregate tokens, cost, peak observed token usage, model refs, and unavailable/error statuses. Do not use telemetry to infer subagent completion, code correctness, test sufficiency, or Objective closure. Do not claim a configured context-window capacity unless the subagent session logs expose it. Do not parse freeform subagent final text for usage metrics.

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

| slice     | branch     | subagent status | session file            | validation | commit           |
| --------- | ---------- | --------------- | ----------------------- | ---------- | ---------------- |
| `<slice>` | `<branch>` | `<status>`      | `<path-or-unavailable>` | `<result>` | `<hash-or-none>` |

### What changed

- Parent-authored summary of meaningful code, prompt, test, or docs changes.
- Mention files changed only when they help the reader inspect the run.

### Validation

- `<command>` — passed/failed/skipped, with short interpretation.

### Runner subagent usage

- Include `objective exec runner-subagent-usage --format md ...` output, a compact transcription, or the explicit unavailable reason.
- Keep telemetry separate from validation evidence.

### Objective tracking

- Objective updates recorded: yes/no, with file names if known.
- Updates still needed: yes/no, with reason.

### Recommended next action

- Inspect diff / continue next slice / run objective-update / close Objective / ask for product decision.
- State that PR submission was intentionally left undone unless the user requested it.
```
