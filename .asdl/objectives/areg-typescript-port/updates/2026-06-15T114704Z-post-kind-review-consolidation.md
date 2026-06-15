# Post-kind review consolidation work identified

## Summary

Post-implementation review artifacts for the TypeScript `areg` skill invocation kinds slice identified consolidation work that should happen before distribution and cutover.

The review evidence does not undo the completed `areg skill apply|list|show` surface or its validation evidence. It does identify avoidable drift risk in the implementation shape:

- duplicated skill-artifact inspection gateways and repeated on-disk skill layout knowledge;
- duplicated invocation-convention rules between `areg check` diagnostics and the skill kind classifier/status notes;
- duplicated Pi settings parsing and symlink/canonical-source validation messages;
- separate frontmatter read/write boundary handling;
- repeated apply-plan and installed-skill layout seams that would become harder to change safely after TS `areg` is the default implementation.

Evidence comes from the local branch diff against Graphite parent `master`, which adds review artifacts under `temp-reviews/`.

## Objective Impact

A new roadmap row now tracks resolving post-kind review consolidation before the distribution/install and cutover rows. This keeps the completed kind-system product surface intact while making the review-identified architecture debt part of the pre-cutover plan instead of an implicit cleanup.

The Objective risk section now records that duplicated safety policy around skill artifacts, kind classification, Pi settings, frontmatter, and apply planning should be addressed before TypeScript `areg` becomes the default.

## Follow-Ups

- Implement the consolidation row before deciding that `areg` is ready for distribution/cutover.
- Preserve the accepted flattened `areg skill apply|list|show` contract unless a future focused decision intentionally changes the product surface.
- Use the consolidation outcome as input when feeding reusable `areg` lessons back into the parent TypeScript migration Objective.
