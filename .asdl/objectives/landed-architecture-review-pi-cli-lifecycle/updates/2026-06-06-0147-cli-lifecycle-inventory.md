# Pi CLI Lifecycle Inventory Completed

## Summary

The initial lifecycle inventory is complete. The shared Pi CLI bridge in `ts/packages/pi-extensions/src/cli-command-extension.ts` currently owns command registration, shell-like argument parsing, positional-argument rejection, idle waiting, runner dependency wiring, optional confirmation bridging, live status/widget progress, final output formatting and rendering, usage-error editor restoration, trace logging, and headless stdout/stderr fallback behavior.

Submit-specific source-control policy remains outside that shared bridge: `ts/packages/asdl-dev/src/cli.ts` and `ts/packages/asdl-dev/src/submit.ts` own checkpoint-before-submit behavior, Graphite restack/submit/verification sequencing, restack confirmation copy, and non-interactive guidance.

Targeted evidence passed: `bun test ts/packages/pi-extensions/test/cli-command-extension.test.ts ts/packages/asdl-dev/test/scenario/submit-cli.test.ts ts/packages/pi-extensions/test/code.test.ts ts/packages/pi-extensions/test/asdl-dev-extension.test.ts`.

## Objective Impact

This completes the inventory roadmap item. Current evidence suggests the lifecycle seam is already fairly local and explicit in `cli-command-extension.ts`, while command-specific policy remains in individual CLIs/commands. The next Objective decision is whether that locality is sufficient to park the work with rationale, or whether to make a narrow deepening slice.

The most plausible deepening candidate found during inventory is targeted bridge-level coverage for `hasUI: false` behavior: final stdout/stderr fallback and absence of editor restoration/live UI in headless contexts. A broader harness-neutral abstraction is not yet justified by the inventory alone.

## Follow-Ups

- Name the seam explicitly and decide whether to park the current shape or add the narrow headless bridge test/deepening slice.
- Keep broader source-control mutation UX out of this Objective unless it directly changes the shared lifecycle boundary.
