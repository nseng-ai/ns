---
description: Implement an Objective as a prompt-orchestrated Graphite stack
argument-hint: "[objective-slug]"
---

# Objective Stack Implementation Orchestrator

You are the current parent Pi session. This is a current-session-only workflow:
orchestrate implementation of one asdl Objective as a small Graphite stack from
this session.

Objective argument: `$ARGUMENTS`

## Non-goals and hard boundaries

- Do not start, create, or switch to a separate parent orchestration session.
- Do not use Branch Memory (`brmem`) for stack plans, slice ledgers, handoffs,
  recovery keys, or completion records.
- Do not use stack-specific child terminal tools such as
  `stack_impl_slice_done` or `stack_impl_slice_blocked`.
- Use the generic `run_child_session_text` tool for delegated implementation
  slices.
- Run only one child session at a time in this same worktree. Do not launch
  parallel same-worktree children.
- Do not submit PRs automatically. Leave PR submission to an explicit user
  request.
- Do not invent hidden state, YAML registries, durable stack schemas, or
  deterministic parsing of freeform child text.

The parent LLM owns planning, slice selection, child prompt construction, child
result interpretation, validation, Objective updates, commits/amends, and the
decision to continue or stop.

## Resolve the Objective

1. If `Objective argument` is non-empty, treat it as the explicit Objective
   slug or path.
2. If `Objective argument` is empty, do not infer the Objective from branch
   name, changed files, package names, PR titles, or keyword matches. Run:

   ```bash
   objective list --format md
   ```

   Show the open candidates and ask the user to choose before doing
   implementation work.
3. Normalize a path such as `.asdl/objectives/<slug>` to `<slug>`.
4. If `.asdl/objectives/<slug>/closed.md` exists, stop and report that the
   selected Objective is closed.

## Compact current context first

Before planning, write a concise prose compaction of the current conversation
context:

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
- source, test, prompt, or documentation files relevant to the next slice

Tracking gate: if material implementation progress appears present but is not
recorded in the Objective, stop and ask the user to run `objective-update`
before continuing. If evidence is absent, ambiguous, or unrelated, proceed with
a short note.

## Plan a small Graphite stack in conversation

Before launching children, draft a short in-conversation stack plan:

- 1 to 3 coherent slices by default;
- one Graphite branch per slice;
- each slice independently reviewable;
- expected validation for each slice;
- expected Objective update evidence for each slice.

Use this repo's Graphite workflow instructions before creating branches,
navigating the stack, committing, amending, or restacking. Do not create a
durable stack schema or side ledger.

## Execute one slice at a time

For each planned slice:

1. Check worktree state before branch or child work. Stop if it is unsafe for a
   child launch.
2. Create, navigate to, or amend the appropriate Graphite branch using the
   repo's normal Graphite workflow.
3. Build a complete child prompt for exactly one focused implementation slice.
4. Call `run_child_session_text` with a concise `title` and the full `prompt`.
5. Wait for the child result. Do not launch another child while it runs.
6. Inspect the returned status, final text, diagnostics, progress, and
   `sessionFile`.
7. Immediately record a current-session slice result entry before interpreting
   completion. Include:

   - slice title;
   - branch;
   - child status;
   - child `sessionFile` path when present;
   - whether useful final text was available;
   - parent validation commands and pass/fail/skipped results;
   - Objective update recorded, if any;
   - commit hash if committed;
   - blockers or ambiguity.

8. Treat only `status: final-text` as a successful child-return candidate.
9. Even for `final-text`, verify the work yourself with file inspection, git
   diff, and appropriate tests or checks.
10. For any non-final or ambiguous status, inspect diagnostics and the child
    `sessionFile` before deciding whether to retry, ask the user, or stop.
11. If meaningful progress was made and validated, run `objective-update` with
    evidence from the slice.
12. Commit or amend only after parent-side validation, using the repo's
    Graphite workflow.
13. Decide whether to continue to the next slice or stop for user inspection.

## Child prompt requirements

Every child prompt must include all context the child needs. Do not rely on
hidden parent context.

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

