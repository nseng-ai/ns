# Roadmap

## Work

- [x] Inspect slot occupancy locality against current code and existing test evidence.
      Evidence: inspected `asdl-core` Git occupancy facts, `asdl-slots.inventory`, mutating lifecycle paths (`checkout`, `checkout --current`, `free`, `gc`, and shrink `resize`), and display consumers (`list`, `goto`). Current facts are centralized in `asdl-core`/`asdl-slots.inventory`; the implementation below centralizes drift-prone recovery wording in `asdl-slots.lifecycle.operation_state`; checkout branch-in-use wording remains command-specific while sharing recovery instruction text. Existing and added coverage supports checked-out, rebase, and bisect lifecycle paths.
- [x] Establish the minimum representative operation-state coverage floor before closure.
      Evidence: representative helper and lifecycle scenario tests cover rebase and bisect recovery behavior without unsafe mutation, satisfying the required bisect coverage floor for lifecycle commands that already had rebase coverage.
- [x] Close the re-baseline and locality decision from a reviewable verification artifact.
      Evidence: the implementation update `updates/2026-06-06-operation-recovery-helper-implemented.md`, local branch diff against Graphite parent `landed-architecture-review-slot-occupancy-locality`, targeted slot lifecycle tests, and full validation close the decision. Keep Git facts in `asdl-core`; keep slot derivation in `asdl-slots.inventory`; treat dirty-worktree checks as adjacent lifecycle safety evidence; keep operation recovery messaging under `asdl-slots.lifecycle`.
- [x] Implement, document, or park the selected narrow operation-state recovery outcome.
      Evidence: implemented a tiny `asdl-slots.lifecycle.operation_state` helper for rebase/bisect/unknown recovery instructions and operation-in-progress message fragments. `slot free`, `slot gc`, and shrink `slot resize` now use the helper for operation-state failure/skip messages; checkout keeps branch-in-use wording command-specific while sharing recovery instruction text for rebase and bisect. Representative helper and lifecycle scenario tests cover rebase and bisect recovery behavior without unsafe mutation. Validation: targeted slot lifecycle suite passed; `just lint`, `just format-check`, `just ty`, and `just test` passed.

## Parked

None. The selected narrow operation-state recovery outcome was implemented and the Objective is closed.
