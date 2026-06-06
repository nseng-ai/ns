# Roadmap

## Work

- [ ] Inventory current Pi CLI lifecycle behavior and tests.
  - Inspect `ts/packages/pi-extensions/src/cli-command-extension.ts`, `ts/packages/asdl-dev/src/submit.ts`, and the most relevant command-extension tests.
  - Capture the lifecycle phases and current evidence for parsing, validation, idle waiting, confirmation, live output, result rendering, usage-error restoration, tracing, and headless behavior.
- [ ] Name the lifecycle seam and decide whether to deepen or park.
  - Decide where shared lifecycle mechanics should end and command-specific policy should begin.
  - Record whether a harness-neutral module/interface is warranted or whether the current locality is acceptable.
- [ ] Implement the smallest useful lifecycle deepening slice, if warranted.
  - Keep any implementation focused on the named seam and validate with targeted TypeScript tests.
  - If no implementation is warranted, replace this with a parked rationale or close with evidence rather than forcing churn.
- [ ] Record completion evidence and move unrelated follow-ups elsewhere.
  - Record meaningful Objective evidence after the inventory/decision/implementation or parked rationale.
  - Move broader source-control mutation policy, Pi SDK/TUI redesign, or command-specific product questions out of this Objective.

## Parked

None yet. Park source-control mutation UX, Pi SDK/TUI redesign, or command-specific product-policy work here if it is discovered but not part of the lifecycle seam.
