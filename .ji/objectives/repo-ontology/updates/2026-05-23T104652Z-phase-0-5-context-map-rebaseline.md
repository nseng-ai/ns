# Phase 0.5 — `/CONTEXT-MAP.md` rebaseline landed

## Summary

Updated `/CONTEXT-MAP.md` to match the current repository ground truth before continuing the ontology sweep:

- Added a repo-level context section linking the existing root `CONTEXT.md` for Objective-system vocabulary.
- Replaced the stale 6-package inventory with 7 in-scope package contexts, adding `packagechk` as a planned standalone package context.
- Kept `asdl-dispatcher` as the only tracked out-of-scope workspace package while its Clinkr group has no operations.
- Reframed `asdl-initiatives` as an absent/historical package name, not a tracked package skip or reserved context slot.
- Reworked Relationships as evidence-based ground truth plus candidates: removed the stale `asdl-objectives → brmem` storage edge, recorded `packagechk` as standalone/no-`asdl-core`, and kept future package-session edges subject to confirmation.
- Expanded Flagged ambiguities so the State/status candidate includes `packagechk.CheckStatus` / `PackageCheckReport.exit_code` alongside PR state and rendered state badges.

No production code changed.

## Objective Impact

- `roadmap.md`: Phase 0.5 tasks marked `[x]` with completion evidence.
- `objective.md`: unchanged; the prior ground-truth rebaseline already updated durable scope, completion criteria, assumptions, and risks. This change lands the map edits required by that rebaseline.
- Phase 1 is unblocked: the next planned work can return to grilling and appending `## Git` in `packages/asdl-core/CONTEXT.md`.

## Follow-Ups

- Next roadmap item: Phase 1 first task — grill and append `## Git` to `packages/asdl-core/CONTEXT.md`.
- During package sessions, confirm and sharpen the candidate Relationships against source/runtime evidence before Phase 4 finalization.
- During the future `packagechk` grilling session, decide whether `CheckStatus` remains a true map-level State/status ambiguity or should be documented only package-locally.
