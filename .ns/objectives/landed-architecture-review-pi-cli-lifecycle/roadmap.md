# Roadmap

## Work

- [x] Inventory current Pi CLI lifecycle behavior and tests.
  - Evidence: `ts/packages/pi-extensions/src/cli-command-extension.ts` concentrates registration, parsing, positional-argument rejection, idle waiting, runner dependency wiring, confirmation bridging, live progress, final rendering, usage-error restoration, tracing, and headless fallback behavior.
  - Evidence: `ts/packages/asdl-dev/src/cli.ts` and `ts/packages/asdl-dev/src/submit.ts` keep submit-specific restack/checkpoint/Graphite policy and confirmation copy outside the shared bridge.
  - Verification: targeted Pi extension and asdl-dev submit suites passed.
- [x] Name the lifecycle seam and decide whether to deepen or park.
  - Decision: the shared lifecycle seam remains package-local in `@asdl/pi-extensions`, centered on `ts/packages/pi-extensions/src/cli-command-extension.ts`.
  - Boundary: shared lifecycle mechanics include parsing and shape rejection, idle wait, runner dependency wiring, confirmation bridging, live progress, final output routing/rendering, usage-error restoration, tracing, and headless fallback.
  - Boundary: command-specific policy such as confirmation copy, mutation semantics, and Graphite/source-control sequencing remains in individual commands and CLIs such as `ts/packages/asdl-dev/src/submit.ts`.
  - Decision: no new package or public SDK surface is warranted until multiple consumers need a harness-neutral lifecycle API.
- [x] Implement the smallest useful lifecycle deepening slice, if warranted.
  - Evidence: `ts/packages/pi-extensions/test/cli-command-extension.test.ts` now covers `hasUI: false` stdout/stderr final-output fallback, no editor restoration without UI/editor capability, no live status/widget attempts in headless mode, UI custom-message output, and usage/prose error restoration only when supported.
  - Evidence: production behavior already matched the desired lifecycle contract, so no source extraction or runtime change was needed.
  - Validation: `bun test ts/packages/pi-extensions/test/cli-command-extension.test.ts`, `bun run --cwd ts/packages/pi-extensions check`, `just ts-check`, and `just ts-test` passed.
- [x] Record completion evidence and move unrelated follow-ups elsewhere.
  - Evidence: `updates/2026-06-06-0213-package-local-cli-lifecycle-seam.md` records the seam decision, validation, and follow-up boundary.
  - Broader source-control mutation UX remains outside this Objective.

## Parked

None yet. Park source-control mutation UX, Pi SDK/TUI redesign, or command-specific product-policy work here if it is discovered but not part of the lifecycle seam.
