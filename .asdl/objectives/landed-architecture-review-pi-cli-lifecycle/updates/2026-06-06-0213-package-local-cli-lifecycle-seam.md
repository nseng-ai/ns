# Package-Local Pi CLI Lifecycle Seam Decided

## Summary

The Pi CLI lifecycle seam remains package-local in `@asdl/pi-extensions` rather than moving to a new workspace package or public SDK surface. Targeted bridge tests now cover headless final output fallback, absence of UI live progress/editor restoration without UI support, UI custom-message rendering, and usage/prose error restoration only when editor restoration is supported.

## Objective Impact

This completes the seam decision and the smallest useful deepening slice for `landed-architecture-review-pi-cli-lifecycle`. The shared lifecycle mechanics are parsing and shape rejection, idle wait, runner dependency wiring, confirmation bridging, live progress, final output routing/rendering, usage-error restoration, tracing, and headless fallback inside `ts/packages/pi-extensions/src/cli-command-extension.ts`.

Command-specific policy such as confirmation copy, mutation semantics, and Graphite/source-control sequencing remains in individual commands and CLIs such as `ts/packages/asdl-dev/src/submit.ts`. No new package or public SDK surface is warranted because there is not yet a second consumer requiring a harness-neutral lifecycle API. A future package-internal extraction remains acceptable only if it materially improves testability or locality.

Validation:

- `bun test ts/packages/pi-extensions/test/cli-command-extension.test.ts` — passed, 22 tests.
- `bun run --cwd ts/packages/pi-extensions check` — passed.
- `just ts-check` — passed for all TypeScript workspaces.
- `just ts-test` — passed, including 635 `@asdl/pi-extensions` tests.

## Follow-Ups

- If future commands need the lifecycle outside `@asdl/pi-extensions`, reconsider a harness-neutral package or internal module with concrete multi-consumer evidence.
- Keep broader source-control mutation UX outside this Objective.
