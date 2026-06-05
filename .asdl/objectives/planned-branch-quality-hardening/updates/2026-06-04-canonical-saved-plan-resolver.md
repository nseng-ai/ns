# Canonical Saved-Plan Resolver Implemented

## Summary

The canonical saved-plan resolver slice is implemented. `@asdl/planned-branch` now owns structural extraction, current-checkout local plan-store validation, session candidate selection, and explicit/session/latest saved-plan selection. Pi planned-branch create and CMUX slot dispatch consume that shared path instead of maintaining parallel session evidence parsers.

## Objective Impact

This completes the first roadmap row, "Canonical saved-plan resolver." The implementation preserves valid planned-branch flows while intentionally tightening unsafe session evidence:

- explicit `/planned-branch:create <path>` remains permissive for absolute or home-relative Markdown files outside the plan store;
- current-session saved-plan evidence must belong to the current checkout's local plan-store directory;
- wrong repo metadata, wrong repo identity source, wrong source branch, wrong branch key, invalid slugs, basename/slug mismatches, and outside-plan-store paths are rejected clearly;
- missing session files remain stale evidence so Pi create can fall back to disk latest and CMUX can report no usable session plan.

Evidence considered: local branch diff against Graphite parent `close-planned-branch-ts-cli-objective` and working-tree changes limited to planned-branch package/Pi extension code plus this Objective update.

Verification: `cd ts/packages/planned-branch && bun test`, `cd ts/packages/pi-extensions && bun test`, `just ts-check`, and `just ts-test` passed.

## Follow-Ups

Continue with the remaining roadmap rows, especially the planned-branch-owned operation model for CMUX composition. CMUX still owns some dry-run command synthesis and branch/key composition that the next slice should move behind planned-branch-owned helpers.
