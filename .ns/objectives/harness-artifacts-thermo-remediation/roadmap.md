# Roadmap

## Work

- [ ] H1 — Resolve `homeDir` once by exposing the kernel-computed value on `NsExtensionApi`, make absence an explicit error for user-scope operations, and delete the three `?? ""` sentinels (`skills-shared.ts`, `ns/update.ts`, `real-skill-materializer.ts`).
  - Policy: direct execution is preauthorized for the kernel `NsExtensionApi.homeDir` surface change and its in-repo consumers/tests.
  - Evidence: a test proving user-scope operations fail loudly (not write cwd-relative) when HOME is unset, plus coverage that command contexts receive the kernel-computed home directory.
- [ ] H2 — Make "conflicted" a first-class apply outcome (`applyPreparedProvision(prepared, {force})` shape): one `prepareProvision` per reconcile pair, delete `shouldForce` and the `locally_edited_conflict` error variant, update `skills-install.ts` to consume the outcome.
  - Policy: direct execution is preauthorized for deleting the apply-layer error variant and updating in-repo command/API consumers atomically.
  - Evidence: conflict-outcome tests replacing the error-variant tests; reconcile suite green.
- [ ] H3+H4+H5 — AREG dead-seam sweep: delete the GitHub gateway chain (interface, real adapter, fake, `command-constants.ts`, context wiring, exports, run-scenario option, gateway tests, stranded `displayCommand`), the prompt gateway chain (incl. vestigial scripted `responses` in tests), and the mutation-policy mechanism (`mutation-policy.ts`, `policy` request field, dead `resolveAllowedWriteTarget` branch, fake-log echoes); rename the `init-*` error codes to policy-neutral names in the same pass.
  - Policy: direct execution is preauthorized for the deletions and atomic `init-*` code renames; flag machine-facing renames in the checkpoint.
  - Evidence: grep proving zero remaining references; areg suite green.
- [ ] Make provisioning I/O binary-safe: bytes-based gateway read/write for artifact files so non-UTF-8 skill assets copy without corruption (or explicitly reject non-text sources — decide in-slice, bytes preferred).
- [ ] Consolidate harness-artifacts fs plumbing: shared `isNodeErrorCode`/`fileSystemError`, one filesystem error-info type, one node adapter; remove discovery's `OptionalTextFileState` import from the apply layer. Do not unify the narrow state ADTs themselves.
  - Guidance: sequence after the bytes-gateway row — the gateway shape settles there. Extract the duplicated in-memory fs test fake to shared test support in the same pass.
- [ ] Reconcile collision policy: skip colliding artifacts and surface the existing discovery diagnostics in the report instead of hard-failing all of `ns update`; delete `checkDesiredCollisions`/`ReconcilePlanErrorInfo`/`ReconcileCollision`.
  - Policy: direct execution is preauthorized for partial provisioning: non-colliding artifacts are provisioned, colliding artifacts are reported as skipped, and `ns update` exits nonzero.
  - Evidence: test showing one colliding third-party artifact no longer blocks first-party provisioning, with the collision reported and a nonzero command result.
- [ ] Derive the first-party root sentinel from the catalog entry instead of the hardcoded `skills/objective/SKILL.md` probe; add coverage for the upward walk so a skill rename cannot ship green and break `ns update` at runtime.
- [ ] Add a deep `provisionFirstPartySkill()` to the harness-artifacts api and collapse `skills-install.ts` and `RealSkillMaterializer` to thin adapters; export the decision schemas beside `reconcileReportSchema`; absorb the materializer's test-only `sourceRoot`/`sourceVersion` knobs.
- [ ] Repo-local descriptor honesty: convert the skills commands to plain preinstalled-catalog entries and delete `repo-local-ns-extension.ts`.
  - Policy: direct execution is preauthorized for the plain preinstalled-catalog model; do not check in `.ns/extensions/skills/` artifacts for this row.
- [ ] Delete the `.git`-marker projectRoot fallback in `ns/command.ts`; use a real `git init` in the ns-cli test fixture, matching the objectives idiom.
- [ ] Remove dead planner branches: the statically dead `unsupported_artifact_kind` re-wrap in `buildProvisionPlan`, the unreachable O(n²) `.find()`+`continue` loop shape, and the dead `acceptedNames` check in `module-artifact-declaration.ts` (keep the duplicate-name pre-pass; its semantics are tested).
- [ ] AREG layering residue: move the manifest domain logic (~70 lines of classification/view/schema/grouping) from `gateways.ts` to an operations module; pin the manifest-sources join at one altitude (drop it from the gateway inspection type and the fake); unify the check/doctor manifest failure codes and deduplicate their messages/remediation strings.
  - Policy: direct execution is preauthorized for atomic check/doctor code alignment; flag machine-facing code renames in the checkpoint.
- [ ] ns-init dead surface: delete the barrel re-exports of harness-artifacts symbols (zero barrel consumers) and the self-obsoleted `pendingBundleSkillMaterializer` stub (inline as a test-local fake).
- [ ] LOW sweep (opportunistic, alongside adjacent slices): prune over-exported api barrel internals incl. `sortStrings` altitude; `installManifestKey`/`manifestEntryKey` identity-wrapper collapse; `normalizeHarnessId`/`resolveHarnessSpec` inversion; kebab-inside-snake `invalid_ns_toml` double-encoding; discovery "other"-as-"file" report; keyed `TargetFileHashFact` input; areg provenance type aliasing; consumer-less fake options + identity `copyProjectOperation`; `ns skills list` context cost; skills-naming drift + duplicated snake→kebab mapper; misc residue (harness id in `manifestPath` field, stringly view schema, stale test name).

## PR Grouping

Target about five local Graphite PRs, grouped by subsystem and risk rather than one roadmap row per PR. Split a group only when the diff crosses review boundaries or validation evidence becomes hard to interpret; fold LOW items into adjacent groups that already touch the same files.

1. **Home/path safety foundation** — H1 kernel `NsExtensionApi.homeDir`, `.git` marker projectRoot fallback deletion, and first-party root sentinel derivation. Rationale: path/source-of-truth correctness in one review.
2. **Provisioning apply/reconcile semantics** — H2 conflict-as-outcome plus reconcile collision skip/report/nonzero behavior. Rationale: both change provisioning outcomes and reconcile/apply tests; review behavior together.
3. **Provisioning I/O and fs plumbing** — binary-safe artifact I/O plus shared fs error helpers/adapter/test fake and removal of cross-layer `OptionalTextFileState` import. Rationale: bytes gateway shape and fs plumbing are coupled.
4. **First-party skills/catalog consolidation** — deep `provisionFirstPartySkill()`, thin `skills-install.ts`/`RealSkillMaterializer` adapters, repo-local descriptor honesty via plain preinstalled entries, and ns-init dead surface if naturally touched. Rationale: one catalog/provisioning adapter shape review.
5. **AREG and tail cleanup** — H3/H4/H5 dead-seam sweep, AREG layering residue/code alignment, dead planner branches, and remaining local LOW sweep items. Rationale: mostly deletion/refactor residue cleanup after core provisioning architecture settles.

## Parked

- (empty)
