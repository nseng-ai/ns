# Handoff list buffered report pilot

## Summary

- Rechecked the current P1 buffered list/detail/report batch after the destructive migration boundary; no newly ported command faces were added to the active eligible set in this slice, so the batch remains Objective/Flow/Slot/Handoff surfaces already listed in `cli-surface-audit.md`.
- Migrated `sdl handoff list` human output from `@sdl/core/text-table` to the existing `@sdl/cli-theme` `renderTable` primitive.
- Preserved the command's JSON and Markdown contracts; Markdown remains a pipe-table payload renderer and human output remains title + empty state/table text.

## Objective Impact

- Establishes the first P1 buffered list/report pilot after P0 navigation and destructive rows completed.
- The existing theme table primitive was sufficient for this pilot's title/table shape; no new generalized buffered report abstraction was needed yet.
- The pilot clarifies the next reusable shape to watch across remaining P1 surfaces: title, optional empty state, `renderTable` rows, optional footer/legend, and explicit Markdown passthrough boundaries.

## Follow-Ups

- Migrate the remaining P1 buffered surfaces mechanically by family, starting with similar table/list outputs before status/action summaries.
- Re-evaluate whether `renderTable` needs a small report wrapper only after a second or third P1 surface reveals repeated title/empty/footer plumbing beyond command-local code.
- Keep extension-gated standalone/unported surfaces parked until a later eligibility pass marks them as extension or Capability command faces.
