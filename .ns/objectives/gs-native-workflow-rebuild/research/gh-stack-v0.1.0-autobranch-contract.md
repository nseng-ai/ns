# `github/gh-stack` v0.1.0 autobranch contract

**Date:** 2026-08-24\
**Objective:** `gs-native-workflow-rebuild` — native autobranch vertical slice

## Scope

This note records the bounded provider evidence behind the proposed native GS autobranch workflow. It combines the disposable-repository v0.1.0 observations in the workflow baseline, the linked-worktree storage experiment, and focused single-worktree operational evidence from the provisional autobranch skill. Lifecycle conclusions use only Git facts and public `gh stack` commands; private state is not a lifecycle authority.

Clause identifiers (`AB-*`) below are stable: implementation slices cite them from tests and pull-request descriptions. Evidence statements describe what was observed; contract clauses state what the workflow must do as a consequence.

## Supported observations (evidence)

- **AB-OBS-1:** The required version output is exactly `gh stack version 0.1.0`.
- **AB-OBS-2:** `git symbolic-ref refs/remotes/origin/HEAD` supplies cached trunk without a fetch.
- **AB-OBS-3:** From dirty cached trunk, ordinary `git switch -c <child>` preserves staged, unstaged, untracked, and mixed pending work. Checkpointing before `gh stack init <child>` leaves trunk fixed and creates one durable child commit. A fresh public `gh stack view --json` can then prove the invoking worktree's one-layer stack.
- **AB-OBS-4:** From a dirty non-trunk branch represented exactly once as the public provider view's current top, `gh stack add <child>` can create and attach a child while preserving pending work. The safe contract does not trust process success: it requires the source ref unchanged, the child at the old source SHA, dirty work on the checked-out child, and fresh public adjacency/current/top facts before checkpointing.
- **AB-OBS-5:** Staged-only, unstaged-only, untracked-only, and mixed pending states use the same mutation order. The checkpoint stages all pending work with `git add -A`.
- **AB-OBS-6:** Linked worktrees share branch refs but not provider membership. Disposable linked-worktree experiments prove owner-worktree tracked-top extension, shared visibility of the resulting child ref from a linked peer, and refusal from a peer-only invoking branch. Missing, stale, or divergent peer state is not scanned or used to authorize mutation.
- **AB-OBS-7:** Invalid or existing child refs are refused before mutation. There is no automatic suffix collision policy.
- **AB-OBS-8:** v0.1.0 reports a branch missing from the invoking worktree's stack with the exact public diagnostic `✗ current branch "…" is not part of a stack`. Only that exact diagnostic is semantic evidence of untracked membership; malformed output and arbitrary command or protocol failures remain inspection failures with bounded diagnostics.

## Contract clauses

### Preconditions

- **AB-PRE-1:** The installed provider must report exactly `gh stack version 0.1.0`; any other output refuses before mutation.
- **AB-PRE-2:** HEAD must be a named branch with a readable source SHA; detached HEAD refuses.
- **AB-PRE-3:** Trunk is resolved only from cached `refs/remotes/origin/HEAD`; the workflow never fetches. A missing cached trunk ref refuses.
- **AB-PRE-4:** No Git operation (rebase, merge, cherry-pick, bisect) may be active.
- **AB-PRE-5:** Pending work must be nonempty by porcelain status including untracked files; a clean worktree refuses. Staged, unstaged, untracked, and mixed pending work are all supported.
- **AB-PRE-6:** The child branch name must be valid and must not already exist; explicit invalid or colliding names are refused, never silently suffixed (per AB-OBS-7).
- **AB-PRE-7:** Mutation requires Tier-2 authorization: TTY confirmation or explicit `--yes` in a non-interactive invocation.

### Dirty cached-trunk bootstrap

- **AB-BOOT-1:** Ordinary Git creates and switches to the child (`git switch -c <child>`); GS then proves the dirty transfer onto the child.
- **AB-BOOT-2:** All pending work is checkpointed on the child (`git add -A` plus one commit), after which GS proves a clean committed child and an unchanged trunk ref.
- **AB-BOOT-3:** Only then does GS run exactly `gh stack init <child>` and verify a one-layer invoking-worktree provider view through fresh public `gh stack view --json`.

### Dirty tracked-top extension

- **AB-EXT-1:** Before mutation, the invoking worktree's public `gh stack view --json` must show the source branch exactly once, as the current and topmost branch. Absent, duplicate, non-current, or non-top representation refuses.
- **AB-EXT-2:** GS runs exactly `gh stack add <child>`, then reinspects even after a provider failure: the source ref must be unchanged, the child must sit at the old source SHA, and the dirty work must be attached to the checked-out child with source/child adjacency in the fresh provider view.
- **AB-EXT-3:** Only after those facts are proved does GS checkpoint, then reverify clean, current, and top facts.

### Authority and failure semantics

- **AB-AUTH-1:** Provider membership is defined by the invoking worktree's public provider view. Peer-only membership never authorizes extension; a branch tracked only by a peer worktree is refused as untracked (per AB-OBS-6).
- **AB-AUTH-2:** The runtime never enumerates or scans peer worktrees.
- **AB-AUTH-3:** Provider exit status is evidence, not authority. After `init` or `add`, GS inspects Git and fresh public provider facts even after a nonzero exit; fresh observations can prove completion despite process failure.
- **AB-FAIL-1:** Results are exactly `refused`, `completed`, `known-partial-failure`, or `ambiguous-failure`.
- **AB-FAIL-2:** A proved child/checkpoint with an unproved provider effect is a known partial failure. Missing or failed post-inspection after mutation is ambiguous. Both preserve observed durable state and return bounded forward recovery facts.
- **AB-EXCL-1:** There is no automatic retry, rollback, child deletion, `unstack`, provider-private state read or repair, peer scan, Slot movement, push, or GitHub mutation.

## Failure and observation limits

The evidence does not prove provider atomicity, rollback, peer serialization, or safe retry. Direct concurrent provider processes in separate worktrees remain outside this slice; changed shared-ref postconditions fail closed (AB-FAIL-2).

## Reproduction outline

In disposable repositories, initialize `main`, configure `origin/HEAD`, create representative dirty states, and exercise:

```sh
gh stack --version
git switch -c <child>
git add -A && git commit -F <message>
gh stack init <child>
gh stack view --json

# From an invoking-worktree tracked top:
gh stack add <child>
gh stack view --json
```

Repeat public `view --json` from an owner worktree and a linked worktree with missing invoking membership while comparing repository-shared `refs/heads/*` to reproduce AB-OBS-6. Inject nonzero provider exits and failed post-observation while preserving all observed refs and status to reproduce AB-FAIL-1/AB-FAIL-2.

## Contract consequence

The proposed `ns gs autobranch` supports only dirty-trunk bootstrap and dirty invoking-worktree tracked-top extension, pinned to v0.1.0. It is a Tier-2 local mutation with TTY confirmation or `--yes`. It does not fetch, push, submit, mutate GitHub, manage Slots, import Flow, inspect provider-private state, or promise repository-wide provider authority.
