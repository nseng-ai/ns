---
name: internal-code-gt-delete-stack
description: "Delete a Graphite stack subtree rooted at an explicit branch, with slot/worktree preflight, PR closure, remote branch cleanup, and local Graphite metadata deletion. Use when the user asks to delete/remove/free a Graphite stack or subtree, especially with slots, worktrees, open PRs, or remotes involved."
metadata:
  internal: true
allowed-tools:
  - "Bash(gt *)"
  - "Bash(git status *)"
  - "Bash(git branch *)"
  - "Bash(git worktree *)"
  - "Bash(git fetch *)"
  - "Bash(git switch *)"
  - "Bash(git checkout *)"
  - "Bash(git push origin --delete *)"
  - "Bash(slot *)"
  - "Bash(gh pr *)"
  - Read
---

# internal-code-gt-delete-stack

Delete the Graphite subtree rooted at an explicit branch while preserving slot
safety and making PR/remote cleanup intentional.

## Contract

- Selector: `root_branch`, not "current stack". If the user did not give a
  root branch, ask for one before destructive work.
- Target set: `root_branch` plus every Graphite descendant/upstack branch.
- Exclude ancestors/downstack parents and sibling subtrees unless the user gives
  a separate root/list.
- Graphite stacks can be trees. Do not assume a single linear parent/child
  chain.
- Never commit, push normal branch updates, submit, land, or merge.

## Safety rules

- Destructive intent must be explicit. Closing PRs and deleting remote branches
  require clear authorization; if ambiguous, pause and ask.
- Free target slots before deleting branches. Git cannot delete a branch checked
  out in another worktree.
- Refuse dirty target worktrees. Do not stash, detach, or delete from a dirty
  slot/worktree; report dirty paths and stop.
- Do not use `slot free --all` for this workflow. It can close PRs and
  force-delete local branches but does not delete remotes or clean Graphite
  metadata.
- Treat `slot gt free-stack` as unrelated restack tooling, not this deletion
  workflow.
- Re-run `gt delete --help` in-session before final deletion; Graphite CLI
  semantics can change.

## Workflow

### 1. Preflight and discover

Run read-only checks first:

```bash
git status --short --branch
git worktree list --porcelain
gt delete --help
gt branch info <root_branch>
gt ls
slot list --format json
```

Use Graphite output (`gt branch info`, `gt ls`, or `gt log`) to discover the
exact subtree: root plus descendants only. If the descendant set is ambiguous,
show the evidence and ask instead of inferring.

When PR or remote cleanup is requested, check each target branch:

```bash
gh pr view <branch> --json number,title,state,headRefName,url
```

Also check whether `origin/<branch>` exists when remote deletion may be needed:

```bash
git branch --remotes --list origin/<branch>
```

### 2. Confirm target plan

Before mutation, summarize:

- root branch;
- target branches to delete;
- known non-target ancestors/siblings that will be preserved;
- slots/worktrees currently holding target branches;
- dirty target worktrees, if any;
- PRs that will be closed;
- remote refs that will be deleted;
- remote refs or PRs that will be left alone because authorization is missing.

Stop if any target worktree is dirty. Ask if PR closure or remote deletion is not
already explicitly authorized.

### 3. Free occupied target slots

For every clean slot/worktree that has a target branch checked out, prefer a dry
run preview when practical:

```bash
slot free --branch <branch> --dry-run --format json
slot free --branch <branch> --yes --format json
```

Free only target branches. If a target branch is checked out in the main/current
worktree, require a clean tree and move to a non-target branch (usually trunk)
before deletion.

### 4. Close PRs and delete remotes when authorized

For each authorized open PR on a target branch:

```bash
gh pr close <number> --delete-branch
```

This is the preferred remote cleanup because it closes the PR and deletes its
head branch when GitHub permits it. Report failures; do not hide partial
cleanup.

If a target branch has no PR but still has an authorized remote ref, ask before
using:

```bash
git push origin --delete <branch>
```

### 5. Delete local Graphite branches

After target branches are out of worktrees and PR/remote handling is complete,
prefer Graphite deletion:

```bash
gt delete <root_branch> --upstack --force --no-interactive
```

This should delete local branches and Graphite metadata for the root plus
upstack descendants. Do not add `--downstack`; ancestors are outside the
contract. Do not use `gt delete --close` as a substitute for the explicit
PR/remote cleanup above.

Use raw local deletion only for verified leftovers that Graphite no longer
tracks and the user already authorized deleting:

```bash
git branch -D <branch>
```

### 6. Verify

```bash
git fetch --prune origin
git branch --list <branch>
git branch --remotes --list origin/<branch>
slot list --format json
gt ls
```

Verify no target local branches remain. If remote deletion was authorized,
verify no `origin/<target>` refs remain. Verify target slots are available or on
non-target branches. Report any preserved ancestors/siblings and any cleanup
that failed or was skipped.
