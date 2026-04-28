---
name: objective-current
description: 'Read-only stack map for the current branch. Shows the claimed objective, PR, branch snapshot freshness, brmem entries, downstack ancestry, and immediate upstack children.'
allowed-tools:
  - "Bash(objective exec current *)"
---

# objective-current

Read-only current stack map for the branch you just landed on.

> For shared concepts — vocabulary, storage model, content anatomy, lifecycle,
> carry-forward semantics, and mutation contracts — see
> `../objective/SKILL.md`.

## Goal

After stepping away from a branch for a while, returning means re-deriving
which branch you're on, what objective is claimed there, whether the
snapshot is stale, what brmem context has been parked, whether there's a
PR, and what the surrounding stack looks like. `objective-current` answers
that operational reentry question in one shot. It is the orientation sibling
of `objective-next` (slice planning for one objective on the current branch)
and `objective-digest` (objective-level dossier for one workstream).

## Related Objective Views

| Need                                           | Use                       |
| ---------------------------------------------- | ------------------------- |
| "What branch am I on and what is around me?"   | `objective-current`       |
| "What is this objective trying to accomplish?" | `objective-digest <slug>` |
| "What should I work on next?"                  | `objective-next <slug>`   |

## Inputs

None. The skill operates on the current working directory only.

## Core Rules

- **Read-only.** Never mutate brmem, git refs, branches, or the working
  tree.
- **Single command.** Call `objective exec current --format json` once and
  render the locked Markdown below from its output. Do not run `gt`,
  `git`, `gh`, or `brmem` directly.
- **No objective-content analysis.** Do not summarize objective prose,
  compute roadmap or completion-criteria progress, select findings, judge
  unclaimed PR relevance, identify the most-progressed branch, or recommend
  the next slice. `objective-digest` owns dossier context;
  `objective-next` owns next-slice recommendation.
- **Freshness is branch health only.** Render `obj_state` as snapshot health.
  Do not treat it as progress analysis.

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

Output exactly the following Markdown structure. Headers and ordering are
locked - do not re-order or add sections.

````markdown
# On `<current_branch>`

**Objective:** `<slug>`
**Snapshot:** fresh
**PR:** [#<n>](url) <state> - <title>
**brmem:** <count> entries

_also claimed: <slug2>, <slug3>_

## Current Branch Context

- `<ns>` `<key>` (<size> bytes) - <preview>
- ...

## Stack Map

```text
master
+- parent-branch  #123 MERGED  objective-slug fresh
   +- current-branch  #124 OPEN  objective-slug fresh  <- current
      +- child-a  #125 OPEN  objective-slug stale
      +- child-b  no PR  other-objective fresh
```

## Next Orientation Step

For objective thesis, slices, and findings, run `objective-digest <slug>`.
````

Do not render `body_last_touched`; it remains in the JSON payload for
compatibility but is not part of this skill's output contract.

### Current Branch Header Rules

- **Objective with claim.** Render `**Objective:**` followed by the claimed
  slug in backticks.
- **No claim.** Render `**Objective:** _none claimed_`.
- **Multiple claims.** Keep the primary slug on the objective line and add
  `_also claimed: <slug2>, <slug3>_`.
- **Fresh snapshot.** Render `**Snapshot:** fresh`.
- **Stale snapshot.** Render the Snapshot line as stale and include
  `objective-update <slug>` as the refresh command.
- **No objective.** Omit the Snapshot line.
- **PR present.** Render `**PR:** [#<n>](url) <state> - <title>`.
- **No PR.** Render `**PR:** _no PR_`.
- **PR lookup error.** Render `**PR:** _lookup failed: <pr_error>_`.
- **brmem entries.** Render `**brmem:** <count> entries`, then list the
  entries under `## Current Branch Context`.
- **No brmem entries.** Render `**brmem:** _none_` and omit the branch
  context bullets.

### Stack Map Rules

- Always include trunk as the root when stack data is available.
- Render downstack ancestry from trunk to current.
- Mark the current branch with `<- current`.
- Render only immediate children of current. Do not recursively render
  grandchildren.
- Include each branch's PR state, objective slug, and snapshot state as
  compact labels.
- Use `no PR` when no PR exists.
- Use `lookup failed` only when the PR error is attached to that branch and
  no reliable PR state is available.
- Use `no objective` when no objective is claimed.
- Use `deleted` for deleted child branches.

Branch label shape:

```text
branch-name  #309 OPEN  objective-current-stack-map fresh
branch-name  no PR  no objective
branch-name  #310 MERGED  objective-current-stack-map deleted
```

## Empty And Degraded Cases

- **Detached HEAD.** Render only:
  ```markdown
  # Detached HEAD

  Trunk is `<trunk>`. Check out a feature branch to see objective context.
  ```
  Skip the stack map.
- **On trunk** (`is_trunk: true`). Keep the current header. The stack map
  root is trunk/current. Render immediate children if present.
- **No children.** Render current branch in the tree with no child rows. Add
  `_no upstack children_` below the tree only if it improves clarity.
- **`gt` unavailable.** Append a single block at the end:
  ```markdown
  > Warning: gt unavailable - stack walk skipped: `<warning>`
  ```

If the JSON contains additional `warnings` not covered by the cases
above, append a fenced block at the bottom:

```markdown
> Warnings:
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
- Do not render `body_last_touched`; it is an internal compatibility field
  for callers that still consume the JSON payload.
- Do not turn the stack map into a recursive tree. Only current ancestry and
  immediate children belong here.
