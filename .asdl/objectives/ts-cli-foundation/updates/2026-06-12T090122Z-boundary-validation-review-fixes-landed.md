# Boundary validation review fixes landed

## Summary

PR #1314 now carries the review-corrected boundary-validation shape for the TS CLI foundation packages.

`@asdl/plans` and `@asdl/planned-branch` still use private Zod schemas at their real untyped object boundaries: saved-plan session tool-result evidence and planned-branch output evidence. The follow-up review fixes removed decorative `.strip()` calls, kept unknown-key stripping pinned by tests via Zod's default object behavior, collapsed optional `summary` projections into the local rest/spread idiom, and moved saved-plan `isError === true` rejection into the schema while preserving the deliberate rule that only literal `true` rejects.

`asdl-dev` checkpoint-message validation no longer uses a Zod custom-issue projection layer. Review established that there is no untyped object boundary there: input is already a string, and every `CheckpointMessageIssue` is created by typed project code. The validator now normalizes text, directly collects typed issues, returns repair feedback on failure, and builds the public `CheckpointMessage` on success.

Evidence: Graphite parent `master`; PR #1314 contains commits `473bbe78e` and `eaec10dff`. Targeted checks/tests passed for `@asdl/plans`, `@asdl/planned-branch`, and `asdl-dev`; full TS workspace check/test and the full `just` gate passed.

## Objective Impact

The completed boundary-validation row remains complete, but its durable meaning is corrected: this Objective now distinguishes real external object boundaries that should use Zod from typed internal validation paths that should not be laundered through Zod for consistency's sake.

The older `2026-06-12T083037Z-zod-boundary-validation-adopted.md` update remains immutable historical provenance for the first implementation. This update supersedes its checkpoint-message wording with the review-corrected final state.

## Follow-Ups

- Continue the remaining provider-owned rows: declare the `asdl-dev` public surface/end deep imports, then consolidate reusable non-pr-address scenario-test scaffolding.
- Keep future Zod adoption scoped to actual untyped boundaries; typed domain diagnostics should stay project-owned unless a concrete external boundary appears.
