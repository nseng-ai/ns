# asdl-core Git Construction Context Localized

## Summary

Added `asdl_core.git.construction` as the canonical Git production construction module for repository-root discovery, trunk probing, and construction of a repo-bound `GitGateway`. The builder requires a git repository, always attempts trunk resolution, and returns typed unavailable state when git is missing or the current directory is outside a repository; trunk remains optional so package contexts can own their own trunk-required UX.

Mandatory-Git consumers now use this shared construction path instead of re-deriving `RealGitGateway(repo_root=resolve_repo_root(...), trunk_branch=...)` wiring. `asdl-objectives` consumes the shared Git context while preserving its existing unavailable/trunk messages. `brmem` and `asdl-handoff` now expose package-local unavailable context records and loaders so not-in-repo/git-missing states become Clinkr failures rather than late runtime failures. `asdl-slots` now uses the shared Git context for CLI context construction and checkout shell completion, and its duplicate slots-local real-git builder was removed. `roaster` imports trunk resolution from the new construction module.

Validation evidence:

- `uv run pytest packages/asdl-core/tests/gateways/test_git_construction.py -q`
- `uv run pytest packages/asdl-core/tests -q`
- `uv run pytest packages/asdl-objectives/tests -q`
- `uv run pytest packages/brmem/tests -q`
- `uv run pytest packages/asdl-handoff/tests -q`
- `uv run pytest packages/asdl-slots/tests -q`
- `uv run pytest packages/roaster/tests -q`
- `just`

## Objective Impact

The roadmap row **Localize `asdl-core` production gateway construction** moves to `[~]` rather than `[x]`. The Git-focused slice has landed-state evidence: repo/trunk probing is centralized for migrated mandatory-Git consumers, `brmem`/`handoff` have strict repo-bound context loading with user-facing unavailable failures, and `asdl-slots` no longer owns a duplicate trunk-bound Git construction helper.

The row remains partial because this branch deliberately did not design the broader production-construction story for GitHub PR gateways or Graphite gateways.

## Follow-Ups

- Design and implement PR/GitHub production construction locality where it reduces repeated `RealPRGateway` wiring without weakening command-specific behavior.
- Treat Graphite construction separately and preserve the runtime Graphite dependency boundary; Graphite should remain opt-in behind explicit Graphite-named surfaces.
- Revisit `aretro` and `asdl-pr-address` direct `RealGitGateway()` construction with command-specific context loading rather than forcing repo-required construction onto `aretro --repo` or PR-only operations.
