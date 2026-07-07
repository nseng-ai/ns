# Roadmap

## Work

- [x] Establish the package and command vocabulary for the `ns` CLI.
      Decided (see `updates/20260702T035321Z-harness-artifact-vocabulary-and-layering.md`): domain term **harness artifact** with kinds `skill`/`agent`/`extension-bundle`; user-facing command `ns skills`; verb **provision**; **harness** over "platform"; AREG re-read as Artifact Registry. Package name confirmed and landed as `@nseng-ai/harness-artifacts` at `ts/packages/capabilities/harness-artifacts`, seeded by pushing down areg's lockfile/mirror/frontmatter convention code (see `updates/20260706T100934Z-harness-artifacts-package-seeded-by-areg-pushdown.md`).

- [x] Subobjective `ns-skills-steelthread`: designed and validated the `ns skills` thread end-to-end. **Closed 2026-07-06 as completed** (see the child's `## Closure` and umbrella synthesis `updates/20260706T153500Z-steelthread-closed-synthesis.md`).
      The child delivered the full thread: the artifact model / harness path table / provision plan / install manifest, and `ns skills list/path/install [--dry-run] [--force]` provisioning the real `objective` skill for `pi`/`claude-code`/`codex` at both scopes with a per-file-SHA-256-hashed install manifest, zero `npx skills` dependency, consumed through the `@nseng-ai/ns-init` `RealSkillMaterializer` seam. Every Completion Criterion was independently re-verified against the real system and full `just` is green (main suite 4539, style-guard 120, tsgo, edge sweep `sweep-ok`). Cross-child lesson synthesized in the update above.

- [x] Decide the disposition of each parked-breadth row after the steelthread validates.
      **Done 2026-07-07** in an interactive disposition session: all eight parked rows carry explicit dispositions (two graduate as Subobjectives, one splits into a follow-on row plus child scope, two stay parked with triggers, three retire with rationale). See `updates/20260707T150250Z-parked-breadth-dispositions.md`.

- [x] Create the two graduated Subobjective records with mirrored edges and `[~]` rows here.
      **Done 2026-07-07**: `harness-artifact-vocabulary-reconciliation` and `remote-artifact-module-acquisition` created with mirrored edges; the acquisition child carries version-resolution-for-fetched-modules and restates the trust-gating risk acceptance in its Assumptions and Risks.

- [x] Subobjective `harness-artifact-vocabulary-reconciliation`: the skill-workflow/docs/vocabulary reconciliation sweep plus the bare-"artifact" collision cleanup (edge-tracked).
      **Closed 2026-07-07 as completed**: root `CONTEXT.md` carries the binding harness-artifact vocabulary cluster and Avoid entries; `CONTEXT-MAP.md` reflects harness overlays and the narrowed Skill/agent/resource ambiguity; areg's remaining local-logic push-down row moved into this umbrella's `## Parked` section.

- [~] Subobjective `remote-artifact-module-acquisition`: first-party fetch path for artifact-bearing npm modules via an `ns.toml` declaration list, with per-source update/pinning semantics (edge-tracked). Design-heavy front; in flight; synthesize closure evidence here when it closes.

- [ ] Follow-on: uninstall, stale-after-upgrade detection, and rename cleanup on the landed minimal `ns update` (manifest-enabled; split from the former lifecycle parked row — version resolution moved to the remote-acquisition Subobjective).

## Parked

Deferred breadth from the 2026-07-06 steelthread reshape — widening the validated thread, as follow-on rows here or split-out Subobjectives:

- [ ] Push areg's remaining local logic (invocation-kind apply planning, `check` drift detection, skill find) down into `@nseng-ai/harness-artifacts`. **Trigger:** a second consumer needs that logic at runtime (e.g. `ns` grows a kind/overlay or drift surface). Decided constraints (2026-07-07, see `harness-artifact-vocabulary-reconciliation/updates/20260707T170500Z-two-channel-layered-positioning.md`): no new `areg-core` package — the shared layer already exists as `@nseng-ai/harness-artifacts` (seeded by the earlier areg push-down); areg stays in `tools/` (zero inbound dependents), not `infra/` alongside brmem. Moved here 2026-07-07 at closure of subobjective `harness-artifact-vocabulary-reconciliation`.

- [x] npm-module-bundled artifact provisioning (was "Extension-carried artifact provisioning"; merged with the AREG re-platform row).
      **Graduated 2026-07-06 into the Subobjective `npm-bundled-artifact-provisioning`; synthesized 2026-07-07** (edge-tracked). The child generalized first-party provisioning into static npm-module-bundled harness artifact declarations, landed additive npm-module source/provenance and manifest support in `@nseng-ai/harness-artifacts`, shipped the minimal top-level `ns update` reconcile slice, deliberately removed AREG's `npx skills` wrapping surfaces, and kept AREG as a standalone whole-project inspector with shared-manifest provenance/target-presence awareness. The proving-consumer finding: the shared core did need additive source-model/API changes, but the kernel kept zero artifact knowledge and consumers stayed thin. The retired dispositions still hold: no `npx skills` wrapping/replacement and no `skills-lock.json` / install-manifest convergence. Evidence: `updates/20260706T160000Z-npm-bundled-provisioning-and-areg-inspector-reframe.md` and `updates/20260707T002013Z-npm-bundled-provisioning-closure-synthesis.md`.

- [x] Reconcile with existing skill workflows, docs, and vocabulary.
      **Disposed 2026-07-07: graduated into the Subobjective `harness-artifact-vocabulary-reconciliation`** (edge-tracked; `[~]` row in `## Work`). Compare the new subsystem against `skillx`, the `@nseng-ai/areg` CLI, `npx skills`, repo skill conventions, and harness skill-invocation docs so the new CLI behavior is additive. Includes the bare-"artifact" collision cleanup: handoff artifact and consumer artifact stay owned by their domains; AREG's "managed artifacts" overlay sense is renamed (e.g. "kind overlays").

- [retired] Marketplace or remote catalog discovery.
  **Retired 2026-07-07**: contradicts the record's hard non-goals and has no user while ns is private; adjacent acquisition ambitions were already retired. If the audience widens, open a fresh Objective with real requirements.
- [x] Remote acquisition sources for artifact-bearing modules (npm registry, git, local-path specs).
      **Disposed 2026-07-07: graduated into the Subobjective `remote-artifact-module-acquisition`** (edge-tracked; `[~]` row in `## Work`; user decision). Today modules arrive only by directory presence (committed `.ns/extensions/`, XDG root); vendoring gives pinning for free via git. Design starting point: pi's debugged spec grammar — uniform `npm:pkg@ver` / `git:host/user/repo@ref` / local-path specs (anticipated `ns.toml` `artifact-packages` list, child decision `20260706T194500Z` §6) and its pinning semantics (pinned npm skipped by updates; git refs reconciled, not advanced). See `npm-bundled-artifact-provisioning/updates/20260706T215708Z-pi-update-mechanism-comparison.md`. Carries version-resolution-for-fetched-modules and must restate the trust-gating risk acceptance in its Assumptions and Risks.
- [x] Update/uninstall/version-resolution command surface, stale-after-upgrade detection, and rename cleanup.
      **Disposed 2026-07-07: split.** Uninstall/stale-detection/rename-cleanup became a follow-on row in `## Work` (manifest-enabled slices on the landed `ns update`); version resolution moved to the remote-acquisition Subobjective scope. Pi reference for uninstall (`pi remove` deletes install + settings entry) and for keeping self-update a separate surface from artifact update, per the comparison update above.
- [ ] Drift detection / staleness nudge.
      **Disposed 2026-07-07: stays parked** (user decision) until staleness pain is actually felt, even though the `ns update` precondition landed. `ns update` reconciles only when invoked; pulled module updates run stale until then (known accepted gap, child decision `20260706T194500Z` §7 load-time fingerprint backstop). Pi self-heals at startup (auto-install missing, reinstall on version mismatch) and exposes a non-blocking update check. ns shape: read-only desired-vs-manifest diff (the reconcile pure planner computes it) surfaced as a nudge.
- [retired] Project trust gating for provisioned artifacts.
  **Retired 2026-07-07** (user decision): ns commits to trusted-repo assumptions as the operating contract while private/unreleased. Deliberate risk acceptance — provisioned skill files are prompt-injection payloads by design and remote acquisition is graduating without a consent gate; pi's project-trust model (trust store + `--approve`, refuse project-scoped install/load until trusted) remains the recorded blueprint to reopen as a fresh Objective if the audience widens.
- [retired] Per-resource filtering / enable-disable on top of reconcile.
  **Retired 2026-07-07** (user decision): all-or-nothing provisioning is the contract. The reconcile architecture's desired-state-filter accommodation (child decision `20260706T194500Z` §3) and pi's per-package filter template remain in the design record if a future Objective revisits it.
- [ ] Provisioning the `agent` and `extension-bundle` kinds (modeled in types from day one; skills ship first).
      **Disposed 2026-07-07: stays parked** with an explicit trigger — the first real ns-owned agent definition or provisionable extension bundle. The day-one discriminated-union types mean deferral precludes nothing.
- [retired] Replacing AREG's `npx skills add` acquisition channel for third-party GitHub skills with a first-party fetch-and-vendor path.
  **Retired 2026-07-06** (product decision, see `updates/20260706T160000Z-...`): first-party support provisions only npm-module-bundled artifacts; we do not wrap or replace `npx skills` and do not build first-party GitHub acquisition. Third-party skills are inspected by AREG wherever they land, not acquired by us.
