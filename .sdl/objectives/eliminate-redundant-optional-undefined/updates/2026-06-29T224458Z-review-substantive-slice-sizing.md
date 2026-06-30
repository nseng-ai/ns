# Review-Substantive Slice Sizing

## Summary

Updated the Objective's Runner Policy and roadmap to avoid overly tiny optional-undefined cleanup slices.

Future autonomous `objective-next` runs should still avoid broad repo-wide syntactic sweeps, but should target one coherent package/subsystem cluster large enough to justify a PR or commit. The Objective now names example slice sizes: all safe internal `worktree-status` omission-only option/result fields, a cohesive `pr-previews` internal command/model cleanup, a `pr-feedback-watch` internal model/rendering cleanup, or a GitHub PR feedback parser/fingerprint internal-shape cleanup.

## Objective Impact

This changes future runner behavior: the default should no longer be the single smallest possible field-level edit. Runners should classify nearby candidates, preserve/defer ambiguous public or external surfaces, and then execute a review-substantive semantic cluster when safe.

The prior `WorktreeStatusRefreshOptions.remoteRefresh` cleanup remains valid evidence, but it is now treated as below the preferred standalone slice size for future work.

## Follow-Ups

- Future recommendations should include a package/subsystem cluster boundary and should avoid proposing a one-field standalone PR unless no larger safe coherent cluster exists.
- Continue to stop before broad mechanical rewrites, unrelated syntax batching, public compatibility risk, external schemas, or validation fallout across unrelated packages.
