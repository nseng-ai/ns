---
name: code-gt-restack-resolve
description: "Restack the current Graphite stack with conflict resolution — full stack by default like `gt restack`, downstack on request. Auto-merge mechanically-safe conflicts (verified with project checks) and escalate ambiguous ones. Use for 'restack and resolve conflicts', 'intelligent/auto restack', 'full restack', 'whole-stack restack', 'downstack restack', or a restack expected to conflict."
model: opus
context: fork
allowed-tools:
  - "Bash(gt *)"
  - "Bash(git status *)"
  - "Bash(git show *)"
  - "Bash(git diff *)"
  - "Bash(git add *)"
  - "Bash(git restore *)"
  - "Bash(git checkout --ours *)"
  - "Bash(git checkout --theirs *)"
  - "Bash(git log *)"
  - "Bash(git rebase *)"
  - "Bash(git commit *)"
  - "Bash(slot gt *)"
  - "Bash(just *)"
  - "Bash(uv run pytest *)"
  - Read
  - Edit
  - Grep
---

# code-gt-restack-resolve

Drive a Graphite restack semi-autonomously with an explicit **scope**:
**full stack** by default, matching plain `gt restack`, or **downstack** when
the user asks for the narrower ancestors/current scope.

This skill is a **driver**: it owns the restack workflow — preflight, scope,
slot consolidation, starting the loop, and gt-specific bail-outs. All
per-conflict resolution policy lives in the engine skill,
**`code-resolve-merge-conflicts`**
(`skills/code-resolve-merge-conflicts/SKILL.md`). At every conflict stop, read
that document and follow it with the **Engine parameters** below. Do not
restate or improvise per-file resolution policy here.

It also defers to **`graphite`** for the `gt` mental model, stack navigation,
and the "Recovering from Interrupted Rebase" section.

## Engine parameters

When the engine's Driver contract asks for overrides, use:

- **Continue command:** `gt continue`
- **Extra bail-out condition:** a conflict surfaces in a branch **outside the
  selected scope** (an upstack branch during downstack scope, or a
  sibling/unrelated stack during any scope)
- **Post-completion checks:** `gt log` / `gt ls` confirm a clean stack rooted
  correctly

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
- **A single-PR (or tip) stack has no scope decision** — full and downstack
  differ only by upstack descendants. See the single-PR rule in **Choose
  scope**.
- **Full scope:** operate on the current Graphite stack as `gt restack` does
  (ancestors + current + descendants) — not every stack in the repo. This may
  rewrite upstack descendants, but that is the expected default for this skill.
- **Downstack scope:** operate on the chain trunk → current (ancestors +
  current). Upstack is not touched.
- **Never** `gt submit` / push / land.
- **Never** touch sibling stacks. Upstack descendants are in scope only for a
  full restack.
- **Never** `gt abort` without explicit confirmation (engine abort policy).

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
- When in doubt, ask — **but only when scope actually changes the outcome**
  (i.e., the current branch has upstack descendants).
- Do not auto-checkout to the tip. Run the command from the user's current
  branch unless they explicitly ask to move first.

### 3. Multi-slot consolidation

In this repo a stack's branches can be checked out across multiple worktree
**slots**, which locks them against rebasing. A restack can fail when another
slot has a branch in the selected scope checked out, so run the slot
consolidation command from the **Choose scope** table before looping.

If the current branch has no upstack descendants (the single-PR / tip case from
**Choose scope**), skip this step entirely unless an in-scope **ancestor**
branch is itself checked out in another slot.

The `slot gt free-stack` command is **mutating**: it releases matching slots by
detaching them at trunk — `--format json` is a machine-readable record of what
was freed, not a dry-run. If the user has not already authorized freeing stack
slots, ask before running it.

### 4. Loop

If no rebase is currently in progress, start the restack with the command
chosen in **Choose scope**. If a rebase is already interrupted, skip the start
command and continue from the current conflict state.

**On each conflict stop**, read
`skills/code-resolve-merge-conflicts/SKILL.md` and follow its workflow with the
**Engine parameters** above. The engine handles everything per-conflict:
auto-generated files, the intent-diff, safe-category classification,
region-only edits, the verification gate, conflict-marker sweep, escalation,
and running `gt continue`.

Each `gt continue` may stop on the next commit with new conflicts — the engine
loops per conflict until the selected restack command reports nothing left.

### 5. Done

When the selected restack command reports there is nothing left to restack:

- Run a final `git status` (clean) and `gt log` / `gt ls` to confirm a clean
  stack rooted correctly.
- Regenerate any auto-generated files that were touched (per
  `code-resolve-merge-conflicts` step 7) and stage/commit them as appropriate.
- For a **full-scope** restack, run a final scoped verification from the stack
  tip after the restack completes, at least when any conflict was resolved
  mid-stack. This covers upstack branches that replayed without conflicts but
  now sit atop resolved code. Use the same categories as the Loop verification
  gate:
  - `ts/**` only → `just ts-check` (optionally `just ts-test`).
  - Python only → `just ty` + targeted `uv run pytest <affected package>`
    (or `just test`).
  - Mixed / uncertain → `just check`.
  - Docs / markdown only → **no check**.

### 6. Bail-out

The engine's bail-out policy applies, plus this driver's extra condition from
**Engine parameters** (a conflict outside the selected scope). Summarize per
the engine: what was resolved, what remains, and the exact command/state you
stopped at.
