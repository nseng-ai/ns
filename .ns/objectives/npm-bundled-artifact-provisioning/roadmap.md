# Roadmap

## Work

Source-model decision first (it binds the shared core's API); provisioning and AREG-removal slices follow.

- [x] **Decide the npm-module source model.** Decided and user-confirmed: additive two-variant source union (`first-party` untouched + `npm-module { packageName, relativePath }`, provenance mirrored with package version, fallback `"unversioned"`); static `ns.harnessArtifacts` kind-discriminated array in `package.json` (skills accepted, other kinds diagnosed); derived artifact ids `<packageName>:<name>`; extensions resolve roots via the kernel extension-root directories, other npm packages by explicit name via a static `node_modules` walk (no dependency sweep); declaration schema owned and parsed by `@nseng-ai/harness-artifacts` with zero kernel SDK changes. Evidence: Semantic Update `20260706T191545Z-npm-module-source-model-decision.md`.

- [ ] **Discover bundled artifacts from a resolved npm module.** Build catalog discovery that reads the static declaration from resolved modules and produces provisionable entries, replacing the single hardcoded `NS_FIRST_PARTY_HARNESS_ARTIFACT_CATALOG` assumption with "first-party package + any declaring module." Blocked-by: source-model decision.

- [ ] **Provision module-bundled artifacts through the shared core + reconcile slice.** Materialize at least one real module-bundled artifact via the existing `buildProvisionPlan` → `applyHarnessArtifactProvision` + manifest path, triggered by the decided minimal top-level `ns update` (uniform install-new + refresh across first-party and extension sources; both extension roots swept; targeting from `ns.toml` harness selection, project scope; orphans reported; `--dry-run`/`--force`; fingerprint backstop and non-extension packages deferred — see update `20260706T194500Z`). Idempotent and clobber-aware. Blocked-by: discovery. Evidence: manifest written with per-file SHA-256, provision + re-provision (no-op) tests.

- [x] **Remove AREG's `npx skills add` path (folded-in feature removal).** Deleted the user-facing `areg init`, `areg update-skills`, and `areg exec skillx parse|list|fetch|cleanup` surfaces; removed the npx/skillx gateways, fakes, operation files, scenario/unit tests, and the `skillx` repo skill plus mirrors/Pi exclusion/lockfile entry. AREG remains an inspector (`check`, `doctor skills`, `skill find/list/show/apply`) and `skill-management` now points acquisition/refresh guidance directly at targeted `npx skills add` usage. Evidence: areg test reconciliation, retained CLI smoke checks, and stale-symbol grep sweeps in the slice validation.

- [ ] **Keep AREG's inspector green; teach it the shared manifest as a source.** Ensure `check`/`doctor`/`skill-kind`/`skill-find` still run and examine the project's total installed artifacts after the npx removal. Where scoped, make the inspector recognize shared-manifest-provisioned artifacts as an additional inspected source (recognize-and-report; full verification depth is an open question). Blocked-by: the AREG-removal row landing.

- [ ] **Synthesize closure into the umbrella.** Flip the umbrella's `[~]` row, record whether the source-model widening needed additive core changes (the proving-consumer finding), and confirm the retired npx-acquisition and lockfile/manifest-convergence dispositions still hold. Guards against the fire-and-forget-umbrella failure mode.

## Parked

Out of this Subobjective; coordinated by the umbrella:

- [ ] "managed artifacts" → "kind overlays" rename (umbrella reconciliation-sweep row; coordinate where AREG files overlap).
- [ ] `ns update` as broad extension-lifecycle work, uninstall / stale-after-upgrade / rename cleanup, marketplace/remote discovery, and provisioning the `agent`/`extension-bundle` kinds.
