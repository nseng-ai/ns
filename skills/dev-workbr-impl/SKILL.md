---
name: dev-workbr-impl
description: "Pick up a plan stashed in branch memory (brmem) and begin implementing it. Detects the current branch, fetches `plan.md` from `refs/brmem/brs/<branch>` via `brmem get`, surfaces the plan as the active session spec, and begins implementation using normal tooling. Companion to `dev-workbr-create`, which stashes the plan in the first place. Use when the user opens a fresh worktree on a workbr (a branch prepared ahead of time with a plan in brmem) and wants to start work — phrases like 'load the workbr plan', 'pick up the stashed plan', 'implement the workbr', or simply running this in a worktree whose branch was set up by `dev-workbr-create`."
allowed-tools:
  - "Bash(brmem get *)"
  - "Bash(git rev-parse *)"
  - "Bash(git branch *)"
  - "Read"
metadata:
  internal: true
---

<!-- INTERNAL SKILL: twerk-only. References brmem CLI, a twerk-core primitive. -->

# dev-workbr-impl

Companion to `dev-workbr-create`. Run from a fresh worktree whose
branch was prepared by `dev-workbr-create` (the "workbr" — a branch
with a plan stashed in brmem, ready to be picked up). This skill
fetches the plan, surfaces it as the active session spec, and hands
off to normal implementation.

## Goal

In the current worktree:

1. Identify the current branch (the brmem key).
2. Read `plan.md` from `refs/brmem/brs/<branch>` via `brmem get`.
3. Surface the plan to the session as the active spec.
4. Begin implementing against the plan using normal tooling.

Responsibility of this skill ends at "the plan is loaded and
implementation has begun." The skill's job is the hand-off, not to
implement the plan programmatically.

## Core rules

- **The plan lives in brmem.** Do not write `plan.md` to the working
  tree. The plan stays attached to the branch as metadata; the tree
  and the PR diff remain clean. If the user later wants a local copy
  they can run `brmem get plan.md > plan.md` themselves.
- **Use `brmem get` with the current branch implicitly.** Do not
  guess branch names or pass `--branch` unless debugging — `brmem
  get` uses the current branch by default and that's exactly what we
  want.
- **Do not delete the brmem entry after implementing.** Brmem
  preserves history and leaving the plan attached to the branch is a
  feature: anyone inspecting the branch later can read the original
  spec.
- **Plan is authoritative.** Follow the plan verbatim unless the
  user explicitly amends it in the session. Do not re-plan silently.

## Workflow

### 1. Detect the current branch

```
git rev-parse --abbrev-ref HEAD
```

Call the result `<branch>`. If the output is `HEAD` (detached),
abort with a clear error — brmem keys are branch names, and a
detached worktree doesn't have one. Tell the user to check out the
workbr branch first.

### 2. Fetch the plan

```
brmem get plan.md
```

This uses the current branch implicitly, so no `--branch` flag is
needed.

On a missing brmem entry, `brmem get` emits a `branch_memory_missing`
error that already points the user at
`git ls-tree -r refs/brmem/brs/<branch>` for inspection. Surface
that error verbatim and stop. **Do not guess alternate paths** (no
retrying `plan-<slug>.md`, `PLAN.md`, etc.) — if the key isn't
`plan.md`, the branch wasn't set up by `dev-workbr-create` and the
user needs to fix their state, not have the skill paper over it.

### 3. Surface the plan

Print the plan contents to the session and acknowledge it as the
active spec for the remainder of the session. Do not write a copy to
the working tree.

### 4. Begin implementing

Hand off to normal implementation tooling (Edit, Write, Bash, etc.)
and start executing the plan. This skill does not over-scope its own
`allowed-tools`: regular implementation uses whatever tools the
session already has available.

Treat this step like any other plan-driven implementation session:

- Work through the plan in order.
- Commit incrementally.
- Follow any `## Self-destruct` or "final commit must do X"
  instructions in the plan itself (the plan may, for example,
  instruct a final commit to delete its own record — but that's the
  _plan's_ instruction, not something this skill imposes).

## Edge cases

- **Detached HEAD** → abort per step 1.
- **Wrong worktree** — running on a branch that was not prepared by
  `dev-workbr-create`. `brmem get` will return
  `branch_memory_missing`; surface the error and stop.
- **Brmem entry exists under a different path** (e.g., the user
  stashed `spec.md` manually instead of using the skill). The
  `branch_memory_missing` error already suggests `git ls-tree -r
  refs/brmem/brs/<branch>`; if the user's tree inspection shows a
  different filename, they can either rename via a one-shot `brmem
  put` + direct ref munging, or invoke this skill only after fixing
  the entry. Do not silently fetch alternate filenames.
- **Plan content changed since stashing** — that's normal. The brmem
  ref's history preserves prior versions; `brmem get plan.md` always
  returns the latest. If the user wants a prior version, they use
  `brmem get plan.md --at <sha>` explicitly.

## Anti-patterns

- Writing `plan.md` to the working tree and committing it — that's
  what the sibling `dev-plan-to-branch` skill does. This variant
  keeps the plan out of the tree on purpose.
- Deleting the brmem entry after implementing. Brmem is
  history-preserving; leaving the plan attached to the branch is a
  feature.
- Running this skill in the original stashing worktree (current
  branch ≠ stashed branch). `brmem get` would return a different
  branch's plan or error out. Always run from a checkout of the
  workbr branch — however that checkout was created.
- Retrying `brmem get` with guessed alternate paths on a missing
  entry.
- Treating the plan as a suggestion. Unless the user amends it in
  the session, it's the spec.
