---
name: code-gt-restack-resolve
description: "Restack the current Graphite stack with conflict resolution — full stack by default like `gt restack`, downstack on request. Auto-merge mechanically-safe conflicts (verified with project checks) and escalate ambiguous ones. Use for 'restack and resolve conflicts', 'intelligent/auto restack', 'full restack', 'whole-stack restack', 'downstack restack', or a restack expected to conflict."
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
  - Read
  - Edit
  - Grep
---

# code-gt-restack-resolve

Drive a Graphite restack semi-autonomously with an explicit **scope**:
**full stack** by default, matching plain `gt restack`, or **downstack** when
the user asks for the narrower ancestors/current scope. Auto-resolve the
mechanically-safe conflicts, verify any code resolution with the project's
checks, and escalate only the genuinely ambiguous conflicts to a human with a
proposed resolution.

This skill is **prose-only** — it adds no conflict-resolution tooling. It
composes two existing skills and you should defer to them rather than duplicate
their content:

- **`graphite`** — `gt` mental model, stack navigation, and the "Recovering
  from Interrupted Rebase" section.
- **`code-resolve-merge-conflicts`** — per-file conflict-resolution mechanics,
  auto-generated-file handling, and the conflict-marker anatomy.

## When to use

- "restack and resolve conflicts", "intelligent restack", "auto restack"
- "full restack", "whole-stack restack", "include upstack", "not just downstack"
- "downstack restack", "ancestors only", "rebase up to where I am"
- A `gt restack` (full stack or downstack) that is expected to hit conflicts
- Resuming a restack that was already interrupted mid-rebase

## Scope and non-goals

- **Scope must be explicit.** Default to **full** for generic restack requests,
  matching plain `gt restack`; use **downstack** only when the user asks for the
  narrower ancestors/current scope or confirms a prompt.
- **A single-PR (or tip) stack has no scope decision.** Full and downstack
  differ _only_ by upstack descendants. When the current branch has none — a
  single-PR stack, or the current branch is the stack tip — the two scopes are
  the **identical** operation. Never prompt for scope (or for freeing upstack
  slots) in that case; just proceed as full (= downstack).
- **Full scope:** operate on the current Graphite stack as `gt restack` does
  (ancestors + current + descendants). This may rewrite upstack descendants, but
  that is the expected default for this skill.
- **Downstack scope:** operate on the chain trunk → current (ancestors +
  current). Upstack is not touched.
- **Never** `gt submit` / push / land.
- **Never** touch sibling stacks. Upstack descendants are in scope only for a
  full restack.
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

### 2. Choose scope

Set `RESTACK_SCOPE` before running any restack command.

| User intent                                                                                    | Scope            | Slot consolidation command       | Restack command          |
| ---------------------------------------------------------------------------------------------- | ---------------- | -------------------------------- | ------------------------ |
| Generic "restack and resolve", "restack", "intelligent/auto restack", or ambiguous request     | `full` (default) | `slot gt free-stack`             | `gt restack`             |
| Explicit "downstack restack", "ancestors only", "rebase up to where I am", or confirmed prompt | `downstack`      | `slot gt free-stack --downstack` | `gt restack --downstack` |

Rules:

- **Single-PR / tip stacks: never ask about scope.** _Before_ choosing scope or
  prompting, check whether any branch is stacked on top of the current one
  (`gt log short` / `gt ls` — look for children above the current `◉`). If there
  are none, full and downstack are the **same** operation: skip the scope
  question entirely and run plain `gt restack` (no `--downstack` needed — the
  result is identical). There are no upstack slots to free either, so skip the
  consolidation prompt too unless an in-scope **ancestor** is checked out in
  another slot.
- If the user did **not** explicitly ask for downstack-only behavior, default to
  `full`. When in doubt, ask — **but only when scope actually changes the
  outcome** (i.e., the current branch has upstack descendants).
- `full` means Graphite's current stack from the current branch: ancestors,
  current, and descendants (upstack). It does **not** mean every stack in the
  repo.
- Do not auto-checkout to the tip. Run the command from the user's current
  branch unless they explicitly ask to move first.

### 3. Multi-slot consolidation

In this repo a stack's branches can be checked out across multiple worktree
**slots**, which locks them against rebasing. A restack can fail when another
slot has a branch in the selected scope checked out, so consolidate only the
selected scope before looping.

If the current branch has no upstack descendants (the single-PR / tip case from
**Choose scope**), there are no upstack slots in scope — skip this step entirely
unless an in-scope **ancestor** branch is itself checked out in another slot.

The `slot gt free-stack` command is **mutating**: it releases matching slots by
detaching them at trunk. Do not treat `--format json` as a dry-run. If the user
has not already authorized freeing stack slots, ask before running it.

For downstack scope:

```bash
slot gt free-stack --downstack
```

For full scope:

```bash
slot gt free-stack
```

Use `--format json` only when you need a machine-readable record of what was
freed; the scope is still mutating. `data.downstack: true` means downstack
scope; `data.downstack: false` means full-stack slot consolidation.

Then proceed straight into the Loop.

### 4. Loop

If no rebase is currently in progress, start the restack with the command chosen
in **Choose scope**:

```bash
# downstack scope
gt restack --downstack

# full scope
gt restack
```

If a rebase is already interrupted, skip this start command and continue from
the current conflict state.

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

   - **Auto-generated files** (per `code-resolve-merge-conflicts`): accept either
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

When the selected restack command reports there is nothing left to restack:

- Run a final `git status` (clean) and `gt log` / `gt ls` to confirm a clean
  stack rooted correctly.
- Regenerate any auto-generated files that were touched (per
  `code-resolve-merge-conflicts` step 6) and stage/commit them as appropriate.

### 6. Bail-out

Stop and hand back with a summary — never `gt abort` without explicit
confirmation — if any of these occur:

- a conflict surfaces in a branch **outside the selected scope** (for example,
  an upstack branch during downstack scope, or a sibling/unrelated stack during
  any scope),
- the verification gate fails repeatedly on the same resolution,
- the repository is in an unrecognizable state you cannot safely classify.

Summarize what was resolved, what remains, and the exact command/state you
stopped at so the user (or a fresh session) can resume.
