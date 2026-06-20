# Code and Dev Prefix Resolution

## Summary

Resolved the code/source-control naming slice by separating the repo's local code-management surface from the `asdl-dev` mirror surface.

Current checked-in evidence:

- `AGENTS.md` now defines `code-` as the skill prefix for codebase/source-control management and `/code:*` as the matching Pi slash-command namespace.
- `dev-` and `/dev:*` no longer mean generic code work; they are reserved for future `asdl-dev`-affiliated surfaces or explicitly parked dev-prefixed workflows.
- The old source-control skill names `dev-checkpoint`, `dev-gt-restack-resolve`, and `dev-gt-stackify-branch` have become `code-checkpoint`, `code-gt-restack-resolve`, and `code-gt-stackify-branch`, with installed `.agents` / `.claude` surfaces and lock entries updated.
- The project Pi code-management adapter is `.pi/extensions/code.ts`; it exposes `/code:changes`, `/code:autobranch`, `/code:land`, and `/code:land-stack` without the old `/cp`, `/newbr`, `/submit`, `/gh:land`, or `/gt:land-stack` aliases.
- `asdl-dev` CLI mirrors remain under `.pi/extensions/asdl-dev.ts` as `/dev:preview-url`, `/dev:cp`, and `/dev:submit`.
- Current checkout counts: `skills/` has 42 first-party `SKILL.md` files; `.agents/skills/` and `.claude/skills/` each expose 50 entries; `skills-lock.json` has 50 entries; `.pi/extensions/` has 10 project-local adapter files; `.pi/prompts/` and `.pi/skills/` are absent.

Evidence: current `master` is clean and contains landed commit `b5bc35c9` for the code/dev prefix migration. PR evidence was not required; local checkout and commit evidence were sufficient. Verification for this Objective tracking edit: `git diff --check` and `just dprint-check` passed.

## Objective Impact

The taxonomy and naming-policy rows are now materially advanced. The Objective can treat the code/source-control prefix decision as resolved: local worktree, branch, stack, and landing workflows use `code-` / `/code:*`, while `dev-` / `/dev:*` belongs to `asdl-dev` mirrors or separately justified exceptions.

The first-party audit remains open because the remaining dev-prefixed internal skills (`dev-gh`, `dev-gh-ci-debug`, `dev-just-fix`, and `dev-stacker-agent`), Objective/prototype runners, PR-address/review surfaces, Pi UI/internal helpers, command-wrapper quality issues, and remaining `PENDING_REGEN` lock entries still need final disposition or explicit acceptance.

Remote/vendored policy is now treated as decided for this Objective: real-directory external skills remain live by default as explicit developer aids and are excluded from first-party deep review unless explicitly requested.

## Follow-Ups

- Finish the first-party skill cluster audit for the remaining open clusters and explicitly accept or resolve each visible quality issue.
- Decide the remaining dev-prefixed internal skills as explicit exceptions, renames, or future `asdl-dev` surfaces.
- Settle remaining `PENDING_REGEN` lock entries or accept them with rationale.
- Run a final stale-name pass across `CLAUDE.md`, skill docs, and catalog/docs before closure.
