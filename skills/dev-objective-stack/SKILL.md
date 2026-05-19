---
name: dev-objective-stack
description: "Draft workflow for implementing one checked-in asdl Objective as a Graphite PR stack. Use when the user wants to split an Objective into PRs/branches, implement an Objective as a stack, include Objective updates in each PR, create branch handoffs for clean context, or refine/finalize this draft workflow after trying it."
metadata:
  internal: true
---

<!-- INTERNAL DRAFT SKILL: asdl-only. -->

# dev-objective-stack

Implement exactly one checked-in Objective as an ordered Graphite stack where each
PR contains both implementation changes and the Objective update that would be
true after that PR lands.

This is a draft skill. After the workflow stabilizes, audit and rename or
finalize it according to `ns-skill-management`.

## Load with

- `objective` for Objective vocabulary and selection rules.
- `objective-current` to read the selected Objective before planning.
- `objective-update` for each per-PR Objective update.
- `objective-close` only when the user chooses to close a complete Objective.
- `graphite` for stack branch mechanics.
- `branch-handoff` when creating or recovering branch/session handoffs.
- `ns-skill-management` and `ns-skill-audit` when editing or finalizing this skill.

## When to stop and ask

- No explicit Objective slug/path was provided and Objective selection is needed.
- The user wants multiple Objectives in one stack.
- The stack base is ambiguous or not what `gt ls`/`gt branch info` shows.
- Objective scaffold/base work exists on a branch, but the user has not confirmed
  whether the implementation stack should build on it.
- The proposed split cannot make each PR pass validation independently.
- The user asks to submit/push but has not confirmed that intent for this run.
- Objective evidence is too ambiguous for a landed-state update.

## Core invariants

- One Objective only: `.asdl/objectives/<slug>/`.
- One ordered branch per PR slice.
- Each PR branch includes its own Objective update under that Objective directory.
- Treat Objective edits with landed-state semantics: if this PR merged now, the
  Objective files on trunk should already be accurate.
- Use Graphite (`gt`) for branch creation, amendment, navigation, restacking, and
  submission unless an operation cannot be expressed in `gt`.
- Store a branch handoff after each slice so a later clean context can resume the
  branch without rereading the full conversation.
- Keep handoffs concise and factual; do not store secrets, logs, or generated output.

## Workflow

### 1. Select and read the Objective

1. Use the explicit slug/path if the user provided one.
2. If absent, run `objective list --state open --format md` and ask the user to choose.
3. Run `objective exec read-objective <slug> --format md`.
4. Stop if the Objective is closed unless the user explicitly says to amend it.
5. Note missing required files, especially `updates/`, before planning repairs or updates.

### 2. Inspect stack state

Run:

```bash
git status --short
gt branch info
gt ls
```

Decide and state the stack base. If the current branch is an existing Objective
scaffold branch, treat it as the base only when the user confirms that the new
implementation stack should build on it.

### 3. Draft the stack plan

Split the remaining Objective roadmap into small independently reviewable slices.
Prefer 3-6 PRs; choose more when the registry, CLI, tests, or Objective update
surface would otherwise blur together.

For each slice, name:

- branch: `<objective-slug>/<short-slice-name>`
- parent branch/ref
- implementation scope
- tests/validation to run
- Objective files expected to change
- Semantic Update title
- Branch Memory handoff key: `handoffs/<objective-slug>-pr<N>-<short-slice-name>.md`
- non-Objective tracking files expected to change, such as workflow notes, or `none`

Use this compact shape in the user-facing plan:

```markdown
## PR <N> — <title>

Branch: `<branch>`
Parent: `<parent>`
Code: <implementation scope>
Objective update: <roadmap/narrative/update-file changes>
Tracking: <non-Objective tracking files or none>
Validation: `<command>`
Handoff: `<key>`
```

Ask for confirmation before implementing when the split, base, or submission
intent is not already explicit.

### 4. Implement each PR slice

For each slice, work from the parent/top-of-stack branch:

1. Start with a clean tree or explain existing changes.
2. Reconcile the slice plan against behavior already landed in earlier branches.
   If an earlier clean design implemented later planned behavior, narrow later
   slices to evidence, coverage, or follow-up work instead of forcing the
   original boundary.
3. Implement only this slice's code and tests.
4. Run targeted tests as soon as meaningful. For CLI scenario tests, choose
   inputs that exercise the intended layer: parser behavior, domain validation,
   or both.
5. Update the selected Objective using `objective-update` semantics:
   - edit `roadmap.md` when status/order changes;
   - mark roadmap items by actual landed behavior, not by the original PR plan;
   - edit `objective.md` when durable scope, risks, assumptions, or questions change;
   - write one timestamped Semantic Update for meaningful progress.
6. Update any planned non-Objective tracking files for workflow lessons or
   durable coordination notes.
7. Run validation for the slice. If `just` reports lint/format failures, use the
   repo autofix recipes (`just fix` or `just dprint-fix`) before hand-editing.
8. Stage relevant files.
9. Create or amend the Graphite branch:
   - new slice: `gt create <branch> -m "<subject>"`
   - existing slice: `gt modify -m "<subject>"`
10. Verify `gt ls`, `git status --short`, and a diff/stat against the parent.
    When the slice adds new files, include staged stats or an explicit file
    inventory; unstaged `git diff --stat` omits untracked files.
11. Store the handoff for the branch with `branch-handoff`.

Do not advance to the next slice until the current branch validates and has a
handoff.

### 5. Handoff content

Each branch handoff should include:

- selected Objective slug and branch name;
- parent branch/ref;
- what this PR changes;
- Objective files updated and Semantic Update filename;
- validation command and result;
- known follow-ups or risks for downstream PRs;
- useful files/commands for resuming.

### 6. Submit or stop

Default: stop with local stack summary unless the user asked to submit.

If the final branch appears to complete the roadmap, ask whether to close the
Objective with `objective-close`, leave it open for review, or create a follow-up
slice. Do not create `closed.md` or otherwise close the Objective implicitly.

If submitting:

1. Verify the stack root with `gt ls`.
2. Run final validation from the top branch.
3. Use `gt submit --no-interactive`.
4. If PR descriptions need editing, use `gh pr edit --body-file`; never inline
   complex markdown in a shell heredoc.

## Verification

Before reporting success:

- `git status --short` is clean or intentionally contains only uncommitted work
  the user asked to leave out.
- `gt ls` shows the expected stack order.
- Each branch has a Branch Memory handoff under `session-artifacts`.
- New files are reflected in staged stats or an explicit file inventory.
- Objective changes are only under `.asdl/objectives/<slug>/`.
- Each Semantic Update filename is timestamped and human-readable.
- Validation commands and failures/fixes are reported honestly.
