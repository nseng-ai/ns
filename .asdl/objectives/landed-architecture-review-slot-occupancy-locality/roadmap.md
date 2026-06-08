# Roadmap

## Work

- [x] Inspect slot occupancy locality against current code and existing operation-state evidence.
      Evidence: inspected `asdl-core` Git occupancy facts, `asdl-slots.inventory`, mutating lifecycle paths (`checkout`, `checkout --current`, `free`, `gc`, and shrink `resize`), and display consumers (`list`, `goto`). Current facts are centralized in `asdl-core`/`asdl-slots.inventory`; free/gc/pool operation recovery wording already shares `asdl-slots.lifecycle.release_target`; checkout branch-in-use recovery wording remains command-local. This closes the code-inspection slice only; representative bisect coverage remains open below.
- [ ] Establish the minimum representative operation-state coverage floor before closure.
      Evidence: require at least a fake-gateway bisect case for the lifecycle commands that already have rebase coverage, or a named verification artifact that identifies equivalent existing bisect coverage. This floor applies whether the narrow recovery-message outcome is implemented or parked.
- [ ] Close the re-baseline and locality decision from a reviewable verification artifact.
      Evidence: current-code inspection narrows the likely outcome but does not by itself close the decision. The artifact must be a dated update, linked review note, or equivalent recorded document that names the commands inspected, the checked-out/rebase/bisect test cases reviewed, the selected outcome, and the rationale. Explicit sign-off must come from the Objective owner or a maintainer reviewing the Objective PR.
- [ ] Implement, document, or park the selected narrow operation-state recovery outcome.
      Evidence: if implementation is selected, keep it to a tiny extension of existing lifecycle recovery-message helpers, deciding whether checkout should share recovery instruction text or keep branch-in-use wording command-specific. Add or verify the bisect coverage floor above as part of the outcome; if implementation is parked, record the parking rationale in the verification artifact.

## Parked

None yet. Parking remains available if the selected narrow operation-state recovery follow-up is later judged lower leverage than the current command-local wording.
