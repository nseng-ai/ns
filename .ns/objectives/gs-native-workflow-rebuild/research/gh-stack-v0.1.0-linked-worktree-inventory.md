# `github/gh-stack` v0.1.0 linked-worktree inventory

**Date:** 2026-08-24\
**Objective:** `gs-native-workflow-rebuild` — Stack-worktree architecture correction

## Question and scope

This note verifies the storage fact needed to correct `ns gs list`: which `gh-stack` file belongs to an invocation from a linked Git worktree, and which Git command identifies it without reconstructing Git's worktree layout.

The evidence is limited to official `github/gh-stack` v0.1.0, Git's public `rev-parse` interface, and disposable local repositories. No network or GitHub mutation was attempted. The experiment does not establish safe stack ownership transfer, cross-worktree mutation, or repository-wide locking.

## Reproduction

A disposable repository and linked worktree were created with:

```sh
root=$(mktemp -d /tmp/gs-stack-worktree-research.XXXXXX)
git -C "$root/repo" init -b main
git -C "$root/repo" worktree add -b peer "$root/peer"

for worktree in "$root/repo" "$root/peer"; do
  git -C "$worktree" rev-parse --path-format=absolute --git-common-dir
  git -C "$worktree" rev-parse --path-format=absolute --git-dir
  git -C "$worktree" rev-parse --path-format=absolute --git-path gh-stack
done
```

The repository was configured and given one initial commit before the linked worktree was added. The gh-stack version was independently confirmed with `gh stack --version`.

## Observations

The observed version was exactly:

```text
gh stack version 0.1.0
```

Both worktrees reported the same common Git directory. They reported different worktree Git directories and different `--git-path gh-stack` values:

```text
primary common:  <repo>/.git
primary git dir: <repo>/.git
primary state:   <repo>/.git/gh-stack

linked common:   <repo>/.git
linked git dir:  <repo>/.git/worktrees/peer
linked state:    <repo>/.git/worktrees/peer/gh-stack
```

Running `gh stack init owner-layer` in the primary worktree created `<repo>/.git/gh-stack` and `<repo>/.git/gh-stack.lock`. A public `gh stack view --json` in that worktree returned the initialized stack. The linked worktree had no gh-stack state and `gh stack view --json` there exited 2 with `current branch "peer" is not part of a stack`.

A real-adapter integration fixture then wrote distinct valid recorded stacks to the two paths returned by `git rev-parse --path-format=absolute --git-path gh-stack`. Reading from each worktree returned only that worktree's recorded state. When only the primary state existed, reading from the linked worktree returned an empty current-worktree inventory rather than falling back to common-directory state.

## Inventory contract

`ns gs list` uses `GitGateway.gitPath({ cwd, relativePath: "gh-stack" })`. The returned absolute state path is Git's canonical answer for the invoking worktree; its parent directory is exposed as `worktreeGitDir` provenance in structured and human output.

The command reads exactly that state file, then applies its existing local-branch retention rule over repository-shared branch refs. It does not enumerate peer worktrees, merge peer gh-stack definitions, infer a repository-wide inventory, or use another worktree's state when the current file is missing.

The state read remains a separately justified inspection feature. Lifecycle workflows must continue to use supported public gh-stack commands rather than direct private-state reads or mutation.

## Implications and remaining work

- `<git-common-dir>/gh-stack` is correct only when Git itself resolves that as the invoking worktree's `--git-path gh-stack`; it is not a linked-worktree inventory rule.
- Every inventory result, including an empty result, needs current-worktree provenance so users and callers can distinguish gh-stack views over shared refs.
- Peer inventories can be missing or divergent. This slice intentionally defines no aggregation or reconciliation semantics.
- The experiment reinforces the existing one-stable-stack-worktree direction but does not complete the broader stack-worktree architecture row.
- Wrong-worktree restack behavior, independent lock concurrency, safe Slot destination establishment, and source disposition remain separate experiments.
