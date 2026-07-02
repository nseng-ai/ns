# Fake-backed large-stack baseline recorded

## Summary

The baseline row's direct-execution portion landed on local branch
`flow-land-large-baseline/fake-scenarios`: a scenario test in
`ts/packages/capabilities/flow/test/unit/land-stack-command-scenarios.test.ts`
drives full linear stack landings through the existing scripted fakes with the
telemetry sink attached and asserts the resulting per-category call counts and
static-model quota deltas, so any later change to call volume diffs against
these exact numbers.

Measured baseline:

- linear-11: 205 total calls — git 97, graphite 54, github-cli 54; static
  quota 65 GraphQL / 65 rate-limit cost.
- linear-25: 457 total calls — git 209, graphite 124, github-cli 124; static
  quota 149 GraphQL / 149 rate-limit cost.
- Per-PR ratios ≈ git 8.3, graphite 5, `gh` 5, GraphQL quota 6. The ~5 `gh`
  calls per PR is consistent with the known overlapping per-PR fact fetches
  (pre-merge `gh pr view` gate, merge-internal finder query, post-merge
  verification view) plus surrounding reads.

Scenario shapes chosen: linear 11-PR (preserves the existing
chunk-threshold scenario) and linear 25-PR. Validation: targeted Vitest and
full `just` (408 files, 3925 tests) reported passing.

## Objective Impact

Call-volume and quota baseline evidence now exists for the Graphite, GitHub/`gh`,
and local git/ref bottleneck classes, making the call-count optimization rows
actionable under the sequencing gate. The wall-time half of the baseline row
remains open and is human-driven only per Runner Policy.

## Follow-Ups

- Human-driven real large-stack landing run for per-phase wall time; its stack
  shape is still an open question.
- Use the per-PR ratios to order optimization rows; the `gh` read-path
  overlap (row 4) already has count evidence supporting batching/dedup work.
