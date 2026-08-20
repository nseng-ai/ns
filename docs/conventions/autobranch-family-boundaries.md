# Autobranch Family Boundaries

Flow currently has an intentionally asymmetric autobranch family.

## Graphite (`gt`)

`ns-flow-gt-autobranch` and `ns-flow-gt-branch-latest-commit` delegate to stable public Flow CLI commands and their Pi mirrors. Graphite is part of those command contracts. They do not submit, land, restack, or create plain Git branches, and existing GT behavior is outside the GS experiment.

## github/gh-stack (`gs`)

`/ns:flow:gs:autobranch` and `/ns:flow:gs:autoslot` are provisional generic Skill-Backed Commands backed by `ns-flow-gs-autobranch` and `ns-flow-gs-autoslot`. There are no `ns flow gs` CLI routes, GS latest-commit operation, generalized GT/GS transaction, or engineered GS runtime. Autoslot repeats the complete autobranch procedure in its own executable specification rather than invoking the sibling slash command.

The explicit GS invocations support only:

- dirty cached Git trunk: create an ordinary child, checkpoint it, then initialize that committed child with `gh stack init`;
- dirty non-trunk already tracked as the gh-stack top: extend it with native `gh stack add`, verify observed postconditions, then checkpoint.

It refuses before mutation on clean worktrees, detached HEAD, missing cached trunk, an existing/invalid child ref, untracked non-trunk branches, and tracked non-top branches. It never initializes an existing non-trunk branch, extracts a latest commit, or accesses `.git/gh-stack`. After any provider mutation it uses Git facts plus `gh stack view --json`; ambiguous outcomes preserve state and stop without blind retry, rollback, branch deletion, or whole-stack unstack.

The autoslot workflow adds only a final composition step: after provider state, checkpoint success, and a clean worktree are reverified, it runs `ns slot checkout --current`. It reports observed Slot name, destination worktree, checked-out branch, and navigation guidance. Slot failure is a partial failure that preserves the committed provider child and never triggers autobranch rollback or replay.

The GS skills are temporary imperative executable specifications and operational-learning surfaces. Shared evidence-backed lessons must stay synchronized across both canonical skills when editing is authorized; Slot-only lessons remain in autoslot. Promotion requires stable evidence and typed, fake-driven provider-specific Flow behavior, including Slot composition outcomes for autoslot; it must not change GT behavior or introduce a universal provider transaction.
