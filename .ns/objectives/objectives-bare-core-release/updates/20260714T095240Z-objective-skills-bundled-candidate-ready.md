# Objective Skills Bundled; Candidate Ready

## Summary

Resolved the `0.1.3` standalone Objectives artifact blocker without duplicating checked-in skill sources. Root `skills/objective*` directories remain canonical. Both public-package preparation paths now copy the exact ten-directory Objective skill family into generated `dist/publish/skills/`, fail if the canonical set drifts, and assert every generated skill retains a `SKILL.md` with matching canonical frontmatter.

The Objectives extension descriptor declares the same ten skills as `bundledArtifacts`, using package-relative `skills/<name>` paths. Its exact-contract test covers the complete declaration. Packed `@nseng-ai/objectives@0.1.3` output contains all skill bodies, references, README content, and harness overlay files; generated package metadata includes both `src` and `skills`.

## Objective Impact

The release-candidate preparation row is complete. The coordinated 20-package `0.1.3` set now satisfies the local release evidence bar: full package checks/tests and npm dry-runs pass, the core remains bare and checkout-free, standalone Objectives carries activation plus provisionable skills, and generated dependency specifications are concrete.

The previously recorded missing-artifact blocker is resolved by this later evidence. Publication is the next row and remains an explicit external-write boundary: the exact coordinated `0.1.3` set must be committed to a clean worktree and separately authorized before `just publish 0.1.3` runs.

## Follow-Ups

- Commit the release candidate through the repository's normal Graphite workflow so publication can run from a clean tree.
- Obtain explicit authorization for the exact 20-package `0.1.3` publish set immediately before the external write.
- After publication, verify registry metadata and tarballs, then run the isolated foreign-repository bare-core acquisition smoke.
