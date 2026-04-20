---
name: dev-mem-objective-progress
description: "Progress a local-first objective-mem objective on the current branch. Resume the branch's `<slug>.md` entry in the `objectives` brmem namespace, or if none exists, carry it forward from another branch or seed it from `/Users/schrockn/code/scratch/objectives/<slug>.md`. Then implement the next unit of work and rewrite only the branch snapshot conservatively. Use when the user wants to continue a local objective, carry an objective onto a new stacked branch, or update the branch-local objective snapshot without touching GitHub."
allowed-tools:
  - "Bash(git rev-parse *)"
  - "Bash(brmem *)"
  - "Read"
  - "Write"
metadata:
  internal: true
---

<!-- INTERNAL SKILL: twerk-only. Local-first objective prototype on top of brmem. -->

# dev-mem-objective-progress

Progress a **local-first objective** from its branch-local brmem snapshot.

This skill works against exactly one active objective snapshot on the current
branch:

- namespace `objectives`, key `<slug>.md`

If the current branch has no such snapshot yet, the skill can **carry it
forward** from another branch or **seed it** from the scratch-store seed file:

- `/Users/schrockn/code/scratch/objectives/<slug>.md`

Carry-forward happens here, inside `dev-mem-objective-progress`, as a preflight
step. It does **not** happen automatically at branch-creation time.

## Goal

On the current branch:

1. resolve exactly one active objective snapshot
2. if missing, attach one by exact-copy carry-forward or global-store seeding
3. read that objective (and `plan.md`, if present)
4. implement the next unit of work
5. rewrite the branch-local objective snapshot conservatively
6. report the old/new brmem commits so prior snapshots are recoverable

## Core rules

- **Local-first only.** Do not use GitHub issues in this prototype.
- **One objective per branch.** If the current branch has multiple entries in
  the `objectives` namespace, stop and ask the user to clean up the state.
- **Current branch snapshot wins.** If the branch already has one objective
  snapshot, always resume from it. Do not reseed from the global store or copy
  from another branch on top of an existing snapshot.
- **Carry-forward is exact-copy first.** When attaching an objective onto a new
  branch, first copy the exact existing text into the current branch. Only then
  make edits.
- **Never rewrite the scratch-store file during progress.** In v0, progress
  rewrites only the branch-local snapshot in brmem.
- **Use `How to Make Progress` as a load-bearing recipe.** That section exists
  to make future progress sessions fairly mechanical. Follow it, not just the
  checklist.
- **Treat the `workbr` plan entry as the upper context frame.** If the branch
  has a `plan/plan.md` entry in the `workbr` namespace, read the objective
  first, then the plan. Do not overwrite the plan.
- **Preserve history.** Update the document conservatively and rely on brmem's
  commit history for rollback.

## Workflow

### 1. Pre-flight: confirm repo + current branch

Run:

```bash
git rev-parse --show-toplevel
git rev-parse --abbrev-ref HEAD
```

Call the branch `<branch>`.

Abort if:

- not in a git repo
- the current branch is detached (`HEAD`)

### 2. Inspect current-branch brmem state

List current-branch objectives entries:

```bash
brmem list --namespace objectives
brmem check plan/plan.md --namespace workbr
```

`--branch` is omitted so the current branch is used implicitly.

From that output, compute:

- `objective_entries` = entries returned by `brmem list --namespace objectives`
- `has_plan` = whether `brmem check plan/plan.md --namespace workbr` exits `0`
  (`1` means no such entry; `2` is a validation / command failure — abort)

Decision rules:

- **0 objective entries** → continue to step 3 (attach / carry mode)
- **1 objective entry** → that is the active branch snapshot; continue to
  step 4
- **2+ objective entries** → abort; this prototype allows only one active
  objective per branch

### 3. Attach / carry mode (only when the current branch has no objective)

If the current branch has no entries in the `objectives` namespace, do
**not** guess. Resolve the source explicitly.

Supported sources:

#### 3a. Carry forward from another branch

Use this when the user wants to continue an in-flight objective from a parent or
source branch.

Resolution rules:

- If the user names both a source branch and a slug, require that the source
  branch contain the entry `(objectives, <slug>.md)`.
- If the user names only a source branch, inspect it with:

  ```bash
  brmem list --namespace objectives --branch <source-branch>
  ```

  - **0 matches** → abort; the source branch has no objective snapshot
  - **1 match** → use it
  - **2+ matches** → abort; source branch is invalid for v0

Then fetch the source objective:

```bash
brmem get <slug>.md --namespace objectives --branch <source-branch>
```

