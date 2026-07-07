# Autonomy Decisions Recorded

## Summary

The remediation Objective's steer-first questions were resolved so future `objective-next` / Objective Runner sessions can execute the known remediation rows autonomously within the existing local-only boundaries. Decisions recorded:

- H1 will expose the kernel-computed `homeDir` on `NsExtensionApi` and use that single value to eliminate the three `?? ""` sentinels.
- H2 may delete `shouldForce` and the `locally_edited_conflict` apply-layer error variant, replacing them with first-class conflict outcomes and atomic in-repo consumer/test updates.
- Reconcile collision remediation should provision non-colliding artifacts, report skipped colliding artifacts, and return a nonzero `ns update` result.
- Repo-local descriptor honesty will use plain preinstalled catalog entries for skills commands and delete `repo-local-ns-extension.ts`; this Objective should not check in `.ns/extensions/skills/` artifacts for that row.
- AREG remediation may atomically rename machine-facing error/status codes when the rename is directly tied to the selected row and all in-repo consumers/tests are updated in the same slice.
- Completed autonomous slices may be kept as clean local Graphite commits stacked on the prior remediation slice; PR submission, pushing, publishing, and other external writes remain out of scope.

## Objective Impact

The Objective is now more execution-friendly: the H1 kernel seam, H2 contract churn, reconcile collision behavior, repo-local descriptor product model, AREG code-alignment churn, and local commit boundary no longer need per-row steering before implementation. `objective.md` Runner Policy and `roadmap.md` row policies were updated to make these decisions durable.

The remaining open question is limited to where/how to cover the first-party root sentinel upward walk with a real non-injected integration test.

## Follow-Ups

- Future runner slices should still re-verify each finding against current code before implementing it.
- Future runner checkpoints should explicitly call out any machine-facing error/status code rename performed under the preauthorized AREG rows.
- External write actions remain out of scope unless separately requested.
