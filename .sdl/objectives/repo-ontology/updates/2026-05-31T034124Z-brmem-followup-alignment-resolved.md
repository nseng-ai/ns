# Brmem Follow-Up Alignment Resolved

## Summary

Resolved the package-local follow-up notes that were created by the Phase 2 brmem context session. Evidence: local branch diff against Graphite parent `mark-brmem-context-drafted-in-roadmap`, commit `c026722d`, and PR #734 all show the same focused brmem file set.

The branch aligns brmem implementation, tests, README, and public skill text with `packages/brmem/CONTEXT.md` by:

- adding explicit `brmem copy --base` support for Base Namespace copies while keeping `--namespace <name>` for named Namespaces;
- making whole-namespace copy conflicts Entry-based so an empty destination Snapshot is not a conflict;
- using `Entry Locator` in human-facing output and docs while preserving JSON compatibility fields such as `ref_name`, `source_ref`, and `destination_ref`;
- framing prompt-plugin resolution as skill-facing/internal automation rather than a normal user-facing Branch Memory operation;
- normalizing named Namespace wording to workflow-owned and keeping the Base Namespace reserved by `brmem`;
- deleting `packages/brmem/FOLLOWUP.md` as resolved.

Verification: targeted brmem gateway/scenario/integration suites passed; full `just` passed.

## Objective Impact

- `roadmap.md`: Phase 2 no longer says temporary brmem follow-up notes remain; it now records that Base Namespace copyability, Entry Locator terminology, prompt-plugin framing, Namespace ownership wording, and empty destination Snapshot conflict behavior are aligned and that `packages/brmem/FOLLOWUP.md` is deleted.
- `objective.md`: drift-risk wording now records the brmem follow-up materialization and resolution, preserving the lesson without keeping a stale package-local follow-up file.
- No `/CONTEXT-MAP.md` edit landed in this slice; the next map touch should still mark `packages/brmem/CONTEXT.md` as present and align its summary with the final brmem ontology.

## Follow-Ups

- On the next `/CONTEXT-MAP.md` update, mark the brmem context as *Present* and remove stale wording such as `Entry/Ref locators` or prompt-resolution-as-normal-operation from the brmem summary.
- Continue Phase 3 package contexts once the map is refreshed or as part of the next focused package-context session.