Write that exact content to a temp file and attach it to the current branch:

```bash
brmem put <slug>.md --namespace objectives --file <temp-file>
```

This exact-copy attach is the moment the child branch receives its own
speculative snapshot.

#### 3b. Seed from the scratch-store seed file

Use this when the user names a slug and wants to start from the canonical local
seed instead of another in-flight branch.

Read:

```text
/Users/schrockn/code/scratch/objectives/<slug>.md
```

Then attach that exact text to the current branch as:

```bash
brmem put <slug>.md --namespace objectives --file <temp-file-or-store-file>
```

#### 3c. If neither source branch nor slug is available

Ask the user. Do not infer from recent history, commit trailers, or branch
naming in v0.

### 4. Load the active context

Read the active branch snapshot:

```bash
brmem get <slug>.md --namespace objectives
```

If the `workbr` plan entry exists on the branch, also read it:

```bash
brmem get plan/plan.md --namespace workbr
```

Read the objective before the plan.

Interpret the objective shape as:

- intro paragraph(s) = context / why this objective exists
- `## Completion Criteria` = definition of done
- `## Status Checklist` = evolving roadmap / progress surface
- `## How to Make Progress` = the mechanical recipe for future sessions
- `## Notes` = durable findings, constraints, and pointers

If the file shape is badly malformed, read
`../dev-mem-objective-create/references/objective-template.md` to understand the
intended structure, but preserve the existing document rather than regenerating
it from scratch.

### 5. Assess the codebase and choose the next unit

Use the objective as the main guide.

When deciding what to do next:

- prefer the first unchecked checklist item that matches the `How to Make
  Progress` recipe
- use the plan as the immediate execution frame if `plan.md` exists
- keep the unit of work coherent and landable for a single session
- if the choice is non-obvious, tell the user which item you plan to take and
  why before implementing

### 6. Implement

Do the work on the current branch using normal tooling.

### 7. Rewrite the branch snapshot conservatively

Before writing, capture the old snapshot commit if one exists:

```bash
brmem check <slug>.md --namespace objectives
```

Then update the objective document **without rewriting it from scratch**.

Section-by-section rules:

- **Title**: do not rename unless the user explicitly asks.
- **Status line**: may update (`in progress`, `blocked`, `done`).
- **Context paragraph(s)**: clarify or append small updates only; do not replace
  wholesale.
- **Completion Criteria**: check boxes or add brief evidence notes; do not
  casually delete or rewrite them.
- **Status Checklist**:
  - check completed items
  - add newly discovered follow-up items near the affected section
  - split items when the work turns out to be more granular than expected
  - keep completed items visible; do not erase progress history
- **How to Make Progress**: edit only when the actual work recipe has changed,
  not just because one checklist item finished.
- **Notes**:
  - append findings, constraints, and useful pointers
  - prefer striking or annotating obsolete notes instead of silently deleting
    them

If the objective lacks a `## Notes` section and you discovered something worth
preserving, add one.

### 8. Persist the updated snapshot

Write the updated text to a temp file, then store it back to the same brmem
key:

```bash
brmem put <slug>.md --namespace objectives --file <temp-file>
```

Capture the new commit SHA.

### 9. Report

Summarize:

- which objective slug you used
- whether the session resumed, carried forward from another branch, or seeded
  from the scratch store
- what work was implemented
- what changed in the objective snapshot
- old snapshot commit SHA (if available)
- new snapshot commit SHA
- recovery hint:

```text
Recover the prior snapshot with:
brmem get <slug>.md --namespace objectives --at <old-sha>
```

## Edge cases

- **Detached HEAD** → abort.
- **Current branch has multiple objective snapshots** → abort.
- **Current branch has no objective and the user gave no explicit source** → ask
  the user to provide a source branch or slug.
- **Source branch has multiple objective snapshots** → abort; do not guess.
- **Source branch has no objective snapshot** → abort.
- **Scratch-store file for the slug does not exist** → abort.
- **Current branch already has an objective snapshot and the user asks to carry
  another one on top** → refuse; do not clobber an existing branch snapshot.
- **`workbr` plan entry exists** → read it after the objective; leave it
  untouched.

## Anti-patterns

- Updating `/Users/schrockn/code/scratch/objectives/<slug>.md` during progress.
- Reconstructing the objective from memory or from the original user brief when
  a real snapshot already exists.
- Copying only pieces of an objective onto a child branch instead of exact-copy
  carry-forward.
- Rewriting the whole objective document and accidentally dropping checked items
  or preserved notes.
- Silently deleting notes or completed checklist items.
- Guessing the objective source when the branch has none.
