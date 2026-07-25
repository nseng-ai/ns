---
name: code-graphite
description: "Graphite (gt) command mechanics for stacked branches and PRs. Use when creating or amending branches with gt, navigating or reshaping a stack, restacking, tracking or untracking branches, deleting stack branches, recovering an interrupted rebase, or submitting a stack."
allowed-tools:
  - "Bash(gt *)"
  - "Bash(git add *)"
  - "Bash(git reset *)"
  - "Bash(git diff *)"
  - "Bash(git status *)"
  - "Bash(git stash *)"
  - "Bash(git checkout *)"
  - "Bash(git rebase *)"
  - "Bash(git branch *)"
---

# code-graphite

Graphite (`gt`) mechanics: given an operation the repository or user has already chosen, how to perform it with `gt`. Repository instructions and explicit user direction own every judgment call — branch names, parentage, stack shape, validation, publication, and PR content.

Examples write `<trunk>` for the repository's trunk branch; resolve it from repository instructions or `.graphite_repo_config`. When a flag misbehaves, suspect version drift and check `gt <command> --help`.

## Mental model

A Graphite stack is a parent/child chain of tracked git branches rooted at trunk. Each tracked branch maps to one PR on submit, and its reviewable diff is relative to its parent, not trunk. Because of that dependency, changing a lower branch invalidates everything above it until the descendants are restacked. "Upstack" means toward dependent children; "downstack" means toward trunk. Graphite's tracking metadata is a layer on top of git refs, not part of them: tracking or untracking a branch changes only what Graphite knows about topology and never creates or deletes commits or branches.

## Quick Reference

| I want to...                              | Command                                        |
| ----------------------------------------- | ---------------------------------------------- |
| Create a new stacked branch               | `gt create <name> -m "<message>"`              |
| Amend the current branch                  | `gt modify -m "<message>"` (or `--no-edit`)    |
| Move up / down the stack                  | `gt up` / `gt down`                            |
| Jump to top / bottom of stack             | `gt top` / `gt bottom`                         |
| Check out a specific branch               | `gt checkout <branch>`                         |
| Rebase the stack after changes below      | `gt restack`                                   |
| Change a branch's parent                  | `gt track --parent <branch>`                   |
| Rename the current branch                 | `gt rename <new-name>`                         |
| Reorder branches in the stack             | `gt move`                                      |
| Delete a branch (non-interactive)         | `gt delete <branch> -f -q`                     |
| Stop tracking a branch, keep it in git    | `gt untrack <branch> --force --no-interactive` |
| Submit the stack (requires authorization) | `gt submit --no-interactive`                   |

## Inspection: plumbing before display

Answer topology questions with the narrowest plumbing command:

- Current branch's PR, submission, and restack state: `gt branch info --no-interactive`
- Immediate topology: `gt parent --no-interactive` / `gt children --no-interactive`

`gt ls` is human display only — visualize with it, never parse it.

## Creating and amending branches

1. Stage changes: `git add <files>`
2. Create the branch: `gt create <name> -m "<commit message>"`
3. Repeat per branch to build a stack.

Amend the current branch:

```bash
git add <files>
gt modify -m "<updated message>"   # or: gt modify --no-edit
```

### Untracked branches (common in worktrees)

`gt` refuses operations on untracked branches ("Cannot perform this operation on untracked branch"). Check with `gt branch info`. To adopt the current branch, establish its intended parentage first:

```bash
gt track --parent <intended-parent>
gt restack
```

If the current branch's history makes that awkward, stash, check out the intended parent, create a fresh branch with `gt create`, and unstash onto it.

## Navigating a stack

```bash
gt up        # one branch toward the top
gt down      # one branch toward trunk
gt top       # top of stack
gt bottom    # first branch above trunk
gt checkout <branch>
```

## Reshaping topology

Re-parent a branch (and everything above it):

```bash
gt checkout <branch>
gt track --parent <new-parent>
gt restack
```

