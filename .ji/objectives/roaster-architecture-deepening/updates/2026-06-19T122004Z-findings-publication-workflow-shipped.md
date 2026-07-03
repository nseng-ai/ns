# Findings Publication Workflow Shipped

## Summary

Candidate 1 now has branch-local shipped evidence. The `roaster-findings-publication-workflow` branch collapses the old CI publication pipeline into one in-process `publishFindings` operation and one `roaster exec publish-findings` adapter. The GitHub Actions workflow streams the review-run envelope directly into that command, removing the previous temp-file handoff, repeated envelope parsing, and `post-inline-findings` / `format-findings-comment` / `post-findings-comment` command chain.

Evidence considered: Graphite parent `master`; branch commits `bf10fb137` and `089997998`; local branch diff against `master`; PR #1823 file/commit evidence; `gh pr checks 1823` showing the TypeScript check passing; PR #1823 roaster comments showing summary comments, inline posting status, and activity-log entries rendered on a real PR.

## Objective Impact

The roadmap marks candidate 1 complete. The Objective narrative now treats findings publication as shipped depth rather than the top pending recommendation. The command-shape open question is resolved: the branch removes the old hidden exec commands instead of retaining compatibility wrappers, accepted because roaster/asdl are unreleased/private and the known CI caller moved in the same change.

The CI regression risk is de-risked by scenario coverage plus real-PR roaster comment evidence, while observability is mitigated by concise `publish-findings` diagnostics and retained workflow logging of the original roaster envelope.

## Follow-Ups

- Next substantive Objective slice: candidate 2, unifying duplicated DTO definitions from the Zod schemas and hand-written TypeScript interfaces.
- Continue watching PR #1823 review/CI feedback until landing, especially any finding about the new publication workflow's error/result shape or hidden exec compatibility break.
