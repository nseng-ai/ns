# Dogfood gate policy removed

## Summary

The user explicitly removed dogfood evidence and declaration requirements for this Objective and all of its roadmap steps. The replacement rollout frontier is: freshly re-derived, small, git-revertible slices with local validation and materially relevant evidence recorded in Objective tracking before advancing to the next risky slice.

Real `/sdl:flow:land` runs and per-run diagnostics may still be useful human-provided evidence when available, but they are optional and no longer gate slice completion or sequencing. Slices that change external-call volume still need before/after fake-backed scenario counts recorded on the same stack shapes.

## Objective Impact

- Current Objective policy now uses validation/evidence gates rather than dogfood declarations.
- The PR node-ID plumbing slice is complete under the new policy: existing evidence records implementation, targeted flow+ccc Vitest (573 tests), full `just`, and unchanged call counts for the field-only change.
- Older immutable updates that mention an outstanding dogfood declaration are historical context only; they were not edited and no longer describe current policy.
- The next eligible roadmap row is the targeted trunk-fetch slice, with before/after fake-backed call-count evidence and relevant validation expected.

## Follow-Ups

- Derive the targeted trunk-fetch slice from `flow-land-trunk-fetch` as reading material only.
- Record before/after fake-backed scenario counts for linear-11 and linear-25, plus relevant validation, before advancing beyond that row.
