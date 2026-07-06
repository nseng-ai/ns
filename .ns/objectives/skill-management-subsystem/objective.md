---
edges:
  - objective: ship-objectives-to-customers
    annotation: Customer Objective shipping is the first external consumer of the `ns skills` provisioning surface, pulling objective skills into customer harness roots.
---

# Reusable Skill Management Subsystem

## Thesis

ns needs a Pup-inspired harness-artifact management subsystem that can list, locate, preview, and provision bundled harness artifacts — skills, agents, and extension bundles — for the first-party `ns` CLI first, while remaining reusable by other first-party CLIs and ns extensions.

This record is deliberately shaped as a **Steelthread Objective** (see the `objective` skill's patterns reference): its scope is the thinnest end-to-end slice of that ambition, with widening explicitly deferred. The thread: one real ns-owned skill goes from a static artifact catalog, through the harness path table and a deterministic provision plan, into the `pi`, `claude-code`, and `codex` harness roots via `ns skills list/path/install`, writing an install manifest entry with per-file content hashes — boring, static, testable, and with zero `npx skills` dependency. Everything beyond the thread — extension-carried provisioning, AREG re-platforming, reconcile generality, update/uninstall surfaces — is deferred breadth, parked in the roadmap or split to follow-on Objectives.

**Naming (ADR 0026 `rename-ji-to-ns`, scope amended by ADR 0028):** the surface this Objective designs is ns-named — the `ns` CLI and a `ns skills`-shaped command family; any new package name is `@nseng-ai/*`-scoped. The cutover landing has executed on trunk: `ns` is the live binary (bin of `@nseng-ai/kernel`), repo state lives under `.ns/`, the extension manifest key is `ns`, and workspace packages are `@nseng-ai/*`-scoped (e.g. `@nseng-ai/areg`). ADR 0026 originally planned an `@ns/*` internal scope; ADR 0028 superseded that to bare `@nseng-ai/*`, and no `@ns/*` package names exist. Build no new sdl- or ji-named surface.

## Scope

This Objective covers the design and implementation of the steelthread only. The reusable-subsystem ambition (Pup-inspired, consumable by other first-party CLIs and ns extensions) shapes the design but does not widen the scope:

- Vocabulary is decided: the domain term is **harness artifact** (kinds `skill`, `agent`, `extension-bundle`); the user-facing CLI surface says **skills**; **provision** is the verb for materializing artifacts into a harness; this domain says **harness**, not "platform". AREG is re-read as the **Artifact Registry**, the advanced surface over the same framework.
- The thread's user-visible surface: the `ns` CLI can list ns-owned harness artifacts, show where they would provision for supported harnesses/scopes, and provision — or deterministically preview provisioning — at least one real ns-owned skill (`ns skills list/path/install`, analogous to Pup's `skills list`, `skills path`, and `skills install`).
- Shared implementation in `@nseng-ai/harness-artifacts` owns only what the thread needs: artifact catalog types, harness specs with aliases and user-vs-project scope (including `CLAUDE_CONFIG_DIR` handling), scope/path resolution, provision-plan generation, materialization as a local copy, and an install manifest with per-file content hashes written on provision. Thread conflict policy is LBYL refuse-to-clobber of locally edited files without `--force`; stale-after-upgrade detection and rename/uninstall cleanup are manifest-enabled follow-ups, not thread work.
- Entry-kind breadth is decided: the model represents all three kinds from day one; the thread provisions skills only.
- First harness set is decided: `pi` + `claude-code` + `codex` (matching `@nseng-ai/ns-init`'s `HarnessId` union), with the table shape making further harnesses pure data additions. The first consumer seam — the thread's "one real task" — is `@nseng-ai/ns-init`'s `SkillMaterializer` gateway.
- The subsystem has zero dependency on the third-party `npx skills` CLI: first-party content is provisioned as a local copy by our own planner.
- Design orientation, not thread scope: reconcile (declared catalogs vs. install manifest → deterministic provision plan → apply) remains the decided architectural shape (see `updates/20260702T041140Z-reconcile-primitive-and-sdl-update-hook.md`). The thread implements install as plan-plus-apply over the first-party catalog and must not preclude reconcile generality, but does not implement it — extension-declared catalogs, the `ns update` hook, and ambient-drift fingerprint nudges are deferred breadth.
- A detailed Pup research report is kept as a deliberate Objective reference at `references/pup-skill-management-report.md`; fresh-inspection deltas (no verification/hashing/versioning/manifest/uninstall in pup's skills path, `CLAUDE_CONFIG_DIR` handling, read-only carve-out) are recorded in `updates/`.

## Non-Goals

Deferred breadth — parked in the roadmap, not abandoned; each item widens the validated thread later or splits into a follow-on Objective:

- Extension-carried artifact provisioning (static manifest declaration via the `ns` field in `package.json`, provisioned on extension install/enable).
- The `ns update` commanded hook and ambient-drift fingerprint nudges.
- AREG re-platforming onto the shared core, including `skills-lock.json` / install-manifest convergence on one hash/record format.
- The skill-workflow/vocabulary reconciliation sweep (`skillx`, `@nseng-ai/areg`, `npx skills`, repo skill conventions), including the bare-"artifact" collision cleanup.
- Stale-after-upgrade detection, rename cleanup, and uninstall — manifest-enabled, not thread work.

Hard non-goals:

- No marketplace, remote registry, update resolver, semantic version solver, or dependency graph in the first slice.
- No automatic mutation of vendored third-party skill directories beyond explicit install commands.
- No hidden database or local cache for durable resource definitions; the install manifest is an explicit, inspectable record of what was provisioned.
- No attempt to solve every harness-specific agent/subagent/package format before the core `ns` CLI steelthread works.
- No dynamic or executed catalog contribution: extension-carried catalogs are static manifest data only.
- No replacement of AREG's `npx skills add` acquisition channel for third-party GitHub skills in the first slice; that dependency is tolerated temporarily and shrinks later.

## Completion Criteria

This is a Steelthread Objective: it closes when the thread is validated end-to-end. Deferred breadth stays in `## Parked` or splits into follow-on Objectives — widening does not hold this record open.

The Objective can close when:

- A canonical package/module boundary exists for reusable harness-artifact catalog and provision-planning logic (seeded as `@nseng-ai/harness-artifacts`).
- One real ns-owned skill completes the thread through the real system: `ns skills list` shows it, `ns skills path` shows where it would provision for `pi`/`claude-code`/`codex` at user and project scope, and `ns skills install` provisions it (with a deterministic preview) as a local copy with zero `npx skills` dependency.
- Provisioning writes the install manifest with per-file content hashes, and refuse-to-clobber of locally edited files without `--force` is tested.
- Artifact entries represent all three kinds (`skill`, `agent`, `extension-bundle`) in the model; only skills provision in the thread.
- The supported harness path table is documented and tested: harness alias resolution, scope/path resolution, provision-plan output, and collision/error behavior against at least one first-party ns artifact catalog.
- The Pup research report remains checked in under this Objective and is referenced by implementation decisions.
- Extension-carried provisioning, AREG re-platforming, and the reconciliation sweep are recorded as parked or split into follow-on Objectives, not implemented here.

## Assumptions and Risks

Assumptions:

- Pup's strongest transferable idea is a static, explicit, testable artifact catalog plus harness path table, not a marketplace. (Still active; reinforced by fresh inspection.)
- Most provisioning semantics can be shared across the first-party CLIs and ns extensions even though they live in different package layers within the `ts/` workspace.
- The first user-visible value comes from provisioning existing ns harness artifacts into supported harness layouts, not from inventing new resource formats.
- Extension-carried catalogs can be declared statically in the extension package manifest without executing extension code during discovery, using the existing `ns` `package.json` field (the kernel extension manifest, parsed by `@nseng-ai/kernel` discovery) as the carrier.
- "Skill" is the ecosystem's converging user-facing word for any passive cross-harness artifact (agents degrade to skills everywhere except Claude Code), so `ns skills` stays discoverable while the domain model uses the broader harness-artifact term.

Risks:

- Breadth creep is the Steelthread pattern's named failure mode and has already materialized once in this record: extension-carried provisioning was pulled forward from parked into main-line scope (2026-07-02) before the 2026-07-06 steelthread reshape moved it back. Defend by descoping, not absorbing; anything the thread does not strictly need goes to `## Parked`.
- The cardboard-thread failure mode: stubbing the manifest, preview, or a harness target would make the thread validate nothing. The thread must write a real manifest, resolve real harness paths for all three harnesses, and provision a real ns-owned skill consumed by a real seam (`@nseng-ai/ns-init`'s `SkillMaterializer`).
- The package boundary may be awkward if the subsystem must be consumed by several first-party CLIs and extensions with different runtime/layering constraints; a shared core plus thin per-CLI bindings may be needed. Partially de-risked: `@nseng-ai/harness-artifacts` is seeded at `ts/packages/capabilities/harness-artifacts`, so the residual risk is API shape, not package placement.
- Resolved: the "skills is too narrow vs resources is too abstract" naming risk is settled by the dual-language decision — user-facing `skills`, domain-term `harness artifact`.
- Bare "artifact" is already used elsewhere in ns vocabulary (handoff artifacts in `@nseng-ai/handoffs`, consumer artifacts in `docs/conventions/platform-and-consumer.md`, and AREG's own "managed artifacts" for invocation-kind overlay files — a direct collision inside the tool being re-read as Artifact Registry; the term is still live in `@nseng-ai/areg`'s skill-kind operations). Mitigation: the canonical qualified term is "harness artifact" in docs/types where ambiguity exists, and reconciliation includes renaming AREG's overlay sense (e.g. "kind overlays").
- Installing into user-global assistant directories can be surprising or unsafe unless path preview and project-local scope are obvious; the install manifest and plan/preview surfaces are the mitigations (pup demonstrates the failure mode: unconditional overwrite, orphaned renames, silent staleness).
- Catalog contribution by ns extensions can become a plugin/registry system if overdesigned; the static-manifest decision keeps the first design data-only.
- Existing `skillx`, the `@nseng-ai/areg` CLI, `npx skills`, and repo skill conventions overlap semantically. The prior AREG migration Objectives (`migrate-areg-and-ns-skills`, `areg-typescript-port`, `areg-ts-cli-cleanup`) have all closed, so re-platforming no longer competes with active migration plans; the remaining coordination surface is the landed `@nseng-ai/areg` codebase itself (its `npx skills` gateway and `skills-lock.json` operations), which must be reconciled deliberately rather than forked around.
- Addressed by decision (see `updates/20260702T041140Z-reconcile-primitive-and-sdl-update-hook.md`): "install an extension" is not one flow today (Pi-native install vs presence under `.ns/extensions`), but the reconcile-primitive architecture makes convergence independent of which path an extension arrived through — commanded hooks apply, ambient detection nudges.

## Open Questions

- Whether `ns skills` needs a plan subcommand or an `install --dry-run`, per local CLI conventions.
- Moved to deferred breadth with their parked rows (no longer this record's thread questions): how `skills-lock.json` and the install manifest converge on one hash/record format, and where the `ns update` command surface lives.
