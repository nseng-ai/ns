# `github/gh-stack` v0.1.0 autobranch contract

**Date:** 2026-08-24\
**Objective:** `gs-native-workflow-rebuild` — native autobranch vertical slice

## Scope

This note records the bounded provider evidence used by `ns gs autobranch`. It combines the disposable-repository v0.1.0 observations in the workflow baseline, the linked-worktree storage experiment, and focused real-adapter scenarios. Lifecycle conclusions use only Git facts and public `gh stack` commands; private state is not a lifecycle authority.

## Supported observations

- The required output is exactly `gh stack version 0.1.0`.
- `git symbolic-ref refs/remotes/origin/HEAD` supplies cached trunk without a fetch.
- From dirty cached trunk, ordinary `git switch -c <child>` preserves staged, unstaged, untracked, and mixed pending work. Checkpointing before `gh stack init <child>` leaves trunk fixed and creates one durable child commit. A fresh public `gh stack view --json` can then prove the invoking worktree's one-layer stack.
- From a dirty non-trunk branch represented exactly once as the public provider view's current top, `gh stack add <child>` can create and attach a child while preserving pending work. The safe contract does not trust process success: it requires the source ref unchanged, the child at the old source SHA, dirty work on the checked-out child, and fresh public adjacency/current/top facts before checkpointing.
- Staged-only, unstaged-only, untracked-only, and mixed pending states use the same mutation order. The checkpoint stages all pending work with `git add -A`.
- Linked worktrees share branch refs but not provider membership. The disposable `autobranch-provider-smoke` fixture proves owner-worktree tracked-top extension, shared visibility of the resulting child ref from a linked peer, and refusal from a peer-only invoking branch. Missing, stale, or divergent peer state is not scanned or used to authorize mutation.
- Invalid or existing child refs are refused before mutation. There is no automatic suffix collision policy.

## Failure and observation limits

Provider exit status is not authoritative. After `init` or `add`, the implementation inspects Git and fresh public provider facts even after a nonzero exit. A proved child/checkpoint with an unproved provider effect is a known partial failure. Missing or failed post-inspection after mutation is ambiguous. Both preserve state.

The evidence does not prove provider atomicity, rollback, peer serialization, or safe retry. The workflow never deletes the child, runs `unstack`, edits/copies private state, scans peer worktrees, or retries provider mutation automatically. Direct concurrent provider processes in separate worktrees remain outside this slice; changed shared-ref postconditions fail closed.

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

The repository fixture `ts/packages/incubating/extensions/gs/test/integration/autobranch-provider-smoke.test.ts` repeats public `view --json` from an owner and a linked worktree with missing invoking membership while comparing repository-shared `refs/heads/*`. Focused gateway tests classify only v0.1.0's exact `✗ current branch "…" is not part of a stack` diagnostic as untracked; malformed output and arbitrary command/protocol failures remain exit-2 inspection failures with bounded diagnostics. Fake-driven scenarios inject nonzero provider exits and failed post-observation while preserving all observed refs and status.

## Contract consequence

`ns gs autobranch` supports only dirty-trunk bootstrap and dirty invoking-worktree tracked-top extension, pinned to v0.1.0. It is a Tier-2 local mutation with TTY confirmation or `--yes`. It does not fetch, push, submit, mutate GitHub, manage Slots, import Flow, inspect provider-private state, or promise repository-wide provider authority.
