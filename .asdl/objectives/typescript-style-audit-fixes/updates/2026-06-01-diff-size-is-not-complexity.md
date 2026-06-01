# Diff Size Is Not Complexity

## Summary

The Objective now treats simplicity as the number of human-legible decisions, not the number of files or lines changed. A broad mechanical change, such as converting object-shape aliases to interfaces across many files, can still be simple when it implements one clear decision.

## Objective Impact

This de-risks the full-compliance scope by making large diffs acceptable when their thesis is simple and reviewable. The main risk is reframed from diff size itself to mixing unrelated design decisions into one remediation slice.

## Follow-Ups

- Slice implementation work around clear decisions, not arbitrary diff-size limits.
- Keep each large mechanical edit traceable to the style rule it enforces.
