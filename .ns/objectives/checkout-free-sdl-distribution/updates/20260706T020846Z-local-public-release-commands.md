# Semantic Update: Local Public Release Commands

## Summary

Added the planned local release lane for the intended public `@nseng-ai/*` package set:

- `just bump-version VERSION` for coordinated no-registry-write manifest version bumps and lockfile refresh.
- `just publish-dry-run VERSION` for no-registry-write full-set qualification and publish-plan preview.
- `just publish VERSION` for guarded local npm publication: clean worktree, no-write qualification, already-published precheck, explicit interactive confirmation, ordered publishes, and strict registry verification.

The Objective wording now says local release automation rather than CI. No GitHub Actions workflow was added.

## Safety Semantics

- `bump-version` and `publish-dry-run` do not publish to npm.
- `publish` refuses dirty worktrees before any npm write.
- `publish` fails before publishing if any intended package already exists at the requested version.
- `publish` requires a TTY and exact `publish VERSION` confirmation.
- The first implementation intentionally has no resume mode; a partial publish failure requires choosing a new version or designing a future explicit resume command.

## Validation Evidence

Implementation validation for this update should remain no-write. Expected evidence includes `just --list` showing the three commands, coordinated-version script probes, no-write dry-run qualification, and TypeScript/repo formatting checks. Real `just publish VERSION` remains reserved for an explicitly authorized release session.
