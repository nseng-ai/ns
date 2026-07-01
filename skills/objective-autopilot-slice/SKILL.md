---
name: objective-autopilot-slice
disable-model-invocation: true
description: Implement exactly one Objective slice as the child role inside the objective-autopilot-workflow Workflow, then hand an uncommitted result back to the parent. Use only when invoked by that Workflow's Slice phase with an explicit Objective slug and starting branch; not for standalone Objective work.
---

# objective-autopilot-slice

You are the **child** in one iteration of the `objective-autopilot-workflow` Workflow. The parent
script owns the loop, the keep/reject decision, and every git write (verify, stage, commit,
submit) through the separate deterministic `sdl objective exec autopilot-land-slice` verb — it
never trusts your prose, only the report block this skill tells you to return. Your job is narrow:
find and implement exactly one coherent slice for the given Objective, then stop and report.

Part of the Objective skill family. Use the `objective` umbrella skill first for shared
vocabulary, selection rules, storage model, and safety boundaries; this step is self-contained for
its own happy path.

## Inputs

Your invoking prompt names an explicit Objective slug and a starting branch. Both are already
resolved — do not use `sdl objective list` to pick a different Objective, and do not infer the
slug from branch names, changed files, or conversation history.

## Hard boundaries

- Work on exactly one Objective slug: the one named in your prompt. Never auto-select or switch to
  a different Objective, even if `objective-next` surfaces other candidates.
- Implement exactly one coherent slice. Do not chain multiple slices in one invocation.
- Never commit, amend, stage, push, submit a PR, or restack Graphite yourself. Leave all changes
  uncommitted in the worktree. The parent's `autopilot-land-slice` verb owns commit/submit and
  independently re-verifies live git state before doing either — it does not read your prose.
- Never invoke `sdl objective exec autopilot-preflight` or `sdl objective exec
  autopilot-land-slice` yourself; those are the parent's verbs.
- Do not create a Workflow, spawn further subagents, or otherwise recurse into the autopilot
  driver.

## Steps

1. Run the `objective-next` workflow for the given slug only (never a different Objective).
   - If it stops, asks a human a question, finds no substantive work, or reports the Objective is
     ready to close: do not implement anything. Report `status: "stop"` with a one-line
     `stopReason` describing what `objective-next` said.
2. If `objective-next` recommends concrete work, follow the repo's `branch-context-from-plan`
   workflow to create a saved implementation plan and a branch-context-backed implementation
   branch off the starting branch you were given.
3. Implement exactly the plan's slice on that branch. Keep the diff to one coherent slice; do not
   expand scope beyond what the plan settled.
4. Run the validation the plan calls for (or the repo's default validation for the changed files).
   If validation fails and you cannot recover it locally within this slice, stop implementing
   further and report `status: "failed"` with `stopReason` describing what failed.
5. If material progress was made, record a Semantic Update under `.sdl/objectives/<slug>/` via the
   repo's `objective-update` workflow.
6. Leave every change uncommitted. Do not run `git commit`, `git add` beyond what your editor
   tooling stages incidentally, `gt modify`, `gt submit`, or any push/restack command.
7. Report a structured result (see below). Do not add commentary outside the fields the schema
   requests — the parent reads only the schema-validated fields, never your prose.

## Report contract

Return a structured report with these fields:

- `status`: `"ready"` when a slice was implemented and validated and is ready for the parent to
  verify/commit; `"stop"` when `objective-next` found no safe work to do; `"failed"` when you
  attempted a slice but validation could not be made to pass.
- `branch`: the implementation branch you worked on (only meaningful for `status: "ready"`).
- `recommendedSlice`: one-line summary of the slice implemented.
- `changedFiles`: best-effort list of files you touched. The parent independently inspects live
  git status and does not trust this list for the commit boundary — it exists for the summary and
  PR description only.
- `validation`: list of `<command>: passed|failed|skipped <short reason>` entries.
- `commitMessage`: a suggested commit subject for the parent to use if it lands this slice.
- `prTitle` / `prBodySummary`: suggested PR title and a short markdown-safe body summary, used only
  if the parent submits.
- `stopReason`: required when `status` is `"stop"` or `"failed"`; omit otherwise.

## Stop conditions

- `objective-next` cannot resolve safe work for the given slug (ambiguous selection, closed
  Objective, unrecorded material progress that needs `objective-update` first, or no candidates).
- The plan or its scope is ambiguous or internally inconsistent.
- Validation fails and cannot be recovered within this slice.
- Any step would require committing, submitting, pushing, or restacking — that is always the
  parent's job, never yours.

In every stop case, report the structured result above with `status: "stop"` or `"failed"` and a
concrete `stopReason`; do not silently return prose instead of the report.
