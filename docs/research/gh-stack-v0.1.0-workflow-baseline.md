# `github/gh-stack` v0.1.0 workflow baseline

**Date:** 2026-08-23\
**Objective:** `gs-native-workflow-rebuild` — Architecture and contract baseline

## Scope and sources

This note records a narrow baseline for the locally installed official GitHub CLI extension. The only sources are:

- `gh stack --version` and `gh extension list`;
- public help from `gh stack {init,add,view,sync,submit,link,merge} --help`;
- disposable, no-remote Git repositories under `/tmp`.

No networked mutation was attempted. Claims copied from command help are provider claims, not verified remote behavior.

## Tool baseline

```text
$ gh stack --version
gh stack version 0.1.0

$ gh extension list
gh stack  github/gh-stack  v0.1.0
```

The initial ns support policy should pin this exact pre-1.0 version. Later versions require separate evidence rather than an assumed compatible command or JSON contract.

## Reproduction

The following compact procedure reproduces the local cases. Run each mutation in a disposable repository, not a working checkout.

```sh
repo=$(mktemp -d /tmp/gh-stack-baseline.XXXXXX)
cd "$repo"
git init -b main
git config user.name baseline
git config user.email baseline@example.invalid
printf 'root\n' >file.txt
git add file.txt && git commit -m root

gh stack init feature-a
printf 'a\n' >>file.txt
git add file.txt && git commit -m a
gh stack add feature-b
gh stack view --json
git for-each-ref --sort=refname \
  --format='%(refname:short) %(objectname)' refs/heads

git switch main
gh stack view --json
gh stack add bad-child
gh stack view --json

# Independent fresh-repo variants:
# git branch adopted-a && git branch adopted-b
# gh stack init adopted-a adopted-b
# printf 'dirty\n' >>file.txt && gh stack init dirty-child

# In a no-remote disposable repo, snapshot HEAD, refs, and status around:
# gh stack sync
# gh stack submit --auto
# gh stack link feature second
```

For the command contract itself, capture:

```sh
for command in init add view sync submit link merge; do
  gh stack "$command" --help
done
```

## Local observations

### Stack creation, extension, and inspection

- On fresh `main`, `gh stack init feature-a` created and checked out `feature-a`.
- After a commit on `feature-a`, `gh stack add feature-b` created and checked out `feature-b` at `feature-a`'s tip.
- `gh stack view --json` returned `trunk`, `currentBranch`, and a bottom-to-top `branches` array. Each observed branch object contained `name`, `base`, `isCurrent`, `isMerged`, `isQueued`, and `needsRebase`.
- From `main` while the recorded stack existed, `view --json` still succeeded: `currentBranch` was `main` and every stack branch had `isCurrent: false`.
- More surprisingly, `gh stack add bad-child` from that trunk checkout succeeded. It created and checked out `bad-child`, appended it to the viewed stack, based it at the trunk commit, and reported `needsRebase: true`. This demonstrates that v0.1.0 behavior is broader than a provisional assumption that `add` requires checkout of a stack branch. It does **not** settle the ns contract for that starting state.

Representative JSON shape:

```json
{
  "trunk": "main",
  "currentBranch": "feature-b",
  "branches": [
    {
      "name": "feature-a",
      "base": "<commit>",
      "isCurrent": false,
      "isMerged": false,
      "isQueued": false,
      "needsRebase": false
    },
    {
      "name": "feature-b",
      "base": "<commit>",
      "isCurrent": true,
      "isMerged": false,
      "isQueued": false,
      "needsRebase": false
    }
  ]
}
```

### Adoption and dirty work

- Given existing linear-named branches, `gh stack init adopted-a adopted-b` adopted them in argument order, bottom to top, and checked out `adopted-b`.
- From dirty trunk with a tracked unstaged edit, `gh stack init dirty-child` created and checked out `dirty-child`; the tracked diff remained byte-for-byte unchanged in the experiment.
- These observations cover only the tested topology and tracked unstaged dirtiness. They do not establish behavior for staged, untracked, mixed, conflicting, detached-HEAD, or non-linear cases.

### No-remote preflight failures

In a disposable repository with no remotes:

