# Roadmap

## Work

- [ ] Candidate 1 — centralize the structured grill contract.
  - Resolve duplicated policy across skill prose, `GRILL_UI_CONTRACT`, tool prompt guidelines, schema descriptions, validation errors, and result text.
  - Preserve user/model behavior while improving locality for future wording or policy changes.
- [ ] Candidate 2 — make the question presentation Seam explicit.
  - Decide whether inline custom UI and legacy `select` / `editor` presentation should sit behind one deeper question-presentation Module.
  - Keep tool execution focused on validation and model-visible result conversion if the deletion test holds.
- [ ] Candidate 3 — deepen the Pi runtime Adapter.
  - Concentrate Pi/TUI runtime loading and translation so grill UI code depends on grill-local behavior rather than Pi constructor and utility details.
  - Cover runtime drift and fake runtime behavior with focused tests.
- [ ] Candidate 4 — decide Terminal presentation reuse.
  - Move only generic terminal escape, width, wrapping, or truncation policy that has real leverage outside grill-specific layout.
  - Keep grill-specific layout in the grill render Module.
- [ ] Candidate 5 — reduce test-only helper exports.
  - Audit helper exports used only by tests and decide which should remain production Interfaces.
  - Retarget tests toward user-visible behavior and meaningful Seams without losing safety coverage.
- [ ] Validate accepted TypeScript changes.
  - Run `bun run --cwd ts check` and `bun run --cwd ts test` after implementation slices.
  - Record broader validation if changes touch docs, skills, or repo-wide behavior beyond the TypeScript package.
- [ ] Close by explicit human decision.
  - Confirm every candidate has a disposition.
  - Add closure context to `objective.md`, then add a Closure Marker only when the Objective is done.

## Parked

- [ ] Broader Project-local Pi extension architecture work; use a separate Objective if new cross-extension candidates appear.
- [ ] Generic questionnaire tooling; this Objective preserves `grill-me` as the motivating workflow.
- [ ] Reopening the closed `pi-extension-deepening` Objective; this stack-specific Objective is the active record for the current grill UI follow-up work.
