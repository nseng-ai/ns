# Consolidated into flow-land-incremental-perf-rollout

## Summary

The user reviewed the unmerged stack ending at `flow-land-perf-baselines` — the prototyped answer to this Objective's steer-first merge/push-primitive question — and judged it too risky to land wholesale: its upper branches replace `gt submit` with lease-based push plus GraphQL base retarget, and replace `gh pr merge` with GraphQL `mergePullRequest` while removing post-merge verification in the same commit.

Rather than continuing here, this Objective is closed by consolidation into the new `flow-land-incremental-perf-rollout`, which re-derives every stack improvement as fresh, small, individually revertible PRs (no cherry-picks, reference reading only), gates each slice on real-use dogfooding with an explicit user declaration before the next risky slice lands, keeps backout purely git-native (revert, no runtime flags), and splits the bundled GraphQL-merge/verification-removal decision into separate slices.

The successor inherits this record's live tail: the reconcile/documentation row, the human-driven real wall-time baseline and its open stack-shape question, and the parked follow-up candidates. A mirrored Objective Edge links the two records.

## Objective Impact

Closes the Objective. Its delivered work — telemetry layer, fake-backed baselines, and four conservative optimizations (linear-11 205→145 total calls, linear-25 457→313) — is landed in trunk and documented in `## Closure`. Active flow-land performance tracking now lives exclusively in `flow-land-incremental-perf-rollout`; this record's `orientation.md` drops from the always-load set on close, superseded by the successor's stricter slice-discipline orientation.

## Follow-Ups

- All follow-ups transfer to `flow-land-incremental-perf-rollout`; see its roadmap.
