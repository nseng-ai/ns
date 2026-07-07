# Roadmap

## Work

Source-model decision first (it binds the shared core's API); provisioning and AREG-removal slices follow.

- [x] **Decide the npm-module source model.** Decided and user-confirmed: additive two-variant source union (`first-party` untouched + `npm-module { packageName, relativePath }`, provenance mirrored with package version, fallback `"unversioned"`); static `ns.harnessArtifacts` kind-discriminated array in `package.json` (skills accepted, other kinds diagnosed); derived artifact ids `<packageName>:<name>`; extensions resolve roots via the kernel extension-root directories, other npm packages by explicit name via a static `node_modules` walk (no dependency sweep); declaration schema owned and parsed by `@nseng-ai/harness-artifacts` with zero kernel SDK changes. Evidence: Semantic Update `20260706T191545Z-npm-module-source-model-decision.md`.

- [x] **Discover bundled artifacts from a resolved npm module.** Implemented the extension-root discovery slice in `@nseng-ai/harness-artifacts`: static `ns.harnessArtifacts` parser, additive npm-module source/provenance support, manifest schema widening, fake-backed extension-root catalog discovery over XDG data + project `.ns/extensions`, diagnostics for unsupported kinds / invalid declarations / missing `SKILL.md` / duplicates, and public API exports. Non-extension explicit package lookup remains deferred per update `20260706T194500Z`. Evidence: `module-artifact-declaration.test.ts`, `module-artifact-discovery.test.ts`, npm-module provenance test in `provision-plan.test.ts`, and package `test`/`check` gates.

- [x] **Provision module-bundled artifacts through the shared core + reconcile slice.** Implemented the shared reconcile planner/driver plus minimal top-level `ns update`: first-party + extension-root npm-module catalogs are planned uniformly; repo-root `ns.toml` harness selection installs new project-scope artifacts; manifest-tracked entries refresh even without selection; orphans are report-only; locally edited targets conflict unless `--force`; command cwd walks up to the enclosing git root. Evidence: `reconcile-plan.test.ts`, `reconcile-apply.test.ts`, moved `ns-toml.test.ts`, ns-cli `ns update` help/full-flow scenario, package `check`/`test` gates, and Semantic Update `20260706T223456Z-ns-update-reconcile-slice.md`.

- [x] **Remove AREG's `npx skills add` path (folded-in feature removal).** Deleted the user-facing `areg init`, `areg update-skills`, and `areg exec skillx parse|list|fetch|cleanup` surfaces; removed the npx/skillx gateways, fakes, operation files, scenario/unit tests, and the `skillx` repo skill plus mirrors/Pi exclusion/lockfile entry. AREG remains an inspector (`check`, `doctor skills`, `skill find/list/show/apply`) and `skill-management` now points acquisition/refresh guidance directly at targeted `npx skills add` usage. Evidence: areg test reconciliation, retained CLI smoke checks, and stale-symbol grep sweeps in the slice validation.

- [x] **Keep AREG's inspector green; teach it the shared manifest as a source.** AREG now has a read-only shared-manifest inspection concept backed by `@nseng-ai/harness-artifacts/api`: `areg check` reports invalid manifests and missing manifest skill targets / `SKILL.md`; `areg doctor skills` reports manifest provenance plus missing-target diagnostics; `areg skill find/list/show` expose additive manifest provenance for matching on-disk skills; `areg skill apply` remains scoped to skill-kind root mutations and does not reconcile manifests. Depth is metadata plus target presence only; overlap with `skills-lock.json` / roots is informational. Evidence: `pnpm --dir ts --filter @nseng-ai/areg test -- --run`, `pnpm --dir ts --filter @nseng-ai/areg check`, and Semantic Update `20260707T001132Z-areg-shared-manifest-inspection.md`.

- [x] **Synthesize closure into the umbrella.** Completed in the umbrella record: flipped the umbrella's npm-module-bundled provisioning row to complete, recorded that source-model widening needed additive core changes plus thin command/inspector consumers, and confirmed the retired npx-acquisition and lockfile/manifest-convergence dispositions still hold. Evidence: umbrella Semantic Update `20260707T002013Z-npm-bundled-provisioning-closure-synthesis.md`.

## Parked

Out of this Subobjective; coordinated by the umbrella:

- [ ] "managed artifacts" → "kind overlays" rename (umbrella reconciliation-sweep row; coordinate where AREG files overlap).
- [ ] `ns update` as broad extension-lifecycle work, uninstall / stale-after-upgrade / rename cleanup, marketplace/remote discovery, and provisioning the `agent`/`extension-bundle` kinds.
