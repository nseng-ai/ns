---
name: dev-gt-restack-resolve
description: "Restack the current Graphite stack downstack and resolve rebase conflicts intelligently — auto-merge mechanically-safe conflicts (verified with project checks) and escalate ambiguous ones. Use for 'restack and resolve conflicts', 'intelligent/auto restack', or a downstack restack expected to conflict."
metadata:
  internal: true
allowed-tools:
  - "Bash(gt *)"
  - "Bash(git status *)"
  - "Bash(git show *)"
  - "Bash(git diff *)"
  - "Bash(git add *)"
  - "Bash(git restore *)"
  - "Bash(git log *)"
  - "Bash(git rebase *)"
  - "Bash(slot gt *)"
  - "Bash(just *)"
  - "Bash(bun run *)"
  - Read
  - Edit
  - Grep
---

# dev-gt-restack-resolve

Drive a **downstack** Graphite restack semi-autonomously: auto-resolve the
mechanically-safe conflicts, verify any code resolution with the project's
checks, and escalate only the genuinely ambiguous conflicts to a human with a
proposed resolution.

This skill is **prose-only** — it adds no conflict-resolution tooling. It
composes two existing skills and you should defer to them rather than duplicate
their content:

- **`graphite`** — `gt` mental model, stack navigation, and the "Recovering
  from Interrupted Rebase" section.
- **`ns-resolve-merge-conflicts`** — per-file conflict-resolution mechanics,
  auto-generated-file handling, and the conflict-marker anatomy.

## When to use

- "restack and resolve conflicts", "intelligent restack", "auto restack"
- A downstack `gt restack` that is expected to hit conflicts
- Resuming a restack that was already interrupted mid-rebase

## Scope and non-goals

- **Downstack only.** Operate on the chain trunk → current (ancestors +
  current). Upstack is **never** touched — no auto-checkout to the tip, no
  "you're not at the tip" warning. ("Rebase up to the branch where I am.")
- **Never** `gt submit` / push / land.
- **Never** touch upstack or sibling stacks.
- **Never** `gt abort` without explicit confirmation.

## The decisive technique

Every conflict in the motivating session was the same shape: the rebase base had
**added** content while the branch's commit **edited adjacent** content, and the
fix was always a **complementary merge** — keep the base addition _and_ take the
commit's edit. The tool that makes this unambiguous:

```bash
git show <incoming-commit> -- <file>
```

This shows the **intent-diff**: what the incoming commit actually changed
relative to _its own parent_, separated from base content the commit never had.
Resolve from intent, not from raw conflict markers.

**Edit only the conflict region** to keep the chosen side(s). Do **not**
`git checkout --theirs`/`--ours` the whole file — that discards non-conflicting
base changes elsewhere in the file. (Key lesson.)

## Workflow

### 1. Preflight

- `git status` must show a **clean working tree** — a rebase cannot start dirty.
  If dirty, stop and ask the user to commit or stash first.
- Confirm the current branch is gt-tracked (it appears in `gt ls` / `gt log`;
  an untracked branch errors with a `gt track` hint).
- **If a rebase is already in progress** (`git status` shows "interactive rebase
  in progress" / "Unmerged paths"), do **not** start a new restack — jump
  straight to the **Loop** at the resolve step, following the `graphite` skill's
  "Recovering from Interrupted Rebase (Context Reset)" section.

### 2. Scope

Operate on the downstack chain (trunk → current) only. This skill always drives
`gt restack --downstack`. Upstack and sibling stacks are out of scope.

### 3. Multi-slot check

In this repo a stack's branches can be checked out across multiple worktree
**slots**, which locks them against rebasing. Before looping, find out whether
any ancestor branch is locked elsewhere:

```bash
slot gt free-stack --downstack --format json
```

The `data.downstack: true` field confirms ancestors-only scope. The reported
freed slots tell you which ancestor branches are held in another slot.

- If **no** ancestor is locked elsewhere → go straight to the Loop.
- If one or more ancestors are locked in another slot → **offer** to consolidate
  them into this slot and **confirm** with the user. On **yes**:

  ```bash
  slot gt free-stack --downstack
  ```

  Then proceed **straight** into the Loop.

### 4. Loop

Start (or resume) the restack:

```bash
gt restack --downstack
```

On each conflict, `git status` reports the stopped commit:

- "Last command done: pick `<sha>`" and the `>>>>>>> <sha>` markers identify the
  **incoming commit**.

For **each conflicted file**:

1. **Get the intent-diff:**

   ```bash
   git show <sha> -- <file>
   ```

   This is what the incoming commit truly changed vs its own parent — the
   ground truth for resolution.

2. **Classify** the conflict region against the four **safe** categories:
   - `complementary / non-overlapping` — both sides change different things in
     the region; keep both.
   - `identical` — both sides made the same change; keep one.
   - `formatting / whitespace / import-order` — purely mechanical; resolve to
     the correct mechanical form.
   - `one-side strict-superset` — one side fully contains the other; keep the
     superset.

   - **Auto-generated files** (per `ns-resolve-merge-conflicts`): accept either
     side now, regenerate after the restack completes.
   - **Edit only the conflict region** to keep the chosen side(s). Never
     `git checkout --theirs/--ours` the whole file.
   - Anything **not** in the safe set → **escalate** (see below).

3. **Verify** (only when an auto-resolved file is **code**): run the scoped
   check **before** `gt continue`:
   - `ts/**` only → `just ts-check` (optionally `just ts-test`).
   - Python only → `just ty` + targeted `uv run pytest <affected package>`
     (or `just test`).
   - Mixed / uncertain → `just check`.
   - Docs / markdown only → **no check**.

   - **Pass** → `git add` the resolved files → `gt continue`.
   - **Fail** → `git restore --merge <file>` to bring back the conflict markers,
     then **escalate** that file.

4. **Escalate** = pause and hand the decision to the user. Present:
   - both sides of the conflict region,
   - the `git show <sha>` intent-diff, and
   - a **proposed** resolution with your reasoning.

   Use AskUserQuestion or an inline prompt. On the user's decision: apply it,
   `git add`, `gt continue`, and **auto-resume** the Loop.

5. **Multi-commit branches & subsequent conflicts:** each `gt continue` may stop
   on the next commit with new conflicts — repeat this Loop per `gt continue`
   until the restack reports nothing left.

### 5. Done

When `gt restack --downstack` reports there is nothing left to restack:

- Run a final `git status` (clean) and `gt log` / `gt ls` to confirm a clean
  stack rooted correctly.
- Regenerate any auto-generated files that were touched (per
  `ns-resolve-merge-conflicts` step 6) and stage/commit them as appropriate.

### 6. Bail-out

Stop and hand back with a summary — never `gt abort` without explicit
confirmation — if any of these occur:

- a conflict surfaces in a branch **not** in the downstack chain (out of scope),
- the verification gate fails repeatedly on the same resolution,
- the repository is in an unrecognizable state you cannot safely classify.

Summarize what was resolved, what remains, and the exact command/state you
stopped at so the user (or a fresh session) can resume.
