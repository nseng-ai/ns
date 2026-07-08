# Harness-artifacts post-review cleanup synthesized

## Summary

Subobjective `harness-artifacts-post-review-cleanup` finished its bounded post-review cleanup after the API re-export / `requiresForce` naming slice.

Completed buckets:

- **Home-dir/harness-path ownership:** kernel CLI resolves one `NsCliCommandContextInput`, adapts it to command execution and XDG catalog discovery (`xdgHomeDir`), ns-init adapts SDK context into `SkillMaterializationContext`, and harness path semantics remain in `HarnessPathContext`.
- **Provision/reconcile design seams:** reconcile/provision now use shared conflict-file extraction, a single reconcile outcome builder/action classification path, prepare/apply plus `previewFromPrepared`, composed preview-based provisioning outcomes, shared conflict description, and `splitProvisionFirstPartySkillOutcome` for thin adapters.
- **Schema/source-of-truth cleanup:** PR #3229 consolidates harness/scope/source schemas and source lists, derives provision plan/file decision types from schemas, shares diagnostic optional-field metadata, and uses readonly Zod arrays where the domain already returns readonly data.

Review-thread disposition was completed with direct evidence using repo-owned `ns address exec` primitives. Fixed/stale threads were replied/resolved across PRs #3121, #3137, #3140, #3158, #3159, and #3161. PR #3162 has one intentionally unresolved reply-only thread, `PRRT_kwDOR4YhMs6O67Wa`, because its AREG `project-fs` error-code literal cleanup is outside this child Objective.

PR #3229 (`Consolidate harness-artifacts schemas and preserve readonly outputs`) is open/submitted and carries the schema/source cleanup evidence.

## Objective Impact

The umbrella's `harness-artifacts-post-review-cleanup` child row can move from in-flight to finished/closed. This child removed the final post-review blockers around core `@nseng-ai/harness-artifacts` cleanup without widening into parked umbrella breadth.

Cross-child lessons for the subsystem record:

- The shared `@nseng-ai/harness-artifacts` package remains the right owner for harness path, provision/reconcile, and schema/source primitives; kernel and ns-init should adapt into its domain contexts rather than own those semantics.
- Reconcile/provision should stay a small shared core with thin command/consumer adapters, not duplicated per consumer.
- Schema consolidation paid for itself only at narrow repeated sources of truth; no broad schema registry/framework was needed.
- AREG-tail cleanup remains separate from core harness-artifacts cleanup and should be scheduled only when an AREG-focused need appears.

Remaining umbrella work is unaffected: `remote-artifact-module-acquisition` remains in flight, and follow-on uninstall/stale-after-upgrade/rename cleanup remains a separate work row.

## Follow-Ups

- Keep `PRRT_kwDOR4YhMs6O67Wa` parked for a future AREG-tail cleanup if it becomes worthwhile.
- Continue the existing `remote-artifact-module-acquisition` child and the follow-on uninstall/stale-after-upgrade/rename cleanup row independently of this closed child.
