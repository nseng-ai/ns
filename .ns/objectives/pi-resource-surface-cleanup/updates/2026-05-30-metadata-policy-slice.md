# Metadata Policy Slice

## Summary

Implemented the metadata/docs-first cleanup slice.

- Added a resource-surface policy and current disposition table to `docs/pi/README.md`.
- Recorded the runtime policy for real-directory `.agents/skills/<name>/` entries: keep them live by default as vendored or GitHub-sourced developer aids, exclude them from deep review, and remove or disable them only through explicit skill-management work.
- Captured the user-local boundary for CMUX, `gh-pr`, `stack-latest`, and user-local skills as advisory personal-resource findings rather than closure-critical repo work.
- Normalized repo-owned command skill descriptions from bare `Command` to `Command: <skill-name>`.
- Made `worktree-status`, `brmem-status`, and `gt-status` autocomplete descriptions distinct while preserving their shared status behavior.
- Re-ran Pi RPC `get_commands`: the inventory still reports 74 visible commands, with updated status/skill descriptions and the known `/objective-stack-impl` extension-plus-prompt duplicate as the only duplicate command name observed.
- Verification: `git diff --check`, `just dprint-check`, `just ts-check`, and `just ts-test` passed after formatting with `just dprint-fix`.

## Objective Impact

The first implementation slice is now resolved and executed: metadata/docs cleanup came first, duplicate `/objective-stack-impl` cleanup remains next, and `/land` disposition follows after policy is explicit.

This completes the low-risk checked-in metadata cleanup and the remote-skill runtime policy decision. The main policy doc now distinguishes repo-owned project resources, external/vendored skills, and user-local personal resources. The Objective remains open because the duplicate `/objective-stack-impl` surface and `/land` risk disposition are still unresolved, and a final post-change RPC inventory should be recorded after later material changes.

## Follow-Ups

- Resolve the duplicate `/objective-stack-impl` visible surface by clarifying the extension wrapper and prompt-template relationship.
- Decide `/land` disposition: promote/test, deprecate/replace, or retain with explicit safety rationale.
- Re-run Pi RPC command inventory after the next material surface change and again before closure.
