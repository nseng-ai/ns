# Trunk rebaseline: telemetry and optimization slices verified in HEAD

## Summary

A trunk-style objective-refresh verified this record against trunk HEAD ground
truth (the six prior updates were authored mid-runner-session against local
branches with "no PRs yet"; their runner-checkpoint commits are not ancestors
of HEAD, so the work landed to trunk under different SHAs). Every material claim
verified true:

- Telemetry slice present:
  `ts/packages/capabilities/flow/src/land/stack/external-call-telemetry.ts`,
  `external-call-telemetry-run.ts`, and `external-call-telemetry-summary.ts` all
  tracked in HEAD.
- The optimization slices are the current source of truth, not just local
  breadcrumbs: `graphiteRestackFlag` maps `branch-only` → `--only`
  (graphite-command-channel.ts); batched preflight PR facts use `gh repo view`
  plus one `gh api graphql` with one `pullRequests` connection per branch
  (pr-facts.ts); backup snapshotting batches with one `for-each-ref` and one
  local `git fetch` refspec write (land-context-adapter.ts).
- The fake-backed scenario test
  (`land-stack-command-scenarios.test.ts`) asserts the final cumulative
  optimized counts, confirming all four optimization slices landed: linear-11 =
  145 total (graphite 54, github-cli 45, git 46; quota 56 GraphQL / 66
  rate-limit) and linear-25 = 313 total, and asserts every restack uses `--only`
  and not `--upstack`. These match the narrative across the six updates
  (original baseline 205/457 → 145/313).

No claim was corrected or weakened; objective.md, roadmap.md, and orientation.md
already match verified ground truth and were left unchanged.

## Objective Impact

Confirms the record is an accurate trunk rebaseline: rows 1 and the four
first-optimization slices (rows 3–5) are landed in trunk with fake-backed
before/after evidence, and orientation.md's "what you see now" is accurate. The
Objective is not closable — the reconcile row (row 6) is still `[ ]`, the
real large-stack wall-time baseline (human-driven only) is still open, and every
optimization's "measured evidence" remains fake-backed call-counts with real
Graphite/land wall-time unproven. Completion criteria for the three bottleneck
classes are met at the call-count level; the baseline-and-reconcile criteria and
real wall-time evidence keep the Objective open.

## Follow-Ups

- Human-driven real large-stack landing run for per-phase wall time; its stack
  shape remains the open baseline question.
- Row 6: reconcile what improved, what stayed unchanged, and which follow-ups
  (stale backup deletion, post-restack guard reads, optional descendant restack
  scope, merge-loop duplicate PR facts) are deliberately parked.
- Direct GraphQL `mergePullRequest` replacement stays steer-first, not an
  autorun slice.

Provenance: objective-refresh basis target=8fdc6f50661d8df81024bbcce3c722fb7411441d from=trunk-HEAD
