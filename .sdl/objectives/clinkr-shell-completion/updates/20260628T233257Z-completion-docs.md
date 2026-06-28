# Completion Documentation Landed

## Summary

Documented the shell-completion feature and its boundaries, completing the final non-parked roadmap row.

- `ts/packages/kernel/README.md` gained a "Shell completion" section covering supported shells (bash, zsh, fish), `sdl completion bash|zsh|fish` setup with eval/source examples, the hidden `sdl completion exec resolve` resolver and newline candidate-only stdout contract, lazy-loading/diagnostics behavior, dynamic value completion via `completionProvider` with the `sdl slot checkout` local-branch proof, limitations (no PowerShell, no Carapace export, no rich file/dir helper, descriptions omitted, no standalone `slot` completion), and an explicit no-compatibility-aliases-for-autocomplete statement.
- `ts/packages/kernel/docs/sdk-reference.md` expanded the `SdlCommandCompletionProvider` entry with boundaries (selected-command async path only, append+dedupe, cheap/read-only, captured failures with candidate-only stdout and exit code 0) and a worked local-branch completion example, cross-linked to the README section.

Validation:

- `cd ts && pnpm --filter @sdl/kernel test` — pass (13 files, 71 tests)
- `just dprint-check` — pass

## Objective Impact

This satisfies the documentation Completion Criterion: documentation now explains supported shells, installation commands, limitations, and why compatibility aliases are not added for completion. With this row complete, no active non-parked semantic roadmap work remains; only the parked PowerShell, Carapace export, rich file/directory helper, and monorepo-wide dynamic completion items are left.

All Completion Criteria now appear satisfied: tested Clinkr completion API/subpath; candidate coverage for commands/options/framework/enums; `sdl completion <shell>` plus resolver with project-local extension tests; preserved lazy loading and selected-command-only import; a written dynamic-hooks decision (implemented); documentation; and passing targeted validation. The Objective appears ready for `objective-close` with a `completed` outcome.

## Follow-Ups

- Consider `objective-close` (completed) since all Completion Criteria are met and only parked items remain.
- Parked work (PowerShell, Carapace export, rich file/directory helpers, monorepo-wide dynamic completion) can be promoted into a follow-up Objective if/when prioritized.
