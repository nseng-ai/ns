# Roadmap

## Work

- [x] Inspect slot occupancy locality against current code and existing test evidence.
      Evidence: inspected `asdl-core` Git occupancy facts, `asdl-slots.inventory`, mutating lifecycle paths (`checkout`, `checkout --current`, `free`, `gc`, and shrink `resize`), and display consumers (`list`, `goto`). Current facts are centralized in `asdl-core`/`asdl-slots.inventory`; free/gc/pool operation recovery wording already shares `asdl-slots.lifecycle.release_target`; checkout branch-in-use recovery wording remains command-local. Existing coverage supports checked-out/rebase lifecycle paths; bisect remains an explicit coverage question for the narrow follow-up.
- [ ] Close the re-baseline and locality decision from a reviewable verification artifact.
      Evidence: current-code inspection narrows the likely outcome but does not by itself close the decision. Keep Git facts in `asdl-core`; keep slot derivation in `asdl-slots.inventory`; treat dirty-worktree checks as adjacent lifecycle safety evidence; decide from a named artifact or explicit sign-off whether checkout branch-in-use messaging should share existing recovery instruction text.
- [ ] Implement, document, or park the selected narrow operation-state recovery outcome.
      Evidence: if implementation is selected, keep it to a tiny extension of existing lifecycle recovery-message helpers, deciding whether checkout should share recovery instruction text or keep branch-in-use wording command-specific. Add or verify targeted bisect cases if the helper implementation exposes a gap; otherwise keep bisect coverage as an explicit accepted risk. If no implementation is selected at edit time, park only with a named verification artifact or explicit sign-off showing why command-local wording remains sufficient.

## Parked

None yet. Parking remains available if the selected narrow operation-state recovery follow-up is later judged lower leverage than the current command-local wording.
