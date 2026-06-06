# Roadmap

## Work

- [x] Inventory current Pi CLI lifecycle behavior and tests.
  - Evidence: `ts/packages/pi-extensions/src/cli-command-extension.ts` concentrates registration, parsing, positional-argument rejection, idle waiting, runner dependency wiring, confirmation bridging, live progress, final rendering, usage-error restoration, tracing, and headless fallback behavior.
  - Evidence: `ts/packages/asdl-dev/src/cli.ts` and `ts/packages/asdl-dev/src/submit.ts` keep submit-specific restack/checkpoint/Graphite policy and confirmation copy outside the shared bridge.
  - Verification: targeted Pi extension and asdl-dev submit suites passed.
- [ ] Name the lifecycle seam and decide whether to deepen or park.
  - Decide where shared lifecycle mechanics should end and command-specific policy should begin.
  - Inventory suggests the shared seam is currently local to `cli-command-extension.ts`, while command-specific policy remains in individual CLIs/commands; the next step is to decide whether this is sufficient or whether a narrow headless/test deepening is warranted.
- [ ] Implement the smallest useful lifecycle deepening slice, if warranted.
  - Keep any implementation focused on the named seam and validate with targeted TypeScript tests.
  - If no implementation is warranted, replace this with a parked rationale or close with evidence rather than forcing churn.
- [ ] Record completion evidence and move unrelated follow-ups elsewhere.
  - Record meaningful Objective evidence after the inventory/decision/implementation or parked rationale.
  - Move broader source-control mutation policy, Pi SDK/TUI redesign, or command-specific product questions out of this Objective.

## Parked

None yet. Park source-control mutation UX, Pi SDK/TUI redesign, or command-specific product-policy work here if it is discovered but not part of the lifecycle seam.
