# Roadmap

## Work

- [x] **Rebaseline live review feedback and branch context.**
      Done 2026-07-07 (see `updates/20260707T230504Z-live-review-feedback-rebaseline.md`): relevant merged harness-artifacts PRs were mapped, unresolved review threads were bucketed into home-dir/harness-path ownership, provision/reconcile design seams, and schema/source-of-truth duplication, and stale thread candidates were identified. No GitHub thread mutation was performed.

- [x] **Resolve home-dir and harness-path ownership.**
      Done 2026-07-07 (see `updates/20260707T234420Z-home-dir-harness-path-ownership.md`): kernel CLI now resolves a single command-context object and adapts it to explicit XDG catalog discovery, harness path ownership remains in `HarnessPathContext`, ns-init adapts SDK context into `SkillMaterializationContext`, and targeted package checks/tests plus formatting passed.

- [ ] **Clean up provision/reconcile design seams.**
      Reduce duplicated outcome construction and conflict plumbing around reconcile/preview/apply, including conflict-file extraction, conflict action classification, skipped-collision handling, and refusal-message ownership. Evidence: the reconcile flow reads as one clear domain pipeline with thin CLI adapters.

- [ ] **Clean up schema and source-of-truth duplication.**
      Consolidate repeated harness/scope schemas, duplicated schema/interface definitions, diagnostic transforms, and readonly-array choices where the shared source of truth is clear. Evidence: stale duplicate definitions are removed or explicitly retained at true boundary seams.

- [ ] **Disposition PR review threads and synthesize to the umbrella.**
      After fixes and validation, close or reply to relevant review threads only with direct evidence, leave blocked/stale-unverified threads open, and update `skill-management-subsystem` with the completed/parked disposition of this cleanup Objective.

## Parked

- [ ] Umbrella breadth intentionally out of this Objective: marketplace/remote catalog discovery, update/uninstall/version-resolution surfaces, trust gating, per-resource filtering, and provisioning additional artifact kinds.
- [ ] Any cleanup bucket that proves broader than review remediation should be parked back to `skill-management-subsystem` with rationale instead of silently widening this Objective.
