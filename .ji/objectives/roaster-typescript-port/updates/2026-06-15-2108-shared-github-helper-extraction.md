# Shared GitHub Helper Extraction Landed

## Summary

The TS roaster stack extracted repeated GitHub CLI execution, temporary JSON-file handling, and scripted test-runner support into shared `@asdl/core` helpers. Roaster's real GitHub gateway now calls `runGitHubCli` and `withTemporaryJsonFile`, and roaster gateway tests reuse shared command/Git fakes instead of carrying bespoke support classes.

Evidence: local branch diff against `master`; PR #1637 corroborates the same file set (`Extract shared GitHub CLI, temp-file, and test helpers`). Verification: `just ts-check` passed after the Graphite restack conflict resolution.

## Objective Impact

This does not complete the roaster TypeScript port, but it makes the in-progress gateway slices more durable and closer to the intended repo-wide TypeScript conventions. The roaster-local GitHub PR gateway now relies on a shared typed `gh` runner with startup-error metadata and shared temp-file cleanup semantics, reducing duplicated adapter code before the remaining comment paths are proven in CI.

The broader GitHub gateway risk remains open until the full TS roaster CI flow exercises changed-file loading, inline review creation, and summary-comment create/update on a real PR.

## Follow-Ups

- Continue treating the roaster-local GitHub gateway row as in progress until all comment paths are exercised by the TS CI flow.
- Prefer shared asdl-core test helpers for future roaster gateway tests instead of reintroducing roaster-local command/Git fake classes.
