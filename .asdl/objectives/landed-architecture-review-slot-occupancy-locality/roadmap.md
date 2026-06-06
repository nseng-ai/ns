# Roadmap

## Work

- [x] Grill and re-baseline slot occupancy locality against current code and tests.
      Evidence: inspected `asdl-core` Git occupancy facts, `asdl-slots.inventory`, mutating lifecycle paths (`checkout`, `checkout --current`, `free`, `gc`, and shrink `resize`), and display consumers (`list`, `goto`). Current facts are centralized in `asdl-core`/`asdl-slots.inventory`; mutating commands apply those facts consistently, but operation recovery instructions and operation-in-progress messages are repeated in lifecycle modules.
- [x] Decide the locality outcome.
      Evidence: selected a narrow follow-up rather than a broad state-model refactor. Keep Git facts in `asdl-core`; keep slot derivation in `asdl-slots.inventory`; treat dirty-worktree checks as adjacent lifecycle safety evidence; consolidate only drift-prone operation-state recovery/message policy under `asdl-slots.lifecycle` if implementation proceeds.
- [x] Implement, document, or park the selected narrow operation-state recovery outcome.
      Evidence: implemented a tiny `asdl-slots.lifecycle.operation_state` helper for rebase/bisect/unknown recovery instructions and operation-in-progress message fragments. `slot free`, `slot gc`, and shrink `slot resize` now use the helper for operation-state failure/skip messages; checkout keeps branch-in-use wording command-specific while sharing recovery instruction text for rebase and bisect. Representative helper and lifecycle scenario tests cover rebase and bisect recovery behavior without unsafe mutation. Validation: targeted slot lifecycle suite passed; `just lint`, `just format-check`, `just ty`, and `just test` passed.

## Parked

None. The selected narrow operation-state recovery outcome was implemented and the Objective is closed.
