# `github/gh-stack` v0.1.0 restack-resolve contract

**Date:** 2026-08-24\
**Objective:** `gs-native-workflow-rebuild` — GS-native restack-resolve vertical slice

## Question and evidence

This note determines whether `ns gs restack-resolve` can use the installed official `github/gh-stack` v0.1.0 without inheriting `sync`'s remote mutations or Graphite mechanics.

Evidence labels used below:

- **Public help** — output from the installed extension's supported CLI help.
- **Official installed artifact** — the extension manifest and executable installed by `gh`; this installation contains a Mach-O executable, not inspectable source.
- **Observed** — commands run in disposable, no-remote repositories under `/tmp/gh-stack-restack-research`.

No network or GitHub mutation was attempted. No provider-private repository state was read or changed. In particular, this note does not propose `<git-common-dir>/gh-stack` as a runtime contract.

## Installed provider and command discovery

```text
$ gh stack --version
gh stack version 0.1.0

$ gh extension list
gh stack  github/gh-stack  v0.1.0
```

The installed `manifest.yml` identifies `owner: github`, `name: gh-stack`, and `tag: v0.1.0` (**official installed artifact**). The root `gh stack --help` lists a public `rebase` command. The earlier workflow baseline did not include it in its focused command set.

Relevant help was captured with:

```sh
gh stack --help
gh stack view --help
gh stack sync --help
gh stack rebase --help
```

`gh stack rebase --help` exposes (**public help**):

```text
Usage:
  gh stack rebase [branch] [flags]

      --abort
      --continue
      --downstack
      --no-trunk
      --remote string
      --upstack
```

Help describes `rebase` as a cascading rebase that pulls from the remote by default. `--no-trunk` skips fetching and trunk rebasing and performs only inter-branch rebases. It documents whole-stack, downstack, upstack, continue, and abort examples. It also exposes `--committer-date-is-author-date` and its `--preserve-dates` alias (**public help**).

## Reproduction shape

The clean cases used a three-branch tracked stack, then amended the first layer so its descendants needed rebasing:

```sh
repo=$(mktemp -d /tmp/gh-stack-restack.XXXXXX)
cd "$repo"
git init -b main
git config user.name research
git config user.email research@example.invalid
printf 'root\n' >root.txt
git add . && git commit -m root

gh stack init a
printf 'a\n' >a.txt && git add . && git commit -m a
gh stack add b
printf 'b\n' >b.txt && git add . && git commit -m b
gh stack add c
printf 'c\n' >c.txt && git add . && git commit -m c

git switch a
printf 'a2\n' >>a.txt && git commit -am a2
git switch b
```

Conflict cases made `a` and `c` change the same file differently. Before and after each operation, the experiment recorded symbolic `HEAD`, all `refs/heads`, `git status`, and `gh stack view --json` where the latter could run.

## Comparison

### 1. `gh stack sync` is not a local restack-resolve primitive

`sync` combines fetch, GitHub/local membership reconciliation, trunk fast-forward, cascade rebase, atomic force-push, PR-state synchronization, and possible remote stack linking. On a conflict, help says it restores original branches and tells the user to run `gh stack rebase` (**public help**).

In a no-remote repository:

```text
$ gh stack sync
✗ no remotes configured
$ echo $?
1
```

Symbolic `HEAD`, local branch refs, and worktree status were unchanged across that preflight failure (**observed**). This proves only the no-remote preflight boundary, not general atomicity.

**Suitability:** reject for restack-resolve. It is deliberately broader than a local conflict-resolution outcome, can fetch/push/update GitHub state, and delegates conflicts to `rebase` anyway. Its remote behavior belongs to the later reconciliation slice.

### 2. Public `gh stack rebase` provides the missing resumable operation

#### Network boundary

Plain `gh stack rebase` in a no-remote repository exited 1 with `no remotes configured`; refs, checkout, and status remained unchanged (**observed**). This matches help's statement that it pulls from the remote by default (**public help**).

`gh stack rebase --no-trunk` completed entirely locally and printed:

```text
All branches in stack rebased locally (without trunk)
To push up your changes, run `gh stack push`
```

No push occurred (**observed**). Thus `--no-trunk`, not plain `rebase`, is the safe local primitive. Its explicit trade-off is important: it does not integrate an updated trunk.

