---
edges:
  - objective: skill-management-subsystem
    annotation: Subobjective of that umbrella; the first follow-on graduated from parked breadth after the ns-skills-steelthread closure. Generalizes first-party provisioning to any npm-module-bundled harness artifact and removes AREG's npx-wrapping features; the umbrella coordinates the reusable-subsystem ambition and remaining deferred breadth.
---

# npm-Module-Bundled Harness Artifact Provisioning

## Thesis

Generalize the shared harness-artifact core so it provisions **any harness artifact statically declared and bundled inside a resolved npm module** — first-party `@nseng-ai/*` packages, ns extensions, or any npm package that opts in via a static declaration — with no `npx skills` wrapping and no code executed at discovery. The steelthread proved the narrowest case (one hardcoded first-party package, the `objective` skill, provisioned via `ns skills install`); this widens catalog discovery from a single hardcoded catalog to "read each resolved npm module's declared artifacts," triggered on module install/enable and by the decided `ns update` reconcile hook.

The coupled consequence, folded into this record: **AREG stops wrapping `npx skills`.** Its acquisition/materialization features that shell out to `npx skills add` are removed. What remains — and is deliberately kept — is AREG as a **standalone whole-project inspector**: `check` / `doctor` / `skill-kind` / `skill-find` that examine a project's total installed skills and artifacts *regardless of who installed them* (our npm-bundled provisioning, direct `npx skills`, hand-authored, or anything else). Losing the npx features is acceptable and intended.

