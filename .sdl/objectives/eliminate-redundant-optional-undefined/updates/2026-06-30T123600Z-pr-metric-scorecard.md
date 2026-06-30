# PR Metric Scorecard

## Summary

The Objective now treats two scoped before/after metrics as its visible progress scorecard for each submitted cleanup PR:

1. typed optional-undefined property count, such as `foo?: T | undefined`; and
2. undefined-normalization/check code count, such as omission-building spreads or `if (value !== undefined)` construction guards.

The first metric should generally trend down as semantically redundant property declarations are removed. The second metric may fluctuate because boundary normalization can temporarily add explicit undefined checks before upstream request/result objects become omission-only.

## Objective Impact

Future Objective PRs should encode both before/after counts and their measurement scope in the PR description. These metrics are now called out in `objective.md` as the Objective's measurement function and in `roadmap.md` as required evidence for the continuous cleanup row.

The metrics do not replace semantic classification. Public/input/options/dependency/environment/external-schema surfaces still require deliberate preserve/defer decisions, and check-count movement must be interpreted by boundary location rather than treated as a monotonic target.

## Follow-Ups

- Update future PR descriptions for this Objective to include both scoped before/after metrics.
- When a slice adds normalization checks before narrowing upstream objects, explain why the check-count increase is expected progress rather than regression.