Reorder branches with `gt move` — simpler than `gt create --insert`.

## Splitting committed work

To re-cut commits into different branches, reset them to unstaged changes and rebuild:

```bash
git reset HEAD^      # last commit → unstaged (HEAD~2 for two, etc.)
git diff HEAD        # inspect what you now have
# then: git add selectively + gt create per branch
```

## Submitting

```bash
gt submit --no-interactive
```

This publishes branches and creates/updates PRs on the remote — a write-capable external action. Run it only when repository instructions or the user have explicitly authorized publication.

## Troubleshooting

| Problem                                                       | Solution                                                                |
| ------------------------------------------------------------- | ----------------------------------------------------------------------- |
| "Cannot perform this operation on untracked branch"           | `gt track --parent <intended-parent>`, then retry                       |
| Branch parented on the wrong branch                           | `gt track --parent <correct-parent>`, then `gt restack`                 |
| Stale tracked branch (deleted in git, still in `gt` metadata) | `gt untrack <branch> --force --no-interactive` (see Untracking)         |
| Conflicts during restack                                      | Resolve, `git add`, `git rebase --continue`                             |
| `gt restack` hitting conflicts in unrelated branches          | Targeted `git rebase` instead (see Surgical Rebasing)                   |
| Rebase interrupted mid-conflict                               | See Recovering from Interrupted Rebase                                  |
| Need to split a PR                                            | Reset commits to unstaged, re-stage selectively, `gt create` per branch |

## Surgical Rebasing in Complex Stacks

`gt restack` restacks every branch that needs it — in a repository with many sibling stacks it can hit conflicts in branches unrelated to yours. Reach for a targeted `git rebase` when you want to update only specific branches or skip obsolete commits:

```bash
git checkout <branch>
git rebase <target>
# conflicts: resolve → git add <file> → git rebase --continue
# obsolete commit: git rebase --skip
gt modify --no-edit    # sync Graphite's tracking afterward
```

Establish a branch's intended parentage (`gt track --parent`) before any topology-changing recovery, so the rebase lands where the stack should live.

### Recovering from Interrupted Rebase (Context Reset)

If a rebase was interrupted (session ended mid-conflict):

1. `git status` — look for "interactive rebase in progress" and "Unmerged paths".
2. Read the unmerged files: they may already be resolved (no conflict markers).
3. Already resolved: `git add <files>` then `git rebase --continue`.
4. Still conflicted: resolve markers first, then stage and continue.

## Deleting branches

```bash
gt delete <branch> -f -q               # -f: even if unmerged; -q: non-interactive, quiet
gt delete <branch> -f -q --upstack     # also delete all children
gt delete <branch> -f -q --downstack   # also delete all ancestors
```

After deleting an intermediate branch, children restack onto its parent automatically; fix tracking manually with `gt track --parent` if needed.

## Untracking branches (`gt untrack`)

`gt untrack <branch>` removes only Graphite's metadata — the branch and its commits stay in git. Contrast `gt delete`, which removes the branch itself.

**Cascade:** untracking a branch also untracks all of its children. Untrack a branch partway up a stack only when you intend to drop tracking for its whole subtree.

- `--force` is required to untrack a branch that has children without a prompt; script as `gt untrack <branch> --force --no-interactive`.
- Untracking an already-untracked branch errors with "Cannot perform this operation on untracked branch" — in a scripted loop, treat that as already clean (a prior cascade may have removed it).

**Dangling metadata:** `gt` plumbing hides tracked branches whose `refs/heads/<name>` no longer exists, but tools reading Graphite's metadata directly still see them. `gt untrack <dangling-branch>` reconciles the metadata. Before untracking, confirm none of its metadata children still has a live local ref — the cascade would untrack a live branch too.

---

Lineage: mechanics derived from the `graphite` skill in `withgraphite/agent-skills`, re-expressed trunk-neutral and policy-free; workflow policy lives in repository instructions, not here.
