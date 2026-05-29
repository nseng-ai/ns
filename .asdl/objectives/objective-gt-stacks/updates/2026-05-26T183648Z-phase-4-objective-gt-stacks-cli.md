# Phase 4 Objective GT Stacks CLI Implemented

## Summary

Implemented the user-facing `objective gt stacks` CLI surface for Objective stack projection. The `objective` command now has an explicit `gt` subgroup, with `objective gt stacks` wrapping the Phase 3 pure projection model instead of reimplementing stack semantics.

The command now provides:

- human output grouped by Objective, using `◆` for Objective-touching rows and `◇` for connector rows;
- Markdown output with Objective summaries and fenced segment text;
- a stable JSON result contract with `trunk_branch`, `warnings`, and `objectives[]`; Objective rows expose status, objective branch count, segment count, latest work, segment rows, parent/depth facts, `touches_objective`, `connector`, `also_touches`, and Graphite `validation_result` when available.

Graphite access is isolated under `asdl_objectives.gt.*`. Generic Objective list/archive paths still load the checkout-local Objective context, while the Graphite command attaches an opt-in `GtGateway` only for the explicit `objective gt` surface. The CLI filters Graphite metadata to local git branches before projection and reports skipped stale metadata branches as warnings.

Verification: targeted Phase 3/Phase 4 Objective tests passed; a real `objective gt stacks --format json` smoke run succeeded; full `just` passed.

## Objective Impact

Phase 4 is complete. The Objective now has the Python CLI command required by later consumers, including the Pi `/objective-gt-stacks` wrapper and public Objective skill/docs language.

The Phase 4 JSON schema question is resolved for v1: the contract is semantic and renderer-independent, preserving Objective grouping, segment membership, branch parent/depth facts, Objective-touch/connectors, multi-Objective markers, latest work, and warnings without freezing human glyph layout.

Scenario coverage now exercises many-to-many Objective/branch relationships, disconnected Objective segments, connector rows, archive-root omission, active-root touch inclusion, non-local Graphite metadata branch skipping, Graphite trunk status projection, Markdown rendering, command help, unavailable repository failure, and Graphite branch-graph failure reporting.

## Follow-Ups

- Add the repo-local Pi `/objective-gt-stacks` wrapper around `objective gt stacks --format markdown`.
- Update public Objective skill/docs language now that the Graphite stack projection command exists.
- Keep richer slot labels, lifecycle interpretation, and interactive TUI exploration parked for follow-up work.
