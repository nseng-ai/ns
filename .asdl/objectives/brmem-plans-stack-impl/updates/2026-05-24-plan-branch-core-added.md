# Plan Branch Core Added

## Summary

The second implementation slice added a shared branch-from-plan-file core operation in `ts/packages/pi-extensions/src/brmem-plans/plan-branch.ts` with fake-driven coverage in `ts/packages/pi-extensions/test/brmem-plan-branch.test.ts`.

The core validates the plan slug and temp file, derives or accepts a target branch name, preflights Git branch existence, preflights the canonical Branch Memory target, creates the local branch with plain Git, writes the plan to namespace `brmem-plans` as key `<slug>.md` on the target branch, and reports structured success or partial-failure evidence.

Verification passed:

- `cd ts/packages/pi-extensions && bun test test/create-brmem-plan.test.ts test/brmem-plan-branch.test.ts`
- `cd ts/packages/pi-extensions && bun run check`

## Objective Impact

This completes the branch-from-plan-file core roadmap row and the focused fake-driven test row. The new core respects the decided storage contract without adding legacy namespace/base aliases, and it avoids a runtime Graphite dependency by using plain Git for generic branch facts and branch creation.

Command/tool wiring and skill/prompt renames remain separate reviewable slices.

## Follow-Ups

- Wire the new core into the `create-brmem-plan-branch` Pi command/tool surface.
- Rename the plan-branch skills and prompt plugin after command/tool wiring is reviewable.
- Run broader formatting/check gates for Markdown and TypeScript as subsequent slices touch user-facing docs and prompts.
