# Roadmap

## Work

- [x] **Rebaseline live review feedback and branch context.**
      Done 2026-07-07 (see `updates/20260707T230504Z-live-review-feedback-rebaseline.md`): relevant merged harness-artifacts PRs were mapped, unresolved review threads were bucketed into home-dir/harness-path ownership, provision/reconcile design seams, and schema/source-of-truth duplication, and stale thread candidates were identified. No GitHub thread mutation was performed.

- [x] **Resolve home-dir and harness-path ownership.**
      Done 2026-07-07 (see `updates/20260707T234420Z-home-dir-harness-path-ownership.md`): kernel CLI now resolves a single command-context object and adapts it to explicit XDG catalog discovery, harness path ownership remains in `HarnessPathContext`, ns-init adapts SDK context into `SkillMaterializationContext`, and targeted package checks/tests plus formatting passed.

- [x] **Clean up provision/reconcile design seams.**
      Done 2026-07-08 (see `updates/20260708T004545Z-provision-reconcile-seam-cleanup.md`): single reconcile outcome builder with conflict-aware action classification, shared conflict-file extraction, roots-once resolution without bare throws, prepare/apply-only public provision API with `previewFromPrepared`, composed provisioning outcome shape, shared conflict core sentence, and a success/failure splitter consumed by thin `ns skills install` and ns-init adapters.

- [x] **Clean up schema and source-of-truth duplication.**
      Done 2026-07-08 (see `updates/20260708T041129Z-schema-source-of-truth-cleanup.md`): shared harness/source-type schemas now back reconcile and install-manifest parsing, provision decision/file types derive from schemas, diagnostics share optional-field schema metadata for exact-optional normalization, and readonly Zod arrays remove defensive result spreads while preserving JSON output shape.

- [ ] **Disposition PR review threads and synthesize to the umbrella.**
      After fixes and validation, close or reply to relevant review threads only with direct evidence, leave blocked/stale-unverified threads open, and update `skill-management-subsystem` with the completed/parked disposition of this cleanup Objective.

## Parked

- [ ] Umbrella breadth intentionally out of this Objective: marketplace/remote catalog discovery, update/uninstall/version-resolution surfaces, trust gating, per-resource filtering, and provisioning additional artifact kinds.
- [ ] Any cleanup bucket that proves broader than review remediation should be parked back to `skill-management-subsystem` with rationale instead of silently widening this Objective.
