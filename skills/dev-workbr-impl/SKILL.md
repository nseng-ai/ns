---
name: dev-workbr-impl
description: "Pick up a plan stashed in branch memory (brmem) and begin implementing it. Detects the current branch, fetches the `plan/plan.md` brmem entry in the `workbr` namespace via `brmem get plan/plan.md --namespace workbr`, surfaces the plan as the active session spec, and begins implementation using normal tooling. Companion to `dev-workbr-create`, which stashes the plan in the first place. Use when the user opens a fresh worktree on a workbr (a branch prepared ahead of time with a plan in brmem) and wants to start work — phrases like 'load the workbr plan', 'pick up the stashed plan', 'implement the workbr', or simply running this in a worktree whose branch was set up by `dev-workbr-create`."
allowed-tools:
  - "Bash(brmem get *)"
  - "Bash(brmem check *)"
  - "Bash(brmem list *)"
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

1. Identify the current branch (the `branch` field of the entry).
2. Read the `plan/plan.md` entry in the `workbr` namespace via
   `brmem get plan/plan.md --namespace workbr`.
3. Surface the plan to the session as the active spec.
4. Begin implementing against the plan using normal tooling.

Responsibility of this skill ends at "the plan is loaded and
implementation has begun." The skill's job is the hand-off, not to
implement the plan programmatically.

## Core rules

- **The plan lives in brmem.** The plan is the `plan/plan.md` entry
  in the `workbr` namespace — one ref, one blob. Do not write
  `plan.md` to the working tree. The plan stays attached to the
  branch as metadata; the tree and the PR diff remain clean. If the
  user later wants a local copy they can run
  `brmem get plan/plan.md --namespace workbr > plan.md` themselves.
- **`--namespace workbr` is required.** Every brmem call in this
  skill passes that flag along with the positional key
  `plan/plan.md`. `--branch` is omitted so `brmem` resolves the
  current branch implicitly — that's exactly what we want.
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
abort with a clear error — workbr entries are keyed in part by
branch name, and a detached worktree doesn't have one. Tell the
user to check out the workbr branch first.

### 2. Probe for the workbr entry

```
brmem check plan/plan.md --namespace workbr
```

`--branch` is omitted so the current branch is resolved implicitly.
Branch on the grep-style exit code:

- `0` → entry exists; continue to step 3 and fetch.
- `1` → no workbr entry on this branch. Abort with a clear error:
  "no stashed workbr plan on this branch; was this worktree opened
  on a branch prepared by `dev-workbr-create`?". Do not fall back
  to `brmem get`.
- `2` → invalid invocation or command failure (e.g., detached HEAD
  slipped past step 1, or `brmem` rejected something). Abort and
  surface the command's stderr so the user can diagnose.

### 3. Fetch the plan

```
brmem get plan/plan.md --namespace workbr
```

`--branch` is omitted on purpose so the current branch is resolved
implicitly.

After a successful step 2 this call should always succeed; a
`branch_memory_missing` error here means the key `plan/plan.md` has
no blob on this branch even though step 2 reported otherwise —
surface the error verbatim and stop. **Do not guess alternate keys**
(no retrying `plan-<slug>.md`, `PLAN.md`, etc.) — if the key isn't
`plan/plan.md`, the branch wasn't set up by `dev-workbr-create` and
the user needs to fix their state, not have the skill paper over
it. Point them at `brmem list --namespace workbr` to see what keys
are actually attached to the branch.

### 4. Surface the plan

Print the plan contents to the session and acknowledge it as the
active spec for the remainder of the session. Do not write a copy to
the working tree.

### 5. Begin implementing

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

- **Detached HEAD** → abort per step 1. `brmem check` will also
  exit `2` in this state, so step 2 catches it as a backstop.
- **Wrong worktree** — running on a branch that was not prepared by
  `dev-workbr-create`. `brmem check plan/plan.md --namespace workbr`
  will exit `1` in step 2; surface the "no stashed workbr plan"
  abort message and stop. For manual inspection, point the user
  at:

  ```
  brmem list --namespace workbr
  git show refs/brmem/ns/workbr/<encoded-branch>:plan/plan.md
  ```

- **Entry exists under a different key** (e.g., the user stashed
  under `spec.md` manually instead of using the skill). Step 2
  exits `1` for `plan/plan.md`. Surface the "no stashed workbr
  plan" message and point the user at
  `brmem list --namespace workbr` to discover the actual keys on
  the branch. Do not silently fetch alternate keys.
- **Plan content changed since stashing** — that's normal. The brmem
  ref's history preserves prior versions;
  `brmem get plan/plan.md --namespace workbr` always returns the
  latest. If the user wants a prior version, they use
  `brmem get plan/plan.md --namespace workbr --at <sha>` explicitly.

## Anti-patterns

- Writing `plan.md` to the working tree and committing it — that's
  what the sibling `dev-plan-to-branch` skill does. This variant
  keeps the plan out of the tree on purpose.
- Deleting the brmem entry after implementing. Brmem is
  history-preserving; leaving the plan attached to the branch is a
  feature.
- Running this skill in the original stashing worktree (current
  branch ≠ stashed branch). Step 2 would either exit `1` (clean
  miss) or, worse, exit `0` if the original branch coincidentally
  has a workbr entry and then step 3 would return a different
  branch's plan. Always run from a checkout of the workbr branch —
  however that checkout was created.
- Retrying `brmem get` with guessed alternate keys on a missing
  entry, or retrying `brmem check` with guessed namespace/key
  values.
- Treating the plan as a suggestion. Unless the user amends it in
  the session, it's the spec.
