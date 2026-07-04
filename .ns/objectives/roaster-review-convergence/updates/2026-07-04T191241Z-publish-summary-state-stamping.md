# Publish Summary State Stamping

## Summary

The publish path now adds an additive `roaster-state:v1` machine-readable block to the Findings summary comment while preserving the existing first-line `<!-- roaster:<key> -->` marker and rendered body parseability.

The stamped state includes Last-reviewed head data when supplied (reviewed PR head SHA, base ref, and base merge-base SHA) and a cumulative capped Prior-findings union that survives summary body overwrite. The v1 prior-findings policy keeps the 50 newest exact-finding records and records a cumulative pruned count.

## Objective Impact

The publish-stamping roadmap row is complete in the landed-state model. The implementation covers the core comment renderer/parser, publication update behavior, CLI publish inputs for the reviewed head/base merge-base data, and tests for marker compatibility, state parsing, cap pruning, and carrying prior findings forward when a later publish has no current findings.

The Objective remains open. CI still needs to supply PR head and base merge-base values, and review-time gathering still needs to read the stamped block plus thread resolution status.

## Follow-Ups

- Build the read-side Prior-findings gathering slice against the stamped block and `pr-feedback` thread resolution status.
- Wire CI to pass the reviewed PR head SHA and base merge-base SHA into publish using only existing workflow permissions/env.
- Keep the local default-fetch question reserved; the default `ns roaster review run` path remains PR-context-free.