#### Current-branch scope

From current branch `b` in `(main) <- a <- b <- c` after `a` was rewritten:

| Command                                  | Observed rewritten range | Result                                                   |
| ---------------------------------------- | ------------------------ | -------------------------------------------------------- |
| `gh stack rebase --no-trunk`             | `b` through `c`          | both rebased; checkout returned to `b`                   |
| `gh stack rebase --no-trunk --downstack` | `b` only                 | `c` stayed at its old ref and became `needsRebase: true` |
| `gh stack rebase --no-trunk --upstack`   | `b` through `c`          | both rebased; checkout returned to `b`                   |

These results are **observed**; the mode names and examples are **public help**. In this setup, full and upstack had the same effective range because `--no-trunk` excluded trunk and `a` itself did not need an inter-branch rebase. Downstack stopped at current. This confirms that scope is relative to the current branch, not every tracked stack in the repository.

A clean full local cascade exited 0, rewrote `b` and `c`, restored checkout to the originally current `b`, and produced `needsRebase: false` for every branch in `gh stack view --json` (**observed**).

#### Conflict stop and partial state

A conflict while replaying `c` occurred after `b` had already rebased. The command exited 3 and printed exact recovery instructions:

```text
Resolve conflicts on c, then run `gh stack rebase --continue`
Or abort this operation with `gh stack rebase --abort`
```

At the stop (**observed**):

- `b` already pointed to its rewritten commit;
- `c` still pointed to its original commit;
- `HEAD` was detached in a normal Git interactive rebase;
- the conflicted path was unmerged;
- `.git/rebase-merge` existed;
- `gh stack view --json` exited 2 because detached `HEAD` is not a branch.

This is intentionally resumable partial state, not rollback. After resolving and staging the file, a separate shell process successfully ran:

```sh
GIT_EDITOR=true gh stack rebase --continue
```

It completed `c`, restored checkout to the original `b`, exited 0, and left all viewed branches with `needsRebase: false` (**observed**). A later `gh stack rebase --continue` exited 1 with `no rebase in progress` (**observed**).

`gh stack rebase --abort` at an equivalent conflict exited 0, printed `Rebase aborted and branches restored`, restored every snapshotted branch ref byte-for-byte, restored checkout to `b`, and removed the Git rebase state (**observed**). This is useful recovery evidence, but `ns` must not invoke abort without explicit user authorization.

#### Slot/worktree occupancy

With upstack branch `c` checked out in a second Git worktree, full `gh stack rebase --no-trunk` first reported rebasing `b`, then failed to start `c` because it was already used by the other worktree. It printed `All branches restored to their original state`; snapshots confirmed all branch refs and the original `b` checkout were restored (**observed**).

The observed rollback does not justify relying on late failure. A branch checked out in another Slot is an avoidable precondition failure, and an interrupted rebase occupies the initiating worktree until continue or authorized abort. Therefore GS must preflight all branches in the selected scope for worktree occupancy and consolidate only with user authorization. Conflict resolution must stay sequential in that same worktree.

### 3. A GS-owned raw-Git cascade is possible but inferior

Using only supported `gh stack view --json` facts, a clean cascade was reproduced with old `base` values as fork points:

```sh
view=$(gh stack view --json)
old_b=$(jq -r '.branches[] | select(.name == "b") | .base' <<<"$view")
old_c=$(jq -r '.branches[] | select(.name == "c") | .base' <<<"$view")
git rebase --onto a "$old_b" b
git rebase --onto b "$old_c" c
git switch b
```

This cleanly rebuilt Git ancestry. A conflicting second rebase stopped in ordinary Git state and was resumable with `git rebase --continue` (**observed**).

However, after raw Git completion, `gh stack view --json` still reported the old `base` values even though `needsRebase` became false (**observed**). Running public `gh stack rebase --no-trunk` afterward rewrote branches again and updated those public provider facts (**observed**). Raw Git therefore creates a period in which Git ancestry and provider-reported bases disagree, and it requires GS to own a multi-branch transaction, persisted cascade cursor, rollback policy, checkout restoration, and provider reconciliation.

