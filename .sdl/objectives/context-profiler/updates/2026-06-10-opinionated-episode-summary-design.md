# Opinionated Per-Episode Summary Design

## Summary

A grill session resolved the design for a new roadmap row: an extensive, opinionated per-episode summary at the top of the episode-detail frame. Decisions: (1) opinionated-descriptive, never advisory — blunt, committed judgment with reasons stays inside the existing design principle; the advisory layer remains a future objective; (2) output shape is `{efficiency, relevance, summary}` with prose allowed to run long; (3) the summary surfaces in the episode-detail frame only — the episode list and overview keep their dense row contract; (4) the prose may cite token figures freely, prompt-steered to `≈`-prefix them per estimation honesty; (5) length is prompt-steered to ~4–8 lines and rendered in full with no renderer truncation (the frame scrolls); (6) the verdict prompt is re-tuned for decisiveness — `mixed`/`still-useful` require genuinely divided evidence rather than serving as safe defaults; (7) delivery is a new branch on the existing unmerged Graphite stack.

## Objective Impact

- New `[ ]` roadmap row "Opinionated per-episode summary" added under Work, carrying the full design contract as row guidance.
- The Design principle in Scope is refined: "never advisory" is clarified as the hard boundary, with opinionated-descriptive judgment explicitly in-bounds. This supersedes the "neutral" framing in the landed per-episode analysis row's wording; that row's evidence is historical.
- The Objective is no longer closure-pending-merge: substantive semantic work is open again, so closure waits on this row plus the master merge.

## Follow-Ups

- A truncated one-line summary in the episode list rows was considered and deferred until real summary quality is observed.
- The current stack (deterministic core → segmentation → analysis → delegation, tip at the options-objects/rename feedback branch) still needs to merge to master for the completion criteria.
