# npm-module-bundled provisioning child synthesized back into umbrella

## Summary

Synthesized the completed `npm-bundled-artifact-provisioning` Subobjective back into this umbrella, closing the `[~]` fire-and-forget tracking loop for the first follow-on after `ns-skills-steelthread`.

Child outcome synthesized here:

- The shared core now supports an additive npm-module source/provenance variant and static `ns.harnessArtifacts` declaration parsing in `@nseng-ai/harness-artifacts`; first-party provisioning remains intact.
- Extension-root npm-module declarations are discovered without executing module code, and unsupported/non-skill declarations are diagnostics rather than hidden behavior.
- A shared reconcile planner/driver plus minimal top-level `ns update` provisions first-party and extension-root artifacts through the same manifest-aware core; the kernel keeps zero artifact knowledge, with command wiring supplied by the harness-artifacts preinstalled command catalog.
- AREG's `npx skills add` wrapping features were deliberately removed (`areg init`, `areg update-skills`, and `areg exec skillx ...` surfaces plus their gateways/tests/skill mirrors), while the retained inspector surface stayed green.
- AREG now reads `.ns-harness-artifacts-manifest.json` as an additional inspection source for provenance and target-presence diagnostics; it does not recompute per-file hashes or duplicate `ns update` conflict/drift logic.

## Objective Impact

- The umbrella parked row for npm-module-bundled artifact provisioning is now marked `[x]` and records the child outcome.
- The proving-consumer finding is recorded: source-model widening did require additive shared-core/API changes, but consumers stayed thin and artifact knowledge did not leak into the kernel.
- The retired dispositions from `20260706T160000Z-npm-bundled-provisioning-and-areg-inspector-reframe.md` still hold: ns does not wrap or replace `npx skills`, does not build first-party GitHub acquisition for third-party skills, and does not converge `skills-lock.json` with the harness install manifest. AREG inspects complementary records instead.
- Remaining umbrella breadth is still parked separately: skill workflow/vocabulary reconciliation, marketplace/remote acquisition, broad update/uninstall/staleness/trust/filtering surfaces, and additional artifact kinds.

## Follow-Ups

- Close `npm-bundled-artifact-provisioning` after recording final selected-objective tracking/validation evidence.
- Continue the umbrella's remaining parked breadth as separate follow-on slices or Subobjectives; do not reopen npx-wrapping or lockfile/manifest-convergence as hidden scope.
