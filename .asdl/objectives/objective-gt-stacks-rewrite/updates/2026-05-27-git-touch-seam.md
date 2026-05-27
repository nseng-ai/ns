# Git Touch Seam De-risked

## Summary

The first implementation slice added TDD coverage for Objective active-root touch semantics at the existing `GitGateway.path_touches_under()` / Objective slug extraction seam.

Evidence: branch `objective-gt-stacks-rewrite/git-touch-seam` added parser and real-gateway tests for additions, modifications, deletions, and renames/moves, plus Objective slug extraction coverage for bare record paths, invalid slugs, and archive-root ignores. The real gateway now uses `git log --name-status -M` and preserves both active-root sides of renames in `PathChangeTouch.paths`.

Verification: targeted pytest passed for the real Git gateway and Objective touch/path tests; targeted ruff and format checks passed for the changed files.

## Objective Impact

The first two roadmap rows are complete. The existing `PathChangeTouch.paths` seam remains sufficient for v1 projection work, so no richer Git path-change interface is needed before starting semantic projection tests.

The previous rename/deletion risk is de-risked for the current contract: projection code can consume active-root paths from the gateway rather than parsing raw git mechanics.

## Follow-Ups

- Start the projection-core slice with fake-driven semantic tests over `FakeGtGateway` and `FakeGitGateway`.
- Keep archive-root filtering at Objective slug extraction/projection boundaries; do not reintroduce archive Objective records into `objective gt stacks`.