This is a **bounded execution Subobjective** under the `skill-management-subsystem` umbrella (see the `objective` skill's patterns reference) — not a steelthread (the thread it builds on is closed) and not standing. It supersedes and merges the umbrella's former "Extension-carried artifact provisioning" and "Re-platform AREG" parked rows: extensions are one category of npm module, so npm-module-bundled provisioning is the precise, generic capability, and the AREG re-platform is reframed from "wrap npx" to "drop npx, keep the inspector." See the umbrella Semantic Update `20260706T*-npm-bundled-provisioning-and-areg-inspector-reframe.md`.

**Naming (ADR 0026 `rename-ji-to-ns`, scope amended by ADR 0028):** ns-named surfaces, `@nseng-ai/*`-scoped packages. `ns` is the live binary; `@nseng-ai/harness-artifacts` and `@nseng-ai/areg` are landed. Build no new sdl- or ji-named surface.

## Starting state (source-grounded)

- **First-party provisioning exists but is hardcoded.** `@nseng-ai/harness-artifacts` provisions from `NS_FIRST_PARTY_HARNESS_ARTIFACT_CATALOG` (`first-party-catalog.ts`, currently just the `objective` skill), resolved via `resolveFirstPartyCatalogSourceRoot()`. Provenance is recorded as `ProvisionSourceProvenance { type: "first-party", packageName, relativePath, version }`, and `HarnessArtifactEntryBase.source` is typed `FirstPartyHarnessArtifactSource` — so today the model can only represent a first-party package, not "any npm module." Widening that source model is the first real change.
- **The provision core is source-agnostic enough to build on.** `buildProvisionPlan` takes explicit `sourceFiles` + a `sourceRoot`, `applyHarnessArtifactProvision` copies via an injected `HarnessArtifactFileSystemGateway`, and the install manifest v1 (`.ns-harness-artifacts-manifest.json`, per-file SHA-256, clobber-aware) records what was written. The catalog/provenance layer is what assumes first-party; the copy/plan/manifest layer generalizes.
- **The reconcile architecture is already decided** (umbrella update `20260702T041140Z`): reconcile (declared catalogs vs install manifest → plan → apply) is the primitive; `ns update` is the commanded hook; a load-time fingerprint backstops ambient drift. Where the `ns update` surface lives (this record vs kernel/extension-lifecycle) is still open.
- **Project harness selection already has durable state.** `ns.toml` at the repo root (written by `ns init`, parsed in `ts/packages/capabilities/ns-init/src/ns-toml.ts`) records the project's `harnesses = [...]` selection and is what `ns init` uses to target skill materialization. Reconcile targeting builds on this existing state rather than inventing a new file; its role was previously undocumented (reported to `repo-ontology`).
- **AREG's npx features are localized.** `AregNpxSkillsGateway` (real adapter `src/gateways/npx-skills-gateway.ts`) is called from exactly three sites: `src/operations/init.ts` (bootstrap-clones `dagster-io/asdl-tools` then `npx skills add`), `src/operations/update-skills.ts` (github refresh), `src/gateways/skillx-workspace-gateway.ts` (temp-workspace install). AREG's inspection surface (`check.ts`, `doctor-skills.ts`, `skill-kind*.ts`, `skill-find.ts`) already reads the shared `@nseng-ai/harness-artifacts/api` for lockfile parsing, mirror conventions, and frontmatter — it does not depend on the npx path.

## Scope

- **Generalize discovery from first-party package to npm module.** Extend the catalog/source model so a resolved npm module can statically declare the harness artifacts it bundles (the `ns` field in `package.json`, parsed by `@nseng-ai/kernel` extension discovery for extensions and by an analogous static read for other npm modules), and the provisioner materializes them into harness roots. No extension/module code is executed during discovery. This requires widening `HarnessArtifactEntryBase.source` / `ProvisionSourceProvenance` beyond `first-party`-only to represent an npm-module source; the copy/plan/manifest layer is reused unchanged.
- **Trigger via the decided reconcile shape.** Provision on module install/enable and via `ns update`; use the install manifest to make it idempotent and clobber-aware. Do not re-decide the reconcile architecture — implement a slice of it. The `ns update` command-surface placement (here vs kernel/extension-lifecycle) is called out as an open question, not guessed.
- **Remove AREG's npx-wrapping features** (folded in): delete/retire the `npx skills add` path and its three call sites (`init` bootstrap-clone + install, `update-skills` github refresh, `skillx` temp-workspace), plus `AregNpxSkillsGateway` / `RealAregNpxSkillsGateway` / `AregSkillxWorkspaceGateway` and their fakes, and reconcile the scenario suites that pin them (`test/scenario/{init,update-skills,skillx}-cli.test.ts`, `test/gateways/*`). Removing user-facing features is deliberate; each removal is called out, not silent.
- **Keep and sharpen AREG as a whole-project inspector.** `check` / `doctor` / `skill-kind` / `skill-find` remain and continue to examine a project's *total* installed skills/artifacts from any source. Where useful, make AREG's inspection aware of the shared install manifest so it can also verify artifacts our npm-bundled provisioning installed — as an additional source it inspects, not a format merge.
- **Record API-shape decisions as Semantic Updates.** The source-model widening is consumed by both `ns` CLI wiring and the `@nseng-ai/ns-init` seam; changes ripple.

## Non-Goals

Deferred breadth stays with the umbrella `skill-management-subsystem`:

- **Wrapping or replacing `npx skills`** in any form. We do not build a first-party fetch-and-vendor path for third-party GitHub skills; that is not our provisioning concern (the umbrella's former acquisition-replacement row is retired, not deferred). Users who want third-party skills use `npx skills` directly; AREG merely *inspects* whatever ends up on disk.
- **Converging `skills-lock.json` and the install manifest into one record format.** The prior "one hash/record format" ambition is dropped. AREG's inspector reads whatever records exist (its lockfile view and the shared manifest) as complementary sources; it does not merge them.
- The **"managed artifacts" → "kind overlays" rename** (umbrella reconciliation-sweep row) — coordinate where files overlap, do not absorb.
- The `ns update` command surface as broad extension-lifecycle work, uninstall / stale-after-upgrade / rename cleanup, marketplace/remote discovery, and provisioning the `agent` / `extension-bundle` kinds (modeled in types; skills first).

Hard non-goals inherited from the umbrella:

- No marketplace, remote registry, update resolver, semantic version solver, or dependency graph.
- No hidden database or local cache; the manifest stays an explicit, inspectable file.
- No extension/module code executed during discovery — declarations are static data only.
- Do not break `just`, existing `ns skills` behavior, `@nseng-ai/ns-init`, or AREG's retained inspection surface.

## Completion Criteria

- A resolved npm module (beyond the hardcoded first-party catalog) can statically declare bundled harness artifacts, and the shared provisioner materializes at least one real such artifact into `pi`/`claude-code`/`codex` roots, writing the install manifest with per-file SHA-256 hashes — with zero `npx skills` involvement and no module code executed at discovery.
- The source/provenance model represents an npm-module source (not only `first-party`), recorded in the manifest, and the change is additive to the steelthread's existing first-party path (which keeps working).
- Provisioning is idempotent and clobber-aware via the manifest (refuse-to-clobber-without-`--force` holds for module-bundled installs).
- AREG's `npx skills add` path and its three call sites are removed; `AregNpxSkillsGateway` / skillx gateway gone; the affected scenario suites updated deliberately with the feature removals called out.
- AREG's `check`/`doctor`/`skill-kind`/`skill-find` inspection surface still runs and still examines a project's total installed artifacts; where scoped, it recognizes shared-manifest-provisioned artifacts as an inspected source.
- Full `just` green (main suite, `typescript-style-guard`, native `tsc`, objective edge sweep `sweep-ok`).

## Definition of Progress

Progress is keepable when it:

- Advances an in-scope row — the npm-module source model, module-declaration discovery, a reconcile/provision slice, an AREG npx-removal step, or an AREG-inspector adjustment — as a coherent slice with passing tests.
- Keeps new provisioning behavior in `@nseng-ai/harness-artifacts` (consumed by `ns` CLI wiring), stays consistent with the decided vocabulary (harness artifact / skills / provision / harness), and does not preclude the reconcile architecture.
- Records source-model / API-shape decisions that bind the shared core or `@nseng-ai/ns-init` as Semantic Updates.

Do not keep changes that:

- Reintroduce `npx skills` wrapping, build first-party github acquisition, or attempt a lockfile/manifest format merge (all explicit non-goals now).
- Execute extension/module code during discovery, or read declarations dynamically rather than as static data.
- Remove an AREG inspection feature (the retained `check`/`doctor`/`skill-kind`/`skill-find` surface) while removing the npx features.
- Stub the generalization — a provisioner that still only reads the hardcoded first-party catalog, presented as npm-module-bundled support.

## Runner Policy

Bounded and slice-shaped; execution-friendly under these boundaries.

- **Direct execution allowed when:** the slice advances an open in-scope row, stays within `@nseng-ai/harness-artifacts`, `ns` CLI wiring, `@nseng-ai/areg`, and their tests, resolves no open design question by guessing, and completes with passing validation.
- **Steer or ask first when:** a slice would decide the npm-module source-model API shape (it binds the shared core and potentially `@nseng-ai/ns-init`), resolve the `ns update` command-surface placement, change `@nseng-ai/ns-init`'s gateway contract, or remove an AREG feature not clearly inside "the npx-wrapping path" — record the decision and confirm.
- **Binding cross-child lesson from the steelthread closure** (this row adds shared-core exports, so it applies): `@nseng-ai/kernel/sdk` has **two** export sync points — the `sdk` barrel and the hand-maintained jiti virtual mirror in `runtime/module-loader.ts`; a symbol added to the SDK surface must be added to both or `sdk-module-loader.test.ts` fails. A helper returning an `extensions` registry type must live in the `extensions` circle, surfaced through `@nseng-ai/kernel/cli`, never in `sdk`. See umbrella update `20260706T153500Z`.
- **How work may change files:** local edits only, committed per slice on a feature branch (never `main`/`master`); each step leaves a clean tree with tests passing; roadmap statuses and Semantic Updates updated when a slice lands decisions or evidence.
- **Validation before keeping work:** touched-package tests plus repo `just`; formatting via `just dprint-fix` / TS autofixers, not by hand.
- **Will not happen unless explicitly requested:** pushing, PR creation/submission, publishing, provisioning into real user-global harness directories outside tests or explicit user-invoked commands, edits to the umbrella beyond mirrored-edge frontmatter and parked-row dispositions, or any external write-capable action.

## Assumptions and Risks

Assumptions:

- The provision/plan/manifest core generalizes to an npm-module source with an additive source-model change; the catalog/provenance layer is the only part that assumes first-party.
- Static declaration (the `ns` package.json field) is expressive enough to enumerate a module's bundled artifacts without executing module code.
- AREG's value survives losing acquisition: a whole-project inspector across all artifact sources is worth keeping independently of who provisions.

Risks:

- **Scope creep back toward npx.** The gravity of "AREG used to install things" may pull acquisition back in. Defend by holding the non-goal: we provision npm-module-bundled artifacts only; third-party acquisition is out, permanently for this record.
- **Dynamic-discovery temptation.** Reading a module's artifacts by importing/executing it is easier than a static parse but violates the no-code-at-discovery rule. Keep declarations static data.
- **Silent AREG regressions.** Removing the npx path touches `init`/`update-skills`/`skillx` and their scenario suites; the inspection surface must keep passing, and every user-facing removal must be explicit.
- **Fire-and-forget umbrella** on the parent side — mirrored here; the umbrella must keep this row's `[~]` current and synthesize closure.

## Open Questions

- ~~**npm-module source model.**~~ Resolved (user-confirmed): additive two-variant source union, static `ns.harnessArtifacts` declaration, explicit-name module lookup, schema owned by `@nseng-ai/harness-artifacts`. See update `20260706T191545Z-npm-module-source-model-decision.md`.
- ~~**`ns update` command-surface placement**~~ Resolved (user-confirmed): this record ships a minimal top-level `ns update` implementing reconcile; the kernel keeps zero artifact knowledge; a future extension-lifecycle surface absorbs it via the same primitive. See update `20260706T194500Z-reconcile-trigger-and-targeting-decisions.md`.
- ~~**AREG↔manifest inspection depth**~~ Resolved in code: AREG recognizes shared manifests as metadata plus target-presence inspection only; it does not recompute per-file hashes or duplicate `ns update` drift/conflict logic. See update `20260707T001132Z-areg-shared-manifest-inspection.md`.

## Closure

Closed 2026-07-07 as completed.

This Subobjective delivered the bounded npm-module-bundled provisioning follow-on from `skill-management-subsystem`: the shared `@nseng-ai/harness-artifacts` core now represents npm-module source/provenance additively, parses static `ns.harnessArtifacts` declarations without executing module code, discovers extension-root module artifacts, and provisions first-party plus extension-root artifacts through the minimal top-level `ns update` reconcile slice with manifest hashes, idempotence, and clobber protection intact. The existing first-party steelthread path remains additive rather than migrated away.

The folded AREG outcome also completed: `areg init`, `areg update-skills`, and `areg exec skillx ...` / skillx wrapping were intentionally removed along with their npx/skillx gateways and scenario pins, while AREG's retained `check` / `doctor skills` / `skill find|list|show|apply` inspector surface remained green. AREG now treats shared harness manifests as additional read-only provenance and target-presence evidence only; it does not merge `skills-lock.json` with install manifests or duplicate `ns update` hash/conflict logic.

Closure evidence:

- Roadmap rows are all complete, including source-model decision, module declaration discovery, reconcile provisioning, AREG npx-removal, AREG manifest-aware inspection, and umbrella synthesis.
- Umbrella synthesis is recorded in `skill-management-subsystem` via update `20260707T002013Z-npm-bundled-provisioning-closure-synthesis.md`; the umbrella parked row is now `[x]` and records the proving-consumer finding that the shared core needed additive API changes while the kernel kept zero artifact knowledge and consumers stayed thin.
- Retired dispositions still hold: no first-party `npx skills` wrapping/replacement, no GitHub acquisition replacement, and no `skills-lock.json` / install-manifest convergence.
- Full repo validation passed on 2026-07-07: `just` completed `dprint check`, TypeScript style guard (120 tests), dependency check, `oxfmt --check`, `oxlint`, `tsgo -p tsconfig.json`, main Vitest suite (459 files / 4579 tests), and Objective edge sweep `sweep-ok`.

Remaining breadth is intentionally parked with the umbrella: managed-artifacts → kind-overlays vocabulary cleanup, broader extension-lifecycle update/uninstall/staleness/trust/filtering surfaces, marketplace/remote acquisition, and additional harness artifact kinds (`agent`, `extension-bundle`).
