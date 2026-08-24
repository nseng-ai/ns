# Autobranch Family Boundaries

Native Graphite and GS autobranch workflows have intentionally separate owners and provider semantics.

## Graphite (`gt`)

`ns-flow-gt-autobranch` and `ns-flow-gt-branch-latest-commit` delegate to stable public Flow CLI commands and their Pi mirrors. Graphite is part of those command contracts. They do not submit, land, restack, or create plain Git branches, and existing GT behavior is outside the GS experiment.

## github/gh-stack (`gs`)

`ns gs autobranch` and `/ns:gs:autobranch` are the only native GS autobranch mutation authorities. The thin `ns-gs-autobranch` skill invokes and recovers the deterministic CLI; it does not duplicate Git or provider mechanics. The former provisional `/ns:flow:gs:autobranch` registration and `ns-flow-gs-autobranch` skill are retired.

Native GS supports only:

- dirty cached Git trunk: ordinary child creation, checkpoint, then public `gh stack init`;
- dirty non-trunk proved as the invoking provider worktree's unique current top: public `gh stack add`, observed dirty attachment, then checkpoint.

It requires exactly v0.1.0, cached origin HEAD without fetch, a named source with no active operation, pending work, a valid absent child ref, and TTY confirmation or `--yes`. It refuses peer-only membership and never scans peers, initializes an existing non-trunk branch, extracts a latest commit, accesses provider-private lifecycle state, retries, rolls back, deletes a branch, manages Slots, pushes, or mutates GitHub. Post-inspection runs after provider failure; known partial and ambiguous results preserve forward recovery facts.

`/ns:flow:gs:autoslot` remains a provisional generic Skill-Backed Command backed by `ns-flow-gs-autoslot`. It is not redesigned or removed by native autobranch. Its embedded autobranch description must remain aligned with the native GS contract until destination provider establishment and source disposition are separately proven. It must not create a second autobranch mutation authority by invoking and then replaying native autobranch.

GT behavior is unchanged. There is no generalized GT/GS transaction, GS latest-commit operation, or `ns flow gs` CLI route.