## Interpret `run_child_session_text` statuses

- `final-text`: read the prose and verify independently. Do not blindly trust
  completion claims.
- `stopped-without-useful-text` or `stopped-without-terminal`: inspect the
  child session file and do not advance the stack until you understand what
  happened.
- `cancelled`, `error`, or `protocol-error`: stop or retry only after
  diagnosing the status, diagnostics, and session file. Record blockers if the
  child made material progress or exposed a real issue.
- Terminal-capture statuses such as `completed` or `blocked` are not expected
  for this prompt. Do not treat them as completion without inspection.

## Validation guidance

Choose validation appropriate to the files changed:

- Prompt-only changes: `dprint check .pi/prompts/objective-stack-impl.md` or
  `just dprint-check`.
- TypeScript extension changes: `cd ts/packages/pi-extensions && bun test &&
  bun run check`.
- Broader readiness when practical: `just check`.

Autofix policy:

- If dprint fails, run `just dprint-fix` instead of hand-formatting Markdown or
  TOML.
- If Python `ruff` failures appear and are relevant to the slice, use
  `just fix` before hand-editing formatter output.

## Stop and ask the user when

- Objective selection is absent or ambiguous;
- the selected Objective is closed;
- material progress appears unrecorded in the Objective;
- the worktree is unsafe for branch or child work;
- a child result is non-final or ambiguous and cannot be safely interpreted;
- validation fails in a way that needs product or design input;
- all planned work is complete and the remaining action is user inspection,
  Objective closure, or PR submission.

## Manual recovery notes

If this session or a child fails, recover manually from inspectable artifacts:

- `git status`, diffs, commits, and Graphite stack state;
- child `sessionFile` paths returned by `run_child_session_text`;
- Objective files and updates;
- the current parent session transcript.

Do not expect Branch Memory ledgers, hidden extension state, or durable stack
schemas for this v1 workflow.

## Stack implementation digest telemetry

Before the final response, use the current-session slice result list to collect
all non-empty child `sessionFile` paths.

If no child session files are available:

- do not run `objective exec child-session-usage`;
- state: `Child session usage telemetry unavailable: no child sessionFile paths
  were returned.`

If one or more child session files are available, run:

```bash
objective exec child-session-usage --format md <session-file>...
```

If the command succeeds, include its Markdown output directly when compact
enough. Otherwise, compactly transcribe the aggregate totals, model refs, and any
non-ok per-file rows.

If the command fails, include the attempted command, quote the stdout/stderr
failure text, and state that telemetry is unavailable due to command failure.

If the command reports rows such as `missing`, `not_file`, `read_error`,
`invalid_json`, or `no_usage`, keep the overall digest. Call out unavailable
child rows and trust the command aggregate for ok sessions only.

Use telemetry only for factual usage accounting: per-child and aggregate tokens,
cost, peak observed token usage, model refs, and unavailable/error statuses. Do
not use telemetry to infer child completion, code correctness, test sufficiency,
or Objective closure. Do not claim a configured context-window capacity unless
the child session logs expose it. Do not parse freeform child final text for
usage metrics.

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

| slice     | branch     | child status | session file            | validation | commit           |
| --------- | ---------- | ------------ | ----------------------- | ---------- | ---------------- |
| `<slice>` | `<branch>` | `<status>`   | `<path-or-unavailable>` | `<result>` | `<hash-or-none>` |

### What changed

- Parent-authored summary of meaningful code, prompt, test, or docs changes.
- Mention files changed only when they help the reader inspect the run.

### Validation

- `<command>` — passed/failed/skipped, with short interpretation.

### Child session usage

- Include `objective exec child-session-usage --format md ...` output, a compact
  transcription, or the explicit unavailable reason.
- Keep telemetry separate from validation evidence.

### Objective tracking

- Objective updates recorded: yes/no, with file names if known.
- Updates still needed: yes/no, with reason.

### Recommended next action

- Inspect diff / continue next slice / run objective-update / close Objective /
  ask for product decision.
- State that PR submission was intentionally left undone unless the user
  requested it.
```
