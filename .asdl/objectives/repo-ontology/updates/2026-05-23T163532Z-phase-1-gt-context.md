# Phase 1 — asdl-core Gt context landed

## Summary

Appended `## Gt` to `packages/asdl-core/CONTEXT.md` as the third asdl-core subdomain context after Clinkr and Git. The section records the Graphite gateway vocabulary around stack metadata and stack operations, including:

- `GtGateway` and `Graphite stack` as the shared boundary for `gt` CLI calls behind a gateway.
- `StackInfo` as a focused snapshot around the branch checked out at a `cwd` — it always names the current Graphite branch and is not a complete branch graph.
- `Current stack branch` and `Graphite trunk` (the branch Graphite says stacks merge into, from `gt trunk`).
- Immediate vs recursive stack edges: `Graphite parent` and `Graphite children` are immediate (from `gt parent` / `gt children`); `Graphite ancestors` and `Graphite descendants` are recursive directions surfaced by `gt log --stack`.
- `Downstack` (toward trunk through ancestors) and `Upstack` (away from trunk through descendants) as Graphite's documented direction terms.
- `NoParent` as a successful Graphite answer for tracked branches with no parent, distinct from `UntrackedBranch` and `GtCommandFailure` which are non-ideal Graphite states.
- `GtBranchInfo` (raw `gt branch info` diagnostics), `Restack upstack`, `Graphite sync`, and `Stack warning` (non-fatal caveat attached to a successful `StackInfo`).

The Relationships subsection explicitly:

- Documents Graphite's PR-stack direction vocabulary (downstack/upstack), and notes the gateway uses branch names because local `gt` commands operate on branches.
- Separates immediate-only edges (`parent`, `children`) from recursive walks (`ancestors`, `descendants`); records that `StackInfo.ancestors` is trunk-first and includes `Graphite trunk` when trunk appears in the walk, while `StackInfo.descendants` excludes the current branch.
- Treats **Graphite trunk** and Git's **Trunk branch** as separate sources of truth (`gt trunk` vs `origin/HEAD` and `main`/`master` fallbacks) rather than synonyms; mismatches are Graphite configuration drift, not a definition collision.
- Draws the `GtGateway` vs `GitGateway` boundary: use `GitGateway` for ordinary repository and worktree facts, `GtGateway` only for explicitly Graphite behavior.

Updated `/CONTEXT-MAP.md` to link `packages/asdl-core/CONTEXT.md#gt` and mark the Gt H2 as *Present*.

Verification: `just dprint-check` passed; `git diff --check` clean. No production Python code changed.

## Objective Impact

- `roadmap.md`: Phase 1 `## Gt` task marked `[x]` with completion evidence summarizing the Language entries and Relationships that landed.
- `objective.md`: unchanged; durable scope, completion criteria, assumptions, risks, and open questions remain accurate. The cross-context "Review" / "State/status" / "branch/ref" ambiguities flagged in the map are still open candidates for Phase 4 resolution; the Gt section sharpened the branch/ref/start-point boundary by keeping Graphite parent/ancestor/descendant strictly separate from Git's branch/ref/start-point vocabulary.
- The drift-mitigation discipline from Phase 0.5 is holding: the `## Gt` section was authored against current source rather than the original scaffold's framing, so the H2 anchors landing now match the rebaselined map.

## Follow-Ups

- Next roadmap item: Phase 1 `## Gh` in `packages/asdl-core/CONTEXT.md` — resolve `PRState` vs `PRStateFilter` (case + meaning), `PRReview` vs `PRReviewThread` vs `PRReviewComment` vs `IssueComment`, and `PRSummary` vs `PRDetails`.
- During `## Gh`, keep the State/status ambiguity candidate in mind: PR state, `format.state_badge`, and (later) `packagechk.CheckStatus` should each get a canonical local definition before Phase 4 decides what survives as a map-level note.
- During the future `asdl-slots` session, cross-reference Graphite **Graphite parent** / **Graphite children** vocabulary without re-defining stack relationships as slots concepts.
