---
name: objective-stack-impl
description: Implement one asdl Objective as a small Graphite stack from the current agent session. Use when the user asks to implement an Objective as a stack outside the Pi /objective:stack-impl picker, or when a wrapper injects an explicit slug.
---

# objective-stack-impl

Orchestrate implementation of one asdl Objective as a small Graphite stack from this session. You are the **parent**: you own planning, **slice** selection, subagent prompt construction, result interpretation, validation, Objective updates, commits/amends, and every decision to continue or stop. A **runner subagent** writes code, but judgment never delegates — the parent decides what is true.

Part of the Objective skill family. Use the `objective` umbrella skill first for shared vocabulary, selection rules, storage model, and safety boundaries; this step is self-contained for its own happy path.

## Hard boundaries

- Stay in this session. Do not start, create, or switch to a separate parent orchestration session.
- No hidden state. Do not invent YAML registries, durable stack schemas, side ledgers, or deterministic parsing of freeform subagent text, and do not use Branch Memory (`brmem`) for stack plans, slice ledgers, handoffs, recovery keys, or completion records. The preview, the in-session slice-result list, and the Objective files are the only records.
- Do not use stack-specific child terminal tools such as `stack_impl_slice_done` or `stack_impl_slice_blocked`.
- Delegate slices through the harness's repo-local runner subagent helper. In Pi/Codex environments that expose `dispatch_runner_subagent`, use that tool; if no equivalent helper exists, stop before delegation and ask the user how to proceed.
- One runner subagent at a time in this worktree — never launch parallel same-worktree subagents.
- Do not submit PRs. Leave PR submission to an explicit user request.

## Resolve the Objective

1. If the user or wrapper supplied a slug/path, that is the selection (the Pi `/objective:stack-impl` wrapper normally preselects it before this skill loads). Normalize `.asdl/objectives/<slug>` to `<slug>`.
2. Otherwise do not infer the Objective from branch name, changed files, package names, PR titles, or keyword matches. Run `objective list --minimal --format md`, show the open candidates, and ask the user to choose before any implementation work.
3. If `.asdl/objectives/<slug>/closed.md` exists, stop and report that the Objective is closed.

## Compact current context

Before planning, write a concise prose compaction of the conversation: user intent and constraints; decisions already made; known changed files, branches, and validation results; stale or noisy context to ignore; and references to durable artifacts rather than copies of large documents. This is in-session compaction only — do not write a handoff artifact.

## Inspect Objective and repository state

Read `objective.md`, `roadmap.md`, and the relevant `updates/` files under `.asdl/objectives/<slug>/`. Then inspect repository state: `git status --short`, the current branch, a diff against the trunk or Graphite parent when useful, and the source/test/skill/prompt/doc files relevant to the next slice.

**Tracking gate:** if material implementation progress is present but unrecorded in the Objective, stop and ask the user to run `objective-update` before continuing. If evidence is absent, ambiguous, or unrelated, proceed with a short note.

## Preview and confirm the plan

Before creating branches, committing, amending, or dispatching any subagent, present a concise **preview** and wait for explicit confirmation. The preview is conversational only — it produces no durable schema, ledger, Branch Memory record, or hidden state.

The preview must state:

- the selected Objective slug;
- whether this is one planned stack, or whether you expect to propose more work after it;
- 1–3 planned PRs/Graphite branches (default), each with one high-level thesis and why it is independently reviewable;
- slice boundaries drawn by human-legible decision count and thesis clarity — never by diff size, file count, or line count;
- expected validation for the planned work;
- expected Objective-update evidence, if meaningful progress is made;
- expected Objective state at the end of execution;
- exact stop conditions;
- a reminder that PR submission is intentionally left undone unless the user asks.

Use a compact shape:

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

Proceed only on an explicit affirmative (`yes`, `proceed`, or a clear equivalent). If the user asks for changes, revise and re-present. If the user declines, is ambiguous, or asks a question, answer or stop — do not execute.

Reviewability means one clear decision/thesis per PR or branch, not a small diff: a 1,000-file mechanical rename can be one reviewable slice, while a 20-line change that mixes unrelated decisions should be split. Use this repo's Graphite workflow instructions for every branch create, navigate, commit, amend, and restack.

## Execute one slice at a time

For each slice:

1. Confirm the user approved the latest preview; if not, stop and ask before any branch or subagent work.
2. Check the worktree, and stop if it is unsafe for a subagent launch.
3. Create, navigate to, or amend the Graphite branch via the repo's Graphite workflow.
4. Build a complete subagent prompt for exactly one focused slice (see Subagent prompt).
5. Dispatch the runner subagent with a concise title and the full prompt, then wait — launch no other subagent while it runs — and inspect the returned status, final text, diagnostics, progress, and session file.
6. Record a slice-result entry *before* interpreting completion: slice title; branch; subagent status; session file path when present; whether useful final text was returned; parent validation commands and pass/fail/skipped; Objective update recorded, if any; commit hash, if committed; blockers or ambiguity.
7. **Verify independently.** Only explicit useful final text is a return candidate, and even then confirm the work yourself with file inspection, `git diff`, and appropriate tests or checks — never trust a completion claim. For any non-final or ambiguous status, inspect diagnostics and the session file before deciding to retry, ask, or stop.
8. If meaningful progress was made and validated, run `objective-update` with evidence from the slice.
9. Commit or amend only after parent-side validation, via the Graphite workflow.
10. Decide whether to continue to the next slice or stop for user inspection.

### Subagent prompt

Every subagent prompt must carry all context the subagent needs; it cannot see yours. Include: the selected slug and a relevant narrative summary; the branch and slice goal; the exact files or areas likely relevant; explicit constraints and non-goals; the validation commands to run, or why validation should not run; and an instruction to end with final text stating outcome, changed files, validation performed and results, blockers or ambiguities, and recommended next step.

### Runner subagent statuses

- **Useful final text** — read it and verify independently (step 7).
- **Stopped without useful text, stopped without terminal result, cancelled, error, or protocol error** — inspect diagnostics and the session file before choosing to retry, ask, or stop.
- **Terminal-capture statuses such as `completed` or `blocked`** are not expected here; never treat them as completion without inspection.

## Validation

Match validation to the files changed:

- Skill-only: `dprint check skills/objective-stack-impl/SKILL.md` or `just dprint-check`.
- Pi wrapper: `just ts-check` and `just ts-test`.
- Broader readiness when practical: `just check`.

Autofix instead of hand-formatting: a dprint failure → `just dprint-fix`; relevant Python `ruff` failures → `just fix`.

## Stop and ask the user when

- Objective selection is absent or ambiguous, or the selected Objective is closed;
- material progress appears unrecorded in the Objective;
- the preview is unconfirmed, or the user requests plan changes;
- you need to plan a materially different stack than the one confirmed;
- the worktree is unsafe for branch or subagent work;
- a subagent result is non-final or ambiguous and cannot be safely interpreted;
- validation fails in a way that needs product or design input;
- all planned work is done and the only remaining action is user inspection, Objective closure, or PR submission.

## Manual recovery

There is no hidden ledger, so recover from inspectable artifacts alone: `git status`, diffs, commits, and Graphite stack state; the subagent session file paths the runner helper returned; the Objective files and updates; and this parent session transcript.

## Final response

When you hit a stop condition and are about to write the final response, read `references/final-response.md` first. It holds the runner-subagent digest-telemetry procedure (when and how to run `objective exec runner-subagent-usage`) and the exact `## Stack implementation digest` structure the final response must emit.
