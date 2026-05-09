---
name: dev-brmem-branch-impl
description: Command
metadata:
  internal: true
# Original description (preserved for reference):
# Load the brmem-stashed plan/context from the current branch and begin implementation against it. Confirms that `brmem` entries exist on the branch, reads every entry into session context, summarizes the loaded plan, creates a TODO list, and starts executing. Use when the user is sitting on a branch created by `dev-brmem-branch-create` (or any branch with brmem content) and wants to pick up the stashed work. Read-only with respect to `brmem` — never writes entries.
allowed-tools:
  - "Bash(git rev-parse *)"
  - "Bash(git symbolic-ref *)"
  - "Bash(git status *)"
  - "Bash(brmem list *)"
  - "Bash(brmem get *)"
  - "Read"
---

<!-- INTERNAL DEV SKILL: local contributor helper, not published for external discovery. -->

# dev-brmem-branch-impl

Pick up a branch that has plan/context stashed via `brmem` and start implementing against it.

**The skill owns:** confirming `brmem` content exists on the current branch, reading every entry verbatim into session context, summarizing what was loaded, creating a TODO list from the plan, and beginning implementation.

**Symmetric to `dev-brmem-branch-create`:** that skill parks context on a branch; this skill unparks it and gets to work. No repo-local plugin is involved — impl is uniform across branches.

## Rules

- **Read-only on `brmem`.** Never call `brmem put`, `brmem copy`, or any mutating command. If the plan itself instructs you to update brmem, stop and ask the user.
- **Fail clean if there are no entries.** If `brmem list` for the current branch returns zero entries, abort with a short message naming the branch. Do not fabricate a plan.
- **Refuse trunk branches.** If the current branch is `main`, `master`, or the repo's configured default branch, abort — you should never begin an implementation directly on trunk.
- **Load everything on the branch, not just one entry.** The create skill defaults to a single `base/plans/<slug>.md` entry, but a user may have stashed more. Read every entry returned by `brmem list`.
- **Copy bytes verbatim.** Do not summarize or rewrite loaded content in the way you store it in context. The summary you show the user is separate from the raw content used to drive execution.
- **Single source of truth during execution.** The brmem-loaded plan is authoritative. If the user gives a correction mid-run, treat it as a course correction; do not silently substitute your own interpretation.

## Workflow

### 1. Pre-flight

- `git rev-parse --show-toplevel` to confirm a git repo. **Abort if not.**
- `git symbolic-ref --short HEAD` to get the current branch. **Abort if detached HEAD.**
- If the current branch is `main`, `master`, or matches `git symbolic-ref refs/remotes/origin/HEAD`'s short name, **abort** with: "Refusing to implement directly on trunk (`<branch>`). Check out a feature branch first."

### 2. Confirm brmem content

Run:

```
brmem list --branch <current-branch> --format json
```

Parse the result. **Abort if zero entries**, with guidance:

```
No brmem entries on branch `<current-branch>`.

If you meant to stash a plan here first, use `dev-brmem-branch-create` to
park context on a new branch, then re-run this skill on that branch.
If the plan lives elsewhere, load it manually.
```

### 3. Load every entry

For each entry returned by step 2, read its content:

```
brmem get <key> [--namespace <ns>] --branch <current-branch>
```

Omit `--namespace` for `base` entries; include it otherwise. Load the full content of each entry into session context. Do not truncate.

### 4. Report what was loaded

Print a short block:

```
Branch: <current-branch>
Loaded <N> brmem entries:
  - <namespace>/<key>  (<byte-count> bytes, ref <ref-path>)
  ...
Plan summary:
  - <3–5 bullets summarizing the primary plan content>
```

If multiple entries were loaded, identify the primary plan (the one whose key matches `plans/*.md`, or the single entry if only one, or the first listed otherwise) and summarize that. Mention any secondary entries by key without summarizing them individually.

### 5. Create the TODO list

Use `TodoWrite` to create the task list:

- If the primary plan has explicit numbered or bulleted steps, create one TODO per step, preserving the plan's order.
- If the plan is prose-only, create a single "Implement plan" TODO and plan to break it down as execution reveals structure.
- Mark the first TODO as `in_progress` only once you actually begin step 6.

### 6. Begin implementation

Start executing the plan. Apply normal session behavior:

- Edits go through the usual `Read`/`Edit`/`Write` tools.
- Tests and checks run via the project's usual commands (e.g. `just`).
- Update `TodoWrite` as steps complete.
- Do not `git commit`, `gt submit`, or push unless the user explicitly asks or the plan itself instructs you to and the user has authorized that scope.

**If the plan is ambiguous or internally inconsistent**, stop at step 6 and surface the ambiguity to the user with the specific lines in question. Do not guess.

## Manual verification scenarios

1. **Branch with a single `plans/<slug>.md` entry** — skill reports one entry loaded, summarizes the plan in 3–5 bullets, creates TODOs from the plan's numbered steps, and begins implementation.
2. **Branch with no brmem entries** — clean abort naming the branch; no TODOs created, no implementation begun.
3. **Trunk branch (`main`/`master`) with entries** — refuses to run regardless of entry count; names the trunk branch in the error.
4. **Branch with multiple entries across namespaces** — all entries loaded; report lists each by `namespace/key`; summary focuses on the primary plan; secondary entries are acknowledged but not summarized individually.
5. **Detached HEAD** — abort with a message about detached HEAD; no brmem calls attempted.
