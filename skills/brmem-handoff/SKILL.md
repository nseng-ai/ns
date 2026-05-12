---
name: brmem-handoff
description: "Save or load a concise session handoff in Branch Memory for the current branch. Use when the user asks to save a handoff, load a handoff, resume from a handoff, or preserve/restore session context without creating working-tree files."
allowed-tools:
  - "Bash(git *)"
  - "Bash(brmem *)"
---

# brmem-handoff

Use Branch Memory to save or load one concise handoff for a Git branch.

This skill owns this Branch Memory location:

- Namespace: `handoff`
- Entry key: `current.md`
- Load command: `brmem get current.md --namespace handoff --branch <branch>`

Saving a handoff replaces the previous handoff for that branch. Do not create
timestamped handoffs or a history log unless the user explicitly asks for that.

## Save a handoff

Use this workflow only when the user asks to save, write, update, or create a
handoff for the current session.

### 1. Resolve the branch

```bash
branch="$(git branch --show-current)"
test -n "$branch"
```

If the branch is empty, stop: the repo is in detached HEAD and the user must
choose a branch explicitly.

### 2. Optionally check for existing content

```bash
brmem check current.md --namespace handoff --branch "$branch"
```

Existing content is expected; this skill overwrites `handoff/current.md` for the
branch.

### 3. Compose a short handoff

Use this shape:

```markdown
# Handoff

## Branch

## Next Session Goal

## Current State

## Durable Artifacts

## Decisions and Constraints

## Suggested Skills

## Next Steps

## Watch-Outs
```

### 4. Store it directly in Branch Memory

```bash
brmem put current.md --namespace handoff --branch "$branch" --stdin <<'HANDOFF'
# Handoff

...
HANDOFF
```

### 5. Verify it can be read

```bash
brmem get current.md --namespace handoff --branch "$branch"
```

### 6. Report the write

In the final response, include the Branch, Entry (`handoff/current.md`), Ref,
and Commit printed by `brmem put`.

## Load a handoff

Use this workflow when the user asks to load, read, resume from, or continue
from a handoff.

### 1. Resolve the branch

Use the branch named by the user. If none is named, resolve the current branch:

```bash
branch="$(git branch --show-current)"
test -n "$branch"
```

If the branch is empty, stop and ask which branch to load from.

### 2. Read the handoff

```bash
brmem get current.md --namespace handoff --branch "$branch"
```

### 3. Use the handoff

Load the content into context before doing other work. Briefly summarize the
loaded handoff for the user, then continue with the requested task.

## Content rules

- Keep the handoff short enough to be useful startup context.
- Do not duplicate content already preserved in plans, ADRs, PRs, commits,
  diffs, issues, or initiative/objective docs.
- Reference durable artifacts by path, branch, ref, or URL.
- Do not store secrets, credentials, private tokens, large logs, generated
  output, binary assets, or datasets.
- Prefer concrete next steps and watch-outs over a transcript of the session.
