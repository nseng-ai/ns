# Roadmap

## Work

- [ ] H1 — Resolve `homeDir` once and make absence an explicit error for user-scope operations; delete the three `?? ""` sentinels (`skills-shared.ts`, `ns/update.ts`, `real-skill-materializer.ts`).
  - Policy: the capability-side fix is direct execution; ask first before adding `homeDir` to the kernel `NsExtensionApi` surface (open question in objective.md).
  - Evidence: a test proving user-scope operations fail loudly (not write cwd-relative) when HOME is unset.
- [ ] H2 — Make "conflicted" a first-class apply outcome (`applyPreparedProvision(prepared, {force})` shape): one `prepareProvision` per reconcile pair, delete `shouldForce` and the `locally_edited_conflict` error variant, update `skills-install.ts` to consume the outcome.
  - Policy: steer first — this changes a machine-facing error contract and the reconcile apply path.
  - Evidence: conflict-outcome tests replacing the error-variant tests; reconcile suite green.
- [ ] H3+H4+H5 — AREG dead-seam sweep: delete the GitHub gateway chain (interface, real adapter, fake, `command-constants.ts`, context wiring, exports, run-scenario option, gateway tests, stranded `displayCommand`), the prompt gateway chain (incl. vestigial scripted `responses` in tests), and the mutation-policy mechanism (`mutation-policy.ts`, `policy` request field, dead `resolveAllowedWriteTarget` branch, fake-log echoes); rename the `init-*` error codes to policy-neutral names in the same pass.
  - Policy: deletions are direct execution; the `init-*` code renames are machine-facing — flag them in the checkpoint.
  - Evidence: grep proving zero remaining references; areg suite green.
- [ ] Make provisioning I/O binary-safe: bytes-based gateway read/write for artifact files so non-UTF-8 skill assets copy without corruption (or explicitly reject non-text sources — decide in-slice, bytes preferred).
- [ ] Consolidate harness-artifacts fs plumbing: shared `isNodeErrorCode`/`fileSystemError`, one filesystem error-info type, one node adapter; remove discovery's `OptionalTextFileState` import from the apply layer. Do not unify the narrow state ADTs themselves.
  - Guidance: sequence after the bytes-gateway row — the gateway shape settles there. Extract the duplicated in-memory fs test fake to shared test support in the same pass.
- [ ] Reconcile collision policy: skip colliding artifacts and surface the existing discovery diagnostics in the report instead of hard-failing all of `ns update`; delete `checkDesiredCollisions`/`ReconcilePlanErrorInfo`/`ReconcileCollision`.
  - Policy: steer first — changes `ns update` failure semantics.
  - Evidence: test showing one colliding third-party artifact no longer blocks first-party provisioning, with the collision reported.
- [ ] Derive the first-party root sentinel from the catalog entry instead of the hardcoded `skills/objective/SKILL.md` probe; add coverage for the upward walk so a skill rename cannot ship green and break `ns update` at runtime.
- [ ] Add a deep `provisionFirstPartySkill()` to the harness-artifacts api and collapse `skills-install.ts` and `RealSkillMaterializer` to thin adapters; export the decision schemas beside `reconcileReportSchema`; absorb the materializer's test-only `sourceRoot`/`sourceVersion` knobs.
- [ ] Repo-local descriptor honesty: either check in `.ns/extensions/skills/` with parity-test coverage, or convert the skills commands to plain preinstalled-catalog entries and delete `repo-local-ns-extension.ts`.
  - Policy: ask first — decision-bearing with two real alternatives (open question in objective.md).
- [ ] Delete the `.git`-marker projectRoot fallback in `ns/command.ts`; use a real `git init` in the ns-cli test fixture, matching the objectives idiom.
- [ ] Remove dead planner branches: the statically dead `unsupported_artifact_kind` re-wrap in `buildProvisionPlan`, the unreachable O(n²) `.find()`+`continue` loop shape, and the dead `acceptedNames` check in `module-artifact-declaration.ts` (keep the duplicate-name pre-pass; its semantics are tested).
- [ ] AREG layering residue: move the manifest domain logic (~70 lines of classification/view/schema/grouping) from `gateways.ts` to an operations module; pin the manifest-sources join at one altitude (drop it from the gateway inspection type and the fake); unify the check/doctor manifest failure codes and deduplicate their messages/remediation strings.
  - Policy: the code alignment changes machine-facing codes — flag in the checkpoint.
- [ ] ns-init dead surface: delete the barrel re-exports of harness-artifacts symbols (zero barrel consumers) and the self-obsoleted `pendingBundleSkillMaterializer` stub (inline as a test-local fake).
- [ ] LOW sweep (opportunistic, alongside adjacent slices): prune over-exported api barrel internals incl. `sortStrings` altitude; `installManifestKey`/`manifestEntryKey` identity-wrapper collapse; `normalizeHarnessId`/`resolveHarnessSpec` inversion; kebab-inside-snake `invalid_ns_toml` double-encoding; discovery "other"-as-"file" report; keyed `TargetFileHashFact` input; areg provenance type aliasing; consumer-less fake options + identity `copyProjectOperation`; `ns skills list` context cost; skills-naming drift + duplicated snake→kebab mapper; misc residue (harness id in `manifestPath` field, stringly view schema, stale test name).

## Parked

- (empty)
