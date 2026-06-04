# Skills Docs Validation

## Summary

Completed the final planned stack slice by adding public Claude Code skills and updating planned-branch documentation/reference prose to the new package and CLI contract:

- added `planned-branch-write-plan`, `planned-branch-create`, and `planned-branch-impl` under `skills/`;
- installed the skills for `.agents/skills` and `.claude/skills` with the expected symlink layout;
- updated workflow docs and resource catalogs to the `@asdl/planned-branch` package, `planned-branch` CLI, `/planned-branch:*` Pi commands, `planned-branch` Branch Memory namespace, and `~/.asdl/planned-branch/plans/...` local store; and
- removed stale active references to the old command/storage names.

## Objective Impact

All non-parked roadmap rows are now complete. The Objective remains open for user inspection and an explicit closure decision; parked work for future human browsing commands and npm publication/release automation remains parked.

Evidence: local branch diff against `planned-branch-ts-cli/pi-cmux-refactor`; skill symlink and `npx skills list` verification passed; stale-reference search across `.pi`, docs, packages, TS, and skills found no active old-name matches; `dprint check`, `just dprint-check`, `just ts-check`, and `just ts-test` passed.

## Follow-Ups

- Inspect the final stack diff.
- Close the Objective if the completed stack is accepted.
- Submit PRs manually only if/when requested.