**Suitability:** reject as the normal mechanism. Supported JSON is sufficient to calculate a Git cascade, but provider `rebase` already owns the same operation plus public continuation/abort semantics and provider-fact maintenance. Raw Git remains diagnostic/recovery material only; it is not needed in the first implementation.

## Contract implications

### Starting state and preflight

The first slice should require and verify:

1. exactly `gh stack` v0.1.0;
2. a clean worktree unless a recognized rebase is already in progress;
3. current branch is a branch represented by `gh stack view --json`;
4. explicit scope: full by default, downstack only when requested (upstack need not be a first-slice public option);
5. no selected branch checked out in another worktree/Slot;
6. no unrelated Git operation in progress.

Before mutation, retain the supported `view --json` topology and independent Git ref/checkout snapshots for reporting and postcondition checks. Do not treat private provider metadata as evidence.

### Mutation and verification

Start with:

```sh
gh stack rebase --no-trunk                 # full/current-through-top behavior
gh stack rebase --no-trunk --downstack     # explicit trunk-side/current-only scope
```

On exit 0, independently verify: no Git rebase is active, worktree is clean, original current branch is checked out, selected Git ancestry is chained, and fresh `gh stack view --json` reports the expected branch identities with `needsRebase: false` in the selected range. Do not push.

On a conflict stop, preserve the repository as the recovery record. Resolve one stop at a time, stage only the accepted resolution, run project checks appropriate to the touched files, then invoke at most one:

```sh
gh stack rebase --continue
```

Reinspect Git state after every continue. A new conflict is a new sequential stop. Ambiguous resolutions escalate to the user and remain stopped. Never auto-abort, auto-skip, push, call `sync`, or switch to raw Git continuation for a provider-started operation.

A non-conflict failure before mutation is a refusal. A failure with changed refs or active rebase state is a known partial result. If process output and observations do not establish which effects occurred, report an ambiguous result and recover forward from fresh Git/public-provider facts rather than replaying the start command.

### Explicit limitation

The chosen `--no-trunk` mechanism repairs inter-branch ancestry only. It does not fetch or move trunk and does not rebase the bottom layer onto a changed trunk (**public help and observed output**). Automatic trunk/remote integration must be **deferred** to the reconciliation slice, where fetch, fast-forward, push, and GitHub effects can be settled together. The first command must state this limitation rather than silently promising Graphite-style trunk restacking.

## Decision

**RESHAPE and implement** `ns gs restack-resolve` as a local, inter-branch conflict-resolution workflow pinned to official `gh-stack` v0.1.0.

- **Chosen mechanism:** public `gh stack rebase --no-trunk`, with `--downstack` for explicit narrower scope, public `gh stack rebase --continue` for each resolved stop, and observed Git plus fresh supported `gh stack view --json` postconditions.
- **Rejected:** `gh stack sync`, because it couples restacking to fetch, push, PR synchronization, and remote stack mutation; plain `gh stack rebase`, because it pulls from a remote; and a GS-owned raw-Git cascade, because it duplicates provider transaction/recovery behavior and leaves provider-reported bases stale until provider reconciliation.
- **Recovery contract:** resume a recognized provider-started interruption in place; one conflict stop and one continue at a time; preserve partial state on escalation; never automatically abort; allow `gh stack rebase --abort` only after explicit user authorization; reject/reconcile ambiguous state from observations rather than rerunning the start command.
- **Slot contract:** preflight the complete selected branch range, require release of occupied branches before starting, and keep the initiating Slot occupied throughout an interruption. Slot release remains optional composition through the public Slots command boundary and requires user authorization.
- **Implementation boundary:** the **CLI** owns deterministic version/topology/cleanliness/worktree preflight, command invocation, structured outcome classification, and Git/provider postcondition data. The **portable skill** owns scope confirmation, sequential conflict-resolution policy, verification selection, human escalation, and recovery narration while calling only the CLI's deterministic operations. The **Pi `/ns:gs:restack-resolve` surface** is a thin router to that portable skill and must add no provider or Slot mechanics.

Defer trunk fetching/integration, pushing, PR/GitHub reconciliation, and any widening beyond v0.1.0. This boundary delivers the provider-native resumable conflict loop now without smuggling `sync` or Graphite semantics into GS.
