# Ground Truth Rebaseline After Objective Draft Review

## Summary

A post-submission relevance check compared this Objective against current `ts/packages/pr-address` ground truth. The downloader-only surface still has two substantive defects (`gh api -F` string variables and `numericId` silently dropping unparseable IDs) plus remaining re-export cleanup, but the historical `read-feedback-detail --payload-path` containment finding is no longer active: current source has no `read-feedback-detail`, payload-store/session machinery, or raw `.raw.json` path reader.

Provenance: objective-branch-refresh basis tip=a5091cd35c3541e935149cf34c7ead980e6bcf7b from=a5091cd35c3541e935149cf34c7ead980e6bcf7b

## Objective Impact

The Objective scope and roadmap were narrowed from four findings to three active findings. The `read-feedback-detail` item moved to parked/retired-with-deleted-surface, and the re-export row was narrowed because `stdoutModeRequestShape` is already gone in current ground truth.

## Follow-Ups

- Implementers should not spend time resurrecting or fixing deleted `read-feedback-detail`/payload-store paths.
- Revalidate the remaining `gh -F` and `numericId` findings immediately before implementation if more strangler work lands first.
