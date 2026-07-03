# Selected Detail Summary Artifacts

## Summary

The current branch adds artifact-backed batch selected-detail lookup for pr-address. `pr-address exec read-feedback-details` accepts a raw feedback payload path plus a non-empty batch of allowed JSON Pointers through stdin or `--selection-json`, validates the complete selection before writing, stores the selected values in a same-session `.summary.json` payload artifact, and returns only compact metadata on stdout: source pointers, detail kinds, artifact pointers, value kinds, and character counts.

The existing `read-feedback-detail` one-off helper remains available for explicit inline lookup/debugging. The CLI reference and public `pr-address` skill now route multi-body classification or execution lookups through the artifact-backed batch helper instead of repeated inline body dumps.

Verification: targeted pr-address scenario coverage passed for read-detail, classification-template, and classification-validation flows; targeted Ruff checks and formatting passed; Markdown dprint checks passed.

## Objective Impact

This completes the selected-detail payload ergonomics roadmap slice. Agents can now inspect exactly the selected feedback bodies/items needed for classification or execution through managed payload artifacts while keeping selected body text out of the main command output by default.

The change also advances the public-docs happy path and de-risks the managed-artifact boundary for selected-detail retrieval: selected details are curated `summary` artifacts in the source payload session, not raw feedback envelopes or ad-hoc scratch files. It does not close the broader Objective because deterministic planning, mutation skeletons/checkpoints, finalization, and representative lower-orchestration proof remain open.

## Follow-Ups

- Add deterministic planning support from validated classifications so agents do not hand-group actionable batches.
- Continue reducing mutation payload assembly through skeletons, checkpoints, or higher-level helpers.
- Preserve the one-off inline helper as an explicit debugging escape hatch while keeping artifact-backed lookup as the normal multi-detail path.
