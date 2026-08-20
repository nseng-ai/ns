# Autobranch Family Boundaries

Flow currently has an intentionally asymmetric autobranch family.

## Graphite (`gt`)

`ns-flow-gt-autobranch` and `ns-flow-gt-branch-latest-commit` delegate to stable public Flow CLI commands and their Pi mirrors. Graphite is part of those command contracts. They do not submit, land, restack, or create plain Git branches, and existing GT behavior is outside the GS experiment.

## github/gh-stack (`gs`)

`/ns:flow:gs:autobranch` is a provisional generic Skill-Backed Command backed by `ns-flow-gs-autobranch`. There is no `ns flow gs autobranch` CLI, GS latest-commit operation, generalized GT/GS transaction, or engineered GS runtime.

The explicit GS invocation supports only:

- dirty cached Git trunk: create an ordinary child, checkpoint it, then initialize that committed child with `gh stack init`;
- dirty non-trunk already tracked as the gh-stack top: extend it with native `gh stack add`, verify observed postconditions, then checkpoint.

It refuses before mutation on clean worktrees, detached HEAD, missing cached trunk, an existing/invalid child ref, untracked non-trunk branches, and tracked non-top branches. It never initializes an existing non-trunk branch, extracts a latest commit, or accesses `.git/gh-stack`. After any provider mutation it uses Git facts plus `gh stack view --json`; ambiguous outcomes preserve state and stop without blind retry, rollback, branch deletion, or whole-stack unstack.

The GS skill is a temporary executable specification and operational-learning surface. Promotion requires stable evidence and typed, fake-driven provider-specific Flow behavior; it must not change GT behavior or introduce a universal provider transaction.
