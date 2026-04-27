---
name: objective-current
description: 'Read-only "where am I?" digest for the current branch and its graphite stack. Renders the current branch''s claimed objective + freshness, PR, brmem entries, the trunk-first downstack walk, and immediate upstack children. Use after returning to a session to gain bearings without running six commands and stitching the output together.'
allowed-tools:
  - "Bash(objective exec current *)"
---

# objective-current

Read-only orientation digest for the branch you just landed on.

> For shared concepts — vocabulary, storage model, content anatomy, lifecycle,
> carry-forward semantics, and mutation contracts — see
> `../objective/SKILL.md`.

## Goal

After stepping away from a branch for a while, returning means re-deriving
which branch you're on, what objective is claimed there, whether the
snapshot is stale, what brmem context has been parked, whether there's a
PR, and what the rest of the stack looks like. `objective-current` answers
all of that in one shot. It is the orientation sibling of `objective-next`
(slice planning for one objective on the current branch) and
`objective-digest` (cross-branch digest of one objective).

## Inputs

None. The skill operates on the current working directory only.

## Core Rules

- **Read-only.** Never mutate brmem, git refs, branches, or the working
  tree.
- **Single command.** Call `objective exec current --format json` once and
  render the locked Markdown below from its output. Do not run `gt`,
  `git`, `gh`, or `brmem` directly.
- **No semantic judgment.** Do not summarize objective prose
  (`objective-digest` does that), do not pick a "next" slice
  (`objective-next` does that), and do not interpret obj_state beyond
  surfacing the value.

## Workflow

### 1. Gather

```bash
objective exec current --format json
```

The payload shape (locked):

```jsonc
{
  "current_branch": "<name>" | null,         // null on detached HEAD
  "detached_head": false,
  "trunk": "<trunk>",
  "is_trunk": false,
  "current": {                                // null on detached HEAD
    "branch": "<name>",
    "objective": {                            // null when no slug claimed
      "slug": "<slug>",
      "obj_state": "fresh" | "stale",
      "body_last_touched": "<ISO>" | null,
      "branch_head_iso": "<ISO>" | null,
      "branch_max_author_iso": "<ISO>" | null  // drives obj_state; restack-resilient
    },
    "objectives_extra": ["<slug2>", ...],
    "pr": { "number": 833, "state": "OPEN", "title": "...", "url": "..." } | null,
    "pr_error": "<stderr>" | null,
    "brmem": [
      { "namespace": "objectives" | null, "key": "<key>", "size": 4123, "preview": "<first 80 chars>" }
    ]
  } | null,
  "downstack": [ /* ordered trunk-first → parent of current; includes trunk */ ],
  "upstack":   [ /* immediate children of current; no recursion */ ],
  "warnings": ["..."]
}
```

Each `downstack` / `upstack` entry mirrors `current` minus the brmem
listing and adds a `deleted: bool` flag (true when graphite tracks the
branch but the local ref is gone).

### 2. Render

Output exactly the following Markdown structure. Headers, table columns,
and ordering are locked — do not re-order or add sections.

```markdown
# On `<current_branch>`

**Objective:** `<slug>` — <obj_state> · body last touched <ISO>
**PR:** [#<n>](url) <state> — <title>
**brmem (current branch):** <count> entries

- `<ns>` `<key>` (<size> bytes) — <preview>
- ...

## Downstack (parents → trunk)

| Branch     | Objective | Obj               | PR       | State                      |
| ---------- | --------- | ----------------- | -------- | -------------------------- |
| `<branch>` | `<slug>`  | fresh / stale / — | #<n> / — | OPEN / MERGED / CLOSED / — |

## Upstack (immediate children)

| Branch     | Objective | Obj               | PR       | State                      |
| ---------- | --------- | ----------------- | -------- | -------------------------- |
| `<branch>` | `<slug>`  | fresh / stale / — | #<n> / — | OPEN / MERGED / CLOSED / — |
```

Render the **Downstack** rows in reverse JSON order — parent of current
first, trunk last. Render **Upstack** rows in JSON order.

## Empty And Degraded Cases

- **No claim on current branch.** Render `**Objective:** _none claimed_`
  in place of the slug line. Drop the `body last touched` clause.
- **Multiple claims on current branch.** Render the primary
  (`current.objective.slug`) on the slug line, then add a separate line:
  `_also claimed: <slug2>, <slug3>_` from `objectives_extra`.
- **No PR.** Render `**PR:** _no PR_`.
- **PR lookup error.** Render
  `**PR:** _lookup failed: <pr_error>_`.
- **No brmem entries.** Render `**brmem (current branch):** _none_` and
  drop the bullet list.
- **Detached HEAD.** Render only:
  ```markdown
  # Detached HEAD

  Trunk is `<trunk>`. Check out a feature branch to see objective context.
  ```
  Skip both stack tables.
- **On trunk** (`is_trunk: true`). Skip the **Downstack** table entirely
  (trunk has no ancestors). Render the **Upstack** table as usual.
- **No children.** Render `_no upstack children_` in place of the
  Upstack table body.
- **`gt` unavailable.** Append a single block at the end:
  ```markdown
  > ⚠ gt unavailable — stack walk skipped: `<warning>`
  ```
- **Stale snapshot.** After the objective slug line, append the
  following italicized line literally:

  ```text
  _run `objective-update <slug>` to refresh._
  ```
- **Deleted child branch.** Mark the row's State column with
  `deleted` and italicize the row's branch name: `_<branch>_`.

If the JSON contains additional `warnings` not covered by the cases
above, append a fenced block at the bottom:

```markdown
> ⚠ warnings:
>
> - <warning 1>
> - <warning 2>
```

## Anti-Patterns

- Do not run `gt`, `git`, `gh`, or `brmem` directly from this skill —
  every fact comes from the single `objective exec current` call.
- Do not summarize objective body or roadmap prose; defer to
  `objective-digest`.
- Do not propose a "next slice"; defer to `objective-next`.
- Do not mutate brmem, git refs, branches, files, or the working tree.
- Do not reorder downstack rows or interpret stack entries beyond
  rendering the JSON in reverse. Trunk is always at the bottom of the
  Downstack table.
