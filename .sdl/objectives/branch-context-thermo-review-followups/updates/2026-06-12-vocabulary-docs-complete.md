# Vocabulary and Docs Slice Complete

## Summary

Completed the `thermo-followups/vocabulary-and-docs` slice. The docs and skills now frame branch context as standing Branch Memory context on a branch, not a special branch type. The branch-context workflow doc regained load-bearing mechanics for Graphite branch creation, `upstack-impl-session` creation/resumption, plan-path normalization, recovery examples, and the `attach`/`list`/`check`/`delete` primitives.

The CONTEXT rebaseline updated the active TypeScript domain-language surfaces from planned-branch to enriched-plan/branch-context vocabulary, including the Local plan store path, Branch Memory namespace/key, skill family names, and lower-capability package name. Skill changes refreshed the affected local-skill hashes in `skills-lock.json` and restored `.agents/skills/*` symlinks to the canonical `skills/*` directories.

## Objective Impact

The first roadmap branch is complete. The documentation blockers called out by the thermo review are no longer active blockers: ADR 0006 vocabulary is reflected in workflow/skill prose, the previously dropped invariants are available to agents, and branch-context diagnostic/admin docs prefer deterministic `branch-context exec list/check` helpers before raw Branch Memory inspection.

Validation evidence: `just dprint-check` passed. Targeted repo greps found no active non-historical planned-branch CLI/namespace/store-path surfaces after excluding ADR/retrospective history, and no old exact "Create a branch context" / "saved branch-context plan" phrases remained in active docs and skills.

## Follow-Ups

Continue with `thermo-followups/package-cleanup`: delete branch-context package plumbing debt, trim the barrel surface, and split the large CLI scenario test while preserving behavior.
