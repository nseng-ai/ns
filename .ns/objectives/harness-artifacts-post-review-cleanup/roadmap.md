# Roadmap

## Work

- [ ] **Rebaseline live review feedback and branch context.**
      Re-download unresolved feedback for the harness-artifacts stack when GitHub rate limits allow it, map live comments to the three cleanup buckets, and identify stale comments created by already-landed stack changes. Evidence: feedback/thread inventory captured in a Semantic Update or in the implementation report before thread mutation.

- [ ] **Resolve home-dir and harness-path ownership.**
      Decide and implement the smallest coherent ownership model for effective home/env fallback and harness-relative path helpers across harness-artifacts, kernel, ns-init, and tests. Evidence: duplicated fallback paths removed or justified, package boundaries respected, and relevant tests/checks pass.

- [ ] **Clean up provision/reconcile design seams.**
      Reduce duplicated outcome construction and conflict plumbing around reconcile/preview/apply, including conflict-file extraction, conflict action classification, skipped-collision handling, and refusal-message ownership. Evidence: the reconcile flow reads as one clear domain pipeline with thin CLI adapters.

- [ ] **Clean up schema and source-of-truth duplication.**
      Consolidate repeated harness/scope schemas, duplicated schema/interface definitions, diagnostic transforms, and readonly-array choices where the shared source of truth is clear. Evidence: stale duplicate definitions are removed or explicitly retained at true boundary seams.

- [ ] **Disposition PR review threads and synthesize to the umbrella.**
      After fixes and validation, close or reply to relevant review threads only with direct evidence, leave blocked/stale-unverified threads open, and update `skill-management-subsystem` with the completed/parked disposition of this cleanup Objective.

## Parked

- [ ] Umbrella breadth intentionally out of this Objective: marketplace/remote catalog discovery, update/uninstall/version-resolution surfaces, trust gating, per-resource filtering, and provisioning additional artifact kinds.
- [ ] Any cleanup bucket that proves broader than review remediation should be parked back to `skill-management-subsystem` with rationale instead of silently widening this Objective.
