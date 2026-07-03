# Execution vs Review Granularity

## Summary

Refined the Objective's slice-sizing policy to distinguish execution granularity from review granularity.

Autopilot may make small, reversible, locally validated edits or checkpoints while exploring a semantic boundary. PRs should usually aggregate those steps into a coherent review-substantive unit: one package/subsystem/boundary cluster that a reviewer can understand as a single semantic claim.

## Objective Impact

The Objective now says the right PR unit is not the smallest safe edit. For this Objective, PR granularity should prefer coherent package/subsystem clusters with enough material change to justify review, such as an internal fake-helper option cleanup for one package. A smaller PR remains acceptable when the semantic boundary is exhausted or independently review-substantive.

The policy also clarifies the opposite limit: do not batch unrelated optional-undefined edits just to make a PR bigger.

## Follow-Ups

- Future autopilot/planning sessions should describe both the small execution steps they may take and the larger review unit they intend to produce.
- If future runs need very granular commits for safety, aggregate them into a larger PR only when they share the same semantic boundary.
