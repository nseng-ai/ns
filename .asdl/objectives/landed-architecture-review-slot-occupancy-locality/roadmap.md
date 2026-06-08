# Roadmap

## Work

- [x] Grill and re-baseline slot occupancy locality against current code and tests.
      Evidence: inspected `asdl-core` Git occupancy facts, `asdl-slots.inventory`, mutating lifecycle paths (`checkout`, `checkout --current`, `free`, `gc`, and shrink `resize`), and display consumers (`list`, `goto`). Current facts are centralized in `asdl-core`/`asdl-slots.inventory`; mutating commands apply those facts consistently, but operation recovery instructions and operation-in-progress messages are repeated in lifecycle modules.
- [x] Decide the locality outcome.
      Evidence: selected a narrow follow-up rather than a broad state-model refactor. Keep Git facts in `asdl-core`; keep slot derivation in `asdl-slots.inventory`; treat dirty-worktree checks as adjacent lifecycle safety evidence; consolidate only drift-prone operation-state recovery/message policy under `asdl-slots.lifecycle` if implementation proceeds.
- [ ] Implement, document, or park the selected narrow operation-state recovery outcome.
      Evidence: if implementation is selected, keep it to a tiny `asdl-slots.lifecycle` helper for rebase/bisect recovery instructions and operation-in-progress messages, deciding whether checkout should share the helper or keep branch-in-use wording command-specific. Add or verify representative tests for checkout branch-in-use rejection, free/resize operation blocking, gc operation skipping, display of operation state, and dirty-worktree checks as separate safety behavior. If no implementation is selected at edit time, park only with a named verification artifact or explicit sign-off showing why command-local wording remains sufficient.

## Parked

None yet. Parking remains available if the selected narrow operation-state recovery follow-up is later judged lower leverage than the current command-local wording.
