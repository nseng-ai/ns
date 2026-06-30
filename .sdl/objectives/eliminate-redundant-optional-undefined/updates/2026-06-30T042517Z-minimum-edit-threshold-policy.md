# Minimum Edit Threshold Policy

## Summary

Refined the coarser PR slice guidance with a concrete default threshold: future optional-undefined cleanup PRs should generally keep inventorying/classifying and include adjacent safe candidates until the proposed PR has at least 10 substantive edit sites / touched lines attributable to the optional-undefined cleanup.

This threshold is not a file-count rule. File count is only incidental; the preferred measure is whether the PR contains enough substantive local changes to be worth review while still staying inside one coherent semantic package/subsystem boundary.

## Objective Impact

This changes future PR sizing expectations. Runners should not stop at a tiny cleanup merely because one file or helper was easy to fix. If the safe slice is below the 10-edit default, the runner should continue looking for adjacent candidates in the same semantic cluster before treating the slice as PR-ready.

The semantic safety rules remain unchanged: do not broaden into public/input/options/dependency/environment/signal/external-schema/null-sensitive surfaces just to hit the threshold. A smaller PR is acceptable only when the semantic boundary is genuinely exhausted, the diff is independently review-substantive, or nearby candidates have been explicitly classified as unsafe or unrelated.

## Follow-Ups

- Future recommendations should report the intended cluster and whether it appears to meet the 10 substantive edit-site / touched-line default.
- If a candidate cluster is below threshold, keep classifying nearby same-boundary candidates before proposing a PR.
- Do not use the threshold to justify broad mechanical syntax sweeps or unsafe compatibility-surface narrowing.
