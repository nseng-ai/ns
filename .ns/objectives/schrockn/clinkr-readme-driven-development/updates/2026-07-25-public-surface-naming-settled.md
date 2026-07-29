# Public-Surface Naming Settled

## Summary

The two remaining public-surface naming choices are settled. Clinkr retains `position` as the positional-metadata field, with zero-based ordinal meaning, rather than adopting the draft-only `index` spelling. Clinkr also retains and documents `md` as an explicit alias for the canonical `markdown` output-format value.

The decisions preserve established, intentional surface area without adding migration work to the clean break. `position` accurately names positional placement, while the `md` alias already has focused parsing, rendering, validation-text, and completion coverage.

## Objective Impact

The README draft now uses `position` and documents the `md` alias. The decision record and contract audit classify both behaviors as accepted contract rather than unresolved steering questions, and the roadmap no longer lists them among the open contract discussions.

No TypeScript implementation or caller changes were needed for this slice. The broader discussion row remains open for the outcome, raw mounting, rendering, and completion-error dispositions.

## Follow-Ups

- Preserve `position` and the documented `md` alias during the coordinated reconciliation.
- Keep focused coverage for both `markdown` and `md` in parsing, rendering, validation text, and completion.
- Continue the remaining contract discussion before beginning TypeScript reconciliation.
