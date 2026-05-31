# GitHub and Graphite Landing Surface Resolution

## Summary

Resolved the landing command disposition slice.

- Promoted the former vibecoded `.pi/extensions/land.ts` behavior into package-tested `ts/packages/pi-extensions/src/land.ts`.
- Registered the GitHub single-PR landing command as `/gh:land` through the project adapter `.pi/extensions/gh.ts` and removed the legacy `/land` adapter/alias.
- Preserved the existing `/land` safety behavior for now: the command loads the current branch PR with `gh pr view`, refuses non-`master` bases, uses the PR title/body as the squash commit message, and calls `gh pr merge -s --match-head-commit <head> --subject <title> --body <body>`.
- Renamed the Graphite stack landing command to `/gt:land-stack` through `.pi/extensions/gt.ts` and removed the legacy `/land-stack` adapter/alias.
- Left `/gt:land-stack` intentionally Pi-only for now; the docs do not claim a Codex/Claude stack-landing workflow.
- Updated `docs/pi/README.md` so the landing dispositions name the Pi entrypoints, package-tested implementation paths, Codex/Claude GitHub guidance for `/gh:land`, and the Pi-only caveat for `/gt:land-stack`.

Fresh Pi RPC `get_commands` evidence after the change reports 74 visible commands, includes `/gh:land` from `.pi/extensions/gh.ts`, includes `/gt:land-stack` from `.pi/extensions/gt.ts`, still includes the `/objective:*` wrappers and `/skill:objective-stack-impl`, reports no duplicate command names, and reports no legacy `/land` or `/land-stack` command names.

Fresh checked-in skill/instruction evidence reports `objective-stack-impl` present in `skills/`, `.agents/skills/`, and `.claude/skills/`, with `.agents/skills/objective-stack-impl -> ../../skills/objective-stack-impl` and `.claude/skills/objective-stack-impl -> ../../.agents/skills/objective-stack-impl`. `AGENTS.md` and `CLAUDE.md` both remain present as instruction surfaces.

Verification: focused `land`/`land-stack` tests passed; `just ts-check` passed; `just ts-test` passed; `just dprint-check` passed after formatting with `just dprint-fix`; `git diff --check` passed.

## Objective Impact

The final closure-critical mutating command disposition is resolved. `/gh:land` is the supported Pi entrypoint for single-PR GitHub squash landing, backed by package tests and the existing guarded `gh pr merge -s --match-head-commit` behavior. Codex and Claude should use the equivalent GitHub CLI flow rather than invoking a Pi slash command.

`/gt:land-stack` is explicitly a Pi-only Graphite stack landing surface for now. This avoids pretending that a portable non-Pi stack-landing workflow exists before one is designed, while still making the Pi command ownership clear through the `gt:` namespace.

With the final inventories and validation recorded, the active non-parked roadmap work appears complete and the Objective may be ready for `objective-close` after user confirmation.

## Follow-Ups

- If a portable Codex/Claude Graphite stack-landing workflow is desired later, design it as a separate follow-up rather than retrofitting this Objective.
- Consider `objective-close` for `pi-resource-surface-cleanup` once the final diff is reviewed.
