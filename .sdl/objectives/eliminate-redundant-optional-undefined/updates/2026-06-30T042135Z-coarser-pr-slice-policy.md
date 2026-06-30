# Coarser PR Slice Policy

## Summary

Adjusted the Objective's runner guidance so future optional-undefined cleanup PRs should be less narrow than many of the recent single-file follow-up slices.

The updated policy still rejects broad repo-wide syntactic sweeps, but now explicitly prefers package/subsystem-level semantic clusters over one-file trickles when adjacent candidates share the same boundary and can be safely classified. A one-file slice remains acceptable only when that file is itself the whole coherent boundary, the change is independently review-substantive, or nearby candidates have been explicitly classified as unsafe or unrelated.

## Objective Impact

This changes future runner behavior and PR shaping, not the semantic rule for what may be narrowed. Runners should continue to classify candidates before editing, preserve compatibility/input/dependency/external/null-sensitive surfaces, normalize producers before narrowing internal types, and validate touched packages. The difference is that a standalone PR should usually include a coarser coherent cluster rather than one small file or one tiny helper cleanup.

The roadmap row for review-substantive slices now says to prefer package/subsystem-level clusters and to avoid one-file cleanups unless the file is the coherent boundary or broader nearby candidates are unsafe/unrelated.

## Follow-Ups

- Future `objective-next` recommendations should name the intended package/subsystem cluster and explain why its scope is coarse enough for a PR.
- If only a tiny safe cleanup is found, prefer recording the classification and continuing inventory for an adjacent cluster instead of opening a standalone PR.
- Continue avoiding broad mechanical count-reduction sweeps; coarser PRs must still be semantic, classified, and reviewable.
