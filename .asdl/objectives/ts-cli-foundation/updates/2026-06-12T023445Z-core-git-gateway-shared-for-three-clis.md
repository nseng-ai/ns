# Core git gateway shared for three CLIs

## Summary

`@asdl/core` now exposes a shared git gateway as isolated subpaths: `@asdl/core/git` for the production `GitGateway`/`RealGitGateway` and `@asdl/core/git/testing` for `InMemoryGitGateway`. The v1 surface covers repository root lookup, optional repo root lookup, current branch, trunk branch, origin URL, HEAD commit, branch-ref validation, local branch presence, and branch creation at HEAD.

`plans`, `planned-branch`, and `asdl-dev` now consume the shared gateway. Their local git gateways, local git fakes, and duplicate gateway tests are removed, with adapter-level coverage moved to `asdl-core`. The planned-branch-to-plans backwards type dependency is gone: planned-branch passes the core gateway directly into plans, and `plans-git-adapter.ts` is deleted.

The naming model is unified on `currentBranch`; planned-branch domain code still uses source/implementation branch language at call sites where that is the domain concept. `trunkBranch` follows the Python parity decision: `git symbolic-ref --short refs/remotes/origin/HEAD`, strip `origin/`, verify local branch presence, then fall back to local `main`/`master`, otherwise missing. asdl-dev adopted the core error contract; accepted divergences include `current_branch_failed`, repo-root error codes from core, preview-url detached-head JSON text, and the new `displayCommand` key.

Evidence: local Graphite stack diff against `core-git-gateway-consolidation`; per-phase `pnpm --dir ts run check` and `pnpm --dir ts run test` passed.

## Objective Impact

The shared git gateway roadmap row moves to partial completion. The foundation now owns the shared gateway and fake for three of the four CLI packages, dissolving the planned-branch/plans dependency inversion and consolidating triplicated fake behavior.

The row remains open only for `pr-address`: its git methods stay out of scope and should fold in during the pr-address clinkr shell migration, as originally sequenced. The parked umbrella Result-type decision remains parked; this work only lifts git-scoped structural result types.

The "new monolith" risk remains mitigated: git shipped as explicit subpath exports rather than as a package-root grab bag, so packages can adopt `@asdl/core/git` without pulling in unrelated core modules.

## Follow-Ups

- Fold `pr-address` git methods into `@asdl/core/git` during the `pr-address` shell migration.
- Keep `pending-worktree.ts` separate unless a future decision explicitly scopes it into this gateway.
- Continue the planned sequence: payload/JSON-input ownership, Zod boundary validation, asdl-dev public surface, and scenario-test scaffolding consolidation remain open rows.