| Command                        | Exit | Observed diagnostic                                                       |
| ------------------------------ | ---: | ------------------------------------------------------------------------- |
| `gh stack sync`                |    1 | `no remotes configured`                                                   |
| `gh stack submit --auto`       |    4 | GitHub client creation failed because no repository remote was configured |
| `gh stack link feature second` |    4 | GitHub client creation failed because no repository remote was configured |

For each case, snapshots before and after showed unchanged symbolic `HEAD`, local branch refs, and porcelain worktree status. This is narrow preflight evidence only. It is **not** evidence that these commands generally roll back, are atomic, or leave no partial remote/local effects after later phases begin.

## Networked mutation claims from public help (unverified)

The v0.1.0 help text claims:

- `sync` fetches; reconciles local and GitHub stack membership; fast-forwards trunk; cascade-rebases branches; atomically pushes with `--force-with-lease --atomic`; synchronizes PR state; and links two or more existing PRs into a remote stack. It says conflicts restore original branch state, divergence can prompt or abort, and `sync` does not open PRs.
- `submit` pushes all branches, creates selected PRs, updates bases of existing PRs, and creates or updates the remote stack. `--auto` skips the editor and creates new PRs as drafts unless `--open` is supplied.
- `link` explicitly does not depend on local gh-stack tracking. It accepts branch names, PR numbers, or PR URLs in bottom-to-top order; may push branch arguments, create missing PRs with chained bases, and create or extend a remote stack without removing existing members.
- `merge` uses GitHub's atomic stack merge for the selected prefix: all selected PRs merge or none do. Help says GitHub evaluates protection rules, and repositories using a merge queue enqueue the stack rather than merging directly.

None of those remote, rollback, atomicity, queue, PR-base, or stack-object claims was experimentally verified here.

## Implications for the ns contract

1. Treat v0.1.0 as an explicit, checked compatibility baseline; reject or separately qualify version drift.
2. Model provider operations narrowly rather than recreating a Graphite-shaped or universal stack-provider transaction.
3. Lifecycle code must **not read or mutate provider-private state** (including `<git-common-dir>/gh-stack`). Use supported commands only for provider interaction.
4. Provider exit success, prose, and JSON are claims, not authoritative completion facts. Verify effects after every mutation through the relevant independent observations: Git checkout/refs/commits/worktree, supported gh-stack output, and authoritative GitHub branch/PR/base/stack/merge facts.
5. Define postconditions from desired outcomes, not from surprising permissiveness such as `add` succeeding on trunk. Starting-state checks and refusals remain an ns contract decision.
6. Distinguish refusal, verified completion, known partial failure, and ambiguous failure. Once an external mutation may have begun, recover forward from observed facts; do not infer rollback from the no-remote preflight cases.
7. Keep `link` conceptually separate from tracked local lifecycle: its help explicitly allows remote stack construction without local tracking and includes hidden mutations such as pushes and PR creation.
8. Do not promise `sync`, submit, or merge semantics in the GS contract until remote experiments verify phase boundaries and effects.

## Unresolved experiments

- `init`/`add`: staged, untracked, mixed, empty, detached-HEAD, naming collision, non-linear adoption, multiple recorded stacks, and provider failure after a local mutation.
- `view --json`: schema stability, malformed/absent fields, merged and queued states, stale local refs, and disagreement with Git/GitHub.
- `sync`: clean and dirty worktrees; unpublished branches; behind/ahead trunk; clean and conflicting cascade rebases; remote-added branches; local/remote divergence; prune behavior; atomic-push support/failure; partial fetch, push, PR-link, and stack-update failures.
- `submit`: new and existing PRs, draft/open policy, selected subsets, base correction, push failure, PR creation midway failure, and remote stack update failure. Reconcile results directly with GitHub.
- `link`: branch/PR/URL resolution, stack-number ambiguity, pre-existing PRs, cross-stack rejection, partial pushes/PR creation, base selection, and behavior with no local tracking.
- `merge`: readiness/protection failures, prefix selection and order, direct versus queue behavior, claimed atomicity, ambiguous transport failures, and post-merge local/provider reconciliation.

Until those cases are observed, the help text is useful capability orientation but not an ns lifecycle guarantee.
