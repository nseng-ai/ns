# Post-review-cleanup Subobjective now carries a `[~]` roadmap row

## Summary

Objective-refresh verification found a tracking-discipline gap: the
`harness-artifacts-post-review-cleanup` Subobjective was registered in this
umbrella's frontmatter edge (added by commit `36e68c1b7` "Add harness-artifacts
post-review cleanup subobjective") but had no `[~]` row in `## Work` and no
prose here — the umbrella's own named failure mode (fire-and-forget: edge without
a live child row). This refresh adds the missing `[~]` tracking row so the
umbrella's edge/row/synthesis discipline holds for every open child.

Verified against HEAD (`9fa6a502d`) ground truth plus worktree state:

- Six frontmatter edges, all real records. Closed children (each has
  `closed.md`): `ns-skills-steelthread`, `npm-bundled-artifact-provisioning`,
  `harness-artifacts-thermo-remediation`, `harness-artifact-vocabulary-reconciliation`.
  Open children: `remote-artifact-module-acquisition` (already had a `[~]` row)
  and `harness-artifacts-post-review-cleanup` (was untracked — fixed here).
- The `harness-artifacts-post-review-cleanup` child's own edge mirrors back to
  this umbrella; it is a bounded execution child (not orienting), scoping
  home-dir/harness-path ownership, provision/reconcile design seams,
  schema/source-of-truth duplication, and PR review-thread disposition.
- `@nseng-ai/harness-artifacts` exists at `ts/packages/capabilities/harness-artifacts`;
  the Pup research reference remains at
  `references/pup-skill-management-report.md`. No other umbrella prose was stale.

## Objective Impact

- `## Work` now tracks both open Subobjectives with `[~]` rows; the umbrella
  cannot close until both close or are explicitly parked with synthesis, which
  matches the Completion Criteria. No edges, closed-child rows, or disposition
  prose were changed. The umbrella stays open.

## Follow-Ups

- Keep the two `[~]` child rows current and synthesize each child's closure
  evidence here when it closes (fire-and-forget defense).

Provenance: objective-refresh basis target=9fa6a502d from=trunk-HEAD
