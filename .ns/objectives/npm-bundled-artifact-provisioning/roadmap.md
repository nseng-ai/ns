# Roadmap

## Work

Source-model decision first (it binds the shared core's API); provisioning and AREG-removal slices follow.

- [ ] **Decide the npm-module source model.** Widen `HarnessArtifactEntry.source` / `ProvisionSourceProvenance` from `first-party`-only to represent an npm-module source, and decide how a module's bundled artifacts are declared (`ns` field in `package.json`) and resolved for extensions vs other npm packages — statically, no code executed. Additive to the steelthread's first-party path. Unblocks everything else. → Semantic Update.

- [ ] **Discover bundled artifacts from a resolved npm module.** Build catalog discovery that reads the static declaration from resolved modules and produces provisionable entries, replacing the single hardcoded `NS_FIRST_PARTY_HARNESS_ARTIFACT_CATALOG` assumption with "first-party package + any declaring module." Blocked-by: source-model decision.

- [ ] **Provision module-bundled artifacts through the shared core + reconcile slice.** Materialize at least one real module-bundled artifact into `pi`/`claude-code`/`codex` roots via the existing `buildProvisionPlan` → `applyHarnessArtifactProvision` + manifest path, triggered on module install/enable and by a slice of `ns update`. Idempotent and clobber-aware. Blocked-by: discovery. Evidence: manifest written with per-file SHA-256, provision + re-provision (no-op) tests.

- [ ] **Remove AREG's `npx skills add` path (folded-in feature removal).** Delete the three call sites (`init` bootstrap-clone + install, `update-skills` github refresh, `skillx` temp-workspace) and the gateways (`AregNpxSkillsGateway`/`RealAregNpxSkillsGateway`, `AregSkillxWorkspaceGateway`) + fakes. Call out each removed user-facing feature. Reconcile `test/scenario/{init,update-skills,skillx}-cli.test.ts` and `test/gateways/*`. Independent of the provisioning rows — can proceed in parallel.

- [ ] **Keep AREG's inspector green; teach it the shared manifest as a source.** Ensure `check`/`doctor`/`skill-kind`/`skill-find` still run and examine the project's total installed artifacts after the npx removal. Where scoped, make the inspector recognize shared-manifest-provisioned artifacts as an additional inspected source (recognize-and-report; full verification depth is an open question). Blocked-by: the AREG-removal row landing.

- [ ] **Synthesize closure into the umbrella.** Flip the umbrella's `[~]` row, record whether the source-model widening needed additive core changes (the proving-consumer finding), and confirm the retired npx-acquisition and lockfile/manifest-convergence dispositions still hold. Guards against the fire-and-forget-umbrella failure mode.

## Parked

Out of this Subobjective; coordinated by the umbrella:

- [ ] "managed artifacts" → "kind overlays" rename (umbrella reconciliation-sweep row; coordinate where AREG files overlap).
- [ ] `ns update` as broad extension-lifecycle work, uninstall / stale-after-upgrade / rename cleanup, marketplace/remote discovery, and provisioning the `agent`/`extension-bundle` kinds.
