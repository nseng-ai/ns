# Package Extraction Refactors

Use this checklist when moving code from one package or subpath into a new package while preserving behavior.

## 1. Set the boundary before moving files

Define the new package's responsibility in one sentence, then list what must stay with the old owner. Decide dependency direction up front.

Good extraction boundaries are asymmetric:

- the extracted package may depend on stable public substrate from the old owner, if needed;
- the old owner must not depend back on the extracted package unless the cycle is deliberate and documented;
- tests should follow the same dependency direction when a test dependency would create a package cycle.

If the extraction reveals unrelated redesign or consolidation opportunities, park them as follow-ups. Do not fold them into the mechanical move unless the extraction cannot compile without the decision.

## 2. Move code onto public imports

After moving files, replace relative/private imports that crossed a package boundary with exported package surfaces.

Checklist:

- no imports from another package's `src/` tree;
- no imports from the old package's private files;
- no root barrels added only for convenience if explicit subpath exports are clearer;
- extracted package imports only layers at or below its intended boundary;
- moved tests use public imports or local fixtures, not private old-owner paths.

If a needed helper is private, choose deliberately: export a narrow public helper, move the helper to a lower neutral package, or copy only when the behavior is truly package-local.

## 3. Separate mechanical rewires from semantic edits

Batch or script same-shape edits such as import specifier rewrites. Hand-edit files that encode ownership or behavior:

- package manifests and lockfiles;
- package export maps;
- boundary/isolation tests;
- tests in the old owner that would otherwise depend on the extracted package;
- docs that describe current architecture.

Review every changed file after a batch rewrite. Avoid blind replacements in historical/provenance docs.

## 4. Preserve old-owner independence

The old owner should compile and test without importing the extracted package unless the architecture explicitly says otherwise.

Common test adaptation pattern:

- replace extracted-package test fixtures with local literal fixtures;
- keep old-owner tests focused on old-owner behavior;
- test the extracted rendering/formatting/domain behavior in the new package's own suite.

This prevents a subtle cycle where production dependencies look clean but test/dev dependencies re-couple the packages.

## 5. Add boundary tests

Extraction is not complete until the boundary is executable.

Recommended assertions:

- old owner no longer exports the extracted API/subpath;
- old owner production source does not import the extracted package;
- extracted package does not import old-owner private subpaths;
- extracted package does not import forbidden higher-level/domain packages;
- extracted package does not use responsibilities outside its boundary, such as process access, IO, command exit policy, persistence, or domain policy when those belong elsewhere.

Keep boundary tests narrow and greppable. Prefer direct import-literal scans over broad architectural frameworks unless the repo already has one.

## 6. Update dependency metadata

After adding the new package or new package edges:

- add the package manifest and export map;
- add dependencies to every consumer package that imports the extracted package;
- remove stale dependencies from the old owner when no source/test imports need them;
- refresh the workspace lockfile with the repo's package-manager workflow;
- run dependency/sync checks.

## 7. Update current docs, not history

Update current guidance that would otherwise tell future contributors to add code to the old package. Preserve immutable historical notes, changelogs, and semantic updates unless the task explicitly asks for a corrective update.

A useful documentation split:

- current architecture docs: update to the new package name and boundary;
- package README/context docs: add only if the package boundary is stable enough;
- historical updates/provenance: leave as written, or add a new corrective update instead of editing old history.

## 8. Validate in layers

Run validation from narrow to broad:

1. focused tests for the extracted package;
2. focused tests for old-owner boundary/isolation behavior;
3. focused tests for affected consumers;
4. package dependency checks;
5. format/lint/typecheck;
6. full test suite or the repo's default validation gate when practical.

If formatters fail, use the repo's autofix command and rerun checks. Record any pre-existing warnings separately from extraction regressions.

## 9. Acceptance scans

Before finishing, run scans that prove the new boundary:

```bash
rg "<old-package-or-subpath>" <live-source-roots>
rg "<new-package>" <old-owner-production-source>
rg '"<old-export-subpath>"' <old-owner-package-json>
rg "from \"<old-owner>/src/" <new-package-source>
```

Interpret scans with context. Live imports should be gone; historical docs may still mention old paths as provenance.

## 10. Finish with explicit follow-ups

Report what moved, what remained, and what was intentionally deferred. Good follow-ups name decisions, not chores:

- whether duplicate helpers should consolidate now that the package exists;
- whether a lower neutral primitive should replace a dependency on the old owner;
- whether package context/domain docs need a focused rebaseline;
- whether downstream consumers should adopt more of the extracted package's API.
