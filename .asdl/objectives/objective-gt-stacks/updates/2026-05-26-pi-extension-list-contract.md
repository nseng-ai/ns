# Pi Objective extension list contract migration

## Summary

Migrated the repo-local Pi Objective extension to the checkout-local `objective list --format json` contract introduced by the Phase 1 core slice. The extension parser now expects `trunk_branch`, `root_path`, `status_filter`, `names_only`, and `records[]` with `slug`, `status`, and `latest_update_iso`; it rejects the old branch-projection envelope.

Picker labels are now record-oriented: they show Objective slug, checkout-local status, and latest update, while preserving changed-Objective suggestions from committed Objective-path diffs versus trunk. Branch-count, latest-work-branch, max-slice, `--current`, and `--view` assumptions have been removed from the selection flows for `/objective-next`, `/objective-current`, `/objective-update`, and `/objective-stack-impl`.

`/objective-list` is now a thin checkout-local display wrapper that controls Markdown output, accepts retained flags such as `--names` and `--status`, rejects removed branch-projection flags before invoking the CLI, and advertises checkout-local completions. Objective docs and selection/closure skills now describe active candidates as checkout-local open records instead of open plus in-flight branch projections.

Evidence: local branch diff against Graphite parent `checkout-local-objective-list-core`; no pre-update uncommitted implementation changes. Verification: `cd ts/packages/pi-extensions && bun test && bun run check` passed.

## Objective Impact

Phase 5 is now mostly complete for the existing Pi Objective surfaces. The TypeScript consumer breakage risk from removing old `objective list` JSON fields is de-risked for the Objective extension parser, picker, prompt-backed Objective commands, and `/objective-list` wrapper.

Changed-Objective suggestions remain partially complete: committed Objective diffs versus trunk still drive suggestions and still require explicit selection when multiple candidates exist, but checkout-local outstanding-change facts are not yet integrated because the `(x)` dirty-marker slice has not landed.

The `/objective-gt-stacks` wrapper remains unimplemented because the underlying `objective gt stacks` command has not been built yet. Public Objective docs and skills now use checkout-local list language; the Graphite stack projection language should be completed when the explicit Graphite command exists.

## Follow-Ups

- Finish the Phase 1 `(x)` dirty-marker slice, then use its checkout-local outstanding-change facts in Pi Objective suggestions.
- Build `objective gt stacks` before adding the `/objective-gt-stacks` Pi wrapper and its tests.
- When `objective gt stacks` exists, update public skill/docs language to describe the complete checkout-local vs Graphite-stack split.
- Run broader cross-language repo validation after the remaining dirty-marker and Graphite-stack command slices land.
