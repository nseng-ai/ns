# Command Constant Review Fix

## Summary

PR review found that the CCC implementation-command formatter test still duplicated the `/sdl:branch-context:impl-attached-plan` command string. The branch now keeps that sibling test on the Peer API boundary by exporting `IMPL_BRANCH_CONTEXT_COMMAND_NAME` from `@sdl/branch-context/api` and deriving the expected formatted command from that constant instead of hardcoding the string.

This supersedes the older update's statement that the CCC test intentionally asserted exact command strings directly; existing Semantic Updates remain historical records and were not edited.

## Objective Impact

The final sibling-boundary row is still complete, but the final shape is sharper: sibling tests use `@sdl/branch-context/api` for both implementation command formatting and command-name assertions, avoiding a duplicated command string while preserving command-surface ownership and current user-visible command names.

Validation evidence:

- `just`
- PR #2138 review thread `PRRT_kwDOR4YhMs6MNyM3` was resolved after the branch update.

## Follow-Ups

- No additional branch-context/plans migration work was identified by this review fix.
- Closure should be evaluated from the refreshed roadmap and completion criteria rather than from the historical wording in earlier Semantic Updates.
