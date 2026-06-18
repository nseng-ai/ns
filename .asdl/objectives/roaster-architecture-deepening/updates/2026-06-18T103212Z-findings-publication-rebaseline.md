# Findings Publication Ground Truth Rebaseline

## Summary

A post-submission relevance check compared this Objective against current `ts/packages/roaster` ground truth. Candidate 1 was overstated: roaster already has `src/findings-publication.ts` helpers, unit coverage, and scenario coverage for the individual `post-inline-findings`, `format-findings-comment`, and `post-findings-comment` exec commands. The remaining problem is the end-to-end CI publication path, which is still spread across three commands, a temp file, and repeated envelope parsing in `.github/workflows/roaster.yml`.

Provenance: objective-branch-refresh basis tip=a5091cd35c3541e935149cf34c7ead980e6bcf7b from=a5091cd35c3541e935149cf34c7ead980e6bcf7b

## Objective Impact

Candidate 1 remains relevant but was reframed from "introduce a module where none exists" to "collapse the existing helpers and exec steps into one tested end-to-end publication workflow." Candidates 2, 3, and 4 still match current ground truth: duplicate DTO definitions remain, environment/context threading remains, and `RoasterFailure` still carries structured fields that are mostly collapsed to messages at command seams.

## Follow-Ups

- Before deleting any of the three current exec commands, confirm whether callers outside the GitHub Actions workflow depend on separate steps; otherwise keep compatibility wrappers over the new workflow.
- Candidate 1 implementation should build on the existing `findings-publication.ts` and exec tests rather than replacing them wholesale.
