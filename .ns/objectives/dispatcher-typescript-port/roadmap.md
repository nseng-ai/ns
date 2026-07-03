# Roadmap

## Work

- [x] Create the dispatcher Child Objective.
  - Evidence: this Objective now exists under `.asdl/objectives/dispatcher-typescript-port/` as the dispatcher capability slice for `port-asdl-toolkit-to-typescript`.
- [x] Inventory the current Python dispatcher contract.
  - Evidence: `contract-inventory.md` records source, tests, workspace wiring, caller discovery, durable behavior, incidental behavior, and the recommended next action.
- [x] Decide whether to port or retire the placeholder.
  - Decision: retire the placeholder. Fresh caller discovery found no active consumers beyond the package's own smoke tests and workspace/build/test wiring, and there was no operation contract to preserve.
- [x] Execute the chosen implementation or retirement slice.
  - Evidence: deleted `packages/asdl-dispatcher`, removed root workspace/build/test references, regenerated `uv.lock`, removed active context-map tracked-stub wording, and did not create a TypeScript dispatcher package.
- [x] Feed the decision and outcome back to the parent TypeScript migration Objective.
  - Evidence: parent migration ledger now marks dispatcher as retired/no-port; parent roadmap records retirement as a completed capability outcome with no TS package created.

## Parked

- Real GitHub Actions dispatch behavior. The retired package name and help text gestured at dispatching coding tasks, but no operation contract existed. Future dispatch work should start from product requirements in a new slice.
