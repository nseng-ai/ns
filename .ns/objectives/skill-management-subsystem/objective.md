---
edges:
  - objective: ns-skills-steelthread
    annotation: Subobjective carrying the thread — one real ns-owned skill through `ns skills list/path/install` into the pi/claude-code/codex harness roots with a hashed install manifest; this umbrella coordinates the surrounding ambition and deferred breadth.
  - objective: npm-bundled-artifact-provisioning
    annotation: Subobjective — the first follow-on graduated from parked breadth after the steelthread closure. Generalizes first-party provisioning to any npm-module-bundled harness artifact (extensions are one case) and folds in removing AREG's `npx skills` wrapping, keeping AREG as a standalone whole-project inspector. Merges the former extension-carried-provisioning and AREG-re-platform parked rows.
---

# Reusable Skill Management Subsystem

## Thesis

ns needs a Pup-inspired harness-artifact management subsystem that can list, locate, preview, and provision bundled harness artifacts — skills, agents, and extension bundles — for the first-party `ns` CLI first, while remaining reusable by other first-party CLIs and ns extensions.

This record is an **Umbrella Objective** (see the `objective` skill's patterns reference): it holds the reusable-subsystem ambition, the decided vocabulary and architecture orientation, the Pup research reference, and the deferred breadth, while narrower **Subobjectives** own the execution slices. The first Subobjective is `ns-skills-steelthread` (split out 2026-07-06), which owns the thinnest end-to-end slice: one real ns-owned skill from a static artifact catalog, through the harness path table and a deterministic provision plan, into the `pi`, `claude-code`, and `codex` harness roots via `ns skills list/path/install`, writing an install manifest with per-file content hashes and zero `npx skills` dependency. This umbrella tracks the children, synthesizes cross-child lessons, and decides when parked breadth graduates into follow-on Subobjectives.

**Naming (ADR 0026 `rename-ji-to-ns`, scope amended by ADR 0028):** the surface this Objective designs is ns-named — the `ns` CLI and a `ns skills`-shaped command family; any new package name is `@nseng-ai/*`-scoped. The cutover landing has executed on trunk: `ns` is the live binary (bin of `@nseng-ai/kernel`), repo state lives under `.ns/`, the extension manifest key is `ns`, and workspace packages are `@nseng-ai/*`-scoped (e.g. `@nseng-ai/areg`). ADR 0026 originally planned an `@ns/*` internal scope; ADR 0028 superseded that to bare `@nseng-ai/*`, and no `@ns/*` package names exist. Build no new sdl- or ji-named surface.

## Scope

Coordination of the reusable harness-artifact subsystem ambition:

- Own the durable decisions that bind every child slice. Decided so far: the domain term is **harness artifact** (kinds `skill`, `agent`, `extension-bundle`); the user-facing CLI surface says **skills**; **provision** is the verb for materializing artifacts into a harness; this domain says **harness**, not "platform"; AREG is re-read as the **Artifact Registry**, the advanced surface over the same framework (`updates/20260702T035321Z-harness-artifact-vocabulary-and-layering.md`).
- Own the architecture orientation: reconcile (declared catalogs vs. install manifest → deterministic provision plan → apply) is the decided shape (`updates/20260702T041140Z-reconcile-primitive-and-sdl-update-hook.md`). Children implement slices of it (the steelthread implements install as plan-plus-apply over the first-party catalog) and must not preclude its generality.
- Own the shared package boundary: `@nseng-ai/harness-artifacts` at `ts/packages/capabilities/harness-artifacts`, seeded by pushing down areg's lockfile/mirror/frontmatter convention code (`updates/20260706T100934Z-harness-artifacts-package-seeded-by-areg-pushdown.md`). Cross-consumer API-shape questions (shared core plus thin per-CLI bindings) resolve here as consumers multiply.
- Track Subobjectives via Objective Edges and roadmap `[~]` rows; synthesize their closure evidence and cross-child lessons into this record.
- Decide when parked breadth graduates: each `## Parked` row either widens a validated thread as a follow-on row or splits into its own Subobjective.
- Keep the detailed Pup research report as a deliberate Objective reference at `references/pup-skill-management-report.md`; fresh-inspection deltas (no verification/hashing/versioning/manifest/uninstall in pup's skills path, `CLAUDE_CONFIG_DIR` handling, read-only carve-out) are recorded in `updates/`.

## Non-Goals

Deferred breadth — parked in the roadmap, not abandoned; each item widens a validated thread later or splits into a follow-on Subobjective:

- **Graduated 2026-07-06** into the Subobjective `npm-bundled-artifact-provisioning`: npm-module-bundled artifact provisioning (static `ns` `package.json` declaration on any resolved npm module — first-party packages, extensions, opt-in packages — provisioned on install/enable), with removing AREG's `npx skills` wrapping folded in and AREG kept as a standalone whole-project inspector. This merged the former "extension-carried provisioning" and "AREG re-platform" parked items. See `updates/20260706T160000Z-npm-bundled-provisioning-and-areg-inspector-reframe.md`.
- The `ns update` commanded hook and ambient-drift fingerprint nudges (the reconcile primitive slice lands in the graduated Subobjective; the broad command surface stays parked).
- **Retired 2026-07-06** (same update): wrapping/replacing `npx skills` and any first-party GitHub-acquisition path. First-party support provisions only npm-module-bundled artifacts; the former "`skills-lock.json` / install-manifest convergence on one record format" ambition is dropped — AREG's inspector reads both records as complementary sources rather than merging them.
- The skill-workflow/vocabulary reconciliation sweep (`skillx`, `@nseng-ai/areg`, `npx skills`, repo skill conventions), including the bare-"artifact" collision cleanup.
- Stale-after-upgrade detection, rename cleanup, and uninstall — manifest-enabled, not thread work.

Hard non-goals:

- No marketplace, remote registry, update resolver, semantic version solver, or dependency graph in the first slice.
- No automatic mutation of vendored third-party skill directories beyond explicit install commands.
- No hidden database or local cache for durable resource definitions; the install manifest is an explicit, inspectable record of what was provisioned.
- No attempt to solve every harness-specific agent/subagent/package format before the core `ns` CLI steelthread works.
- No dynamic or executed catalog contribution: extension-carried catalogs are static manifest data only.
- No replacement of AREG's `npx skills add` acquisition channel for third-party GitHub skills in the first slice; that dependency is tolerated temporarily and shrinks later.
- The umbrella does not duplicate its children's execution tracking: thread-level rows, evidence, and closure gates live in the Subobjective records.

## Completion Criteria

This Umbrella closes when its Subobjectives are closed or explicitly parked and their outcomes synthesized here:

- The `ns-skills-steelthread` Subobjective is closed with the thread validated end-to-end (its own Closure Gate).
- Each parked-breadth row has an explicit disposition: implemented as a follow-on slice, split into its own Subobjective (tracked via an Objective Edge), or deliberately retired with rationale.
- Cross-child lessons and closure evidence are synthesized into this record (Semantic Updates and `## Closure` prose), so the reusable-subsystem ambition has one durable narrative home.
- The Pup research report remains checked in under this Objective and is referenced by implementation decisions.

## Assumptions and Risks

Assumptions:

- Pup's strongest transferable idea is a static, explicit, testable artifact catalog plus harness path table, not a marketplace. (Still active; reinforced by fresh inspection.)
- Most provisioning semantics can be shared across the first-party CLIs and ns extensions even though they live in different package layers within the `ts/` workspace.
- The first user-visible value comes from provisioning existing ns harness artifacts into supported harness layouts, not from inventing new resource formats.
- Extension-carried catalogs can be declared statically in the extension package manifest without executing extension code during discovery, using the existing `ns` `package.json` field (the kernel extension manifest, parsed by `@nseng-ai/kernel` discovery) as the carrier.
- "Skill" is the ecosystem's converging user-facing word for any passive cross-harness artifact (agents degrade to skills everywhere except Claude Code), so `ns skills` stays discoverable while the domain model uses the broader harness-artifact term.

Risks:

- The **fire-and-forget umbrella** is this pattern's named failure mode: a parent that only spawns children and stops tracking. Defend by keeping the `[~]` child rows current and synthesizing child outcomes back into this record.
- Breadth creep materialized once in this record's own history: extension-carried provisioning was pulled forward from parked into main-line scope (2026-07-02) before the 2026-07-06 steelthread reshape moved it back; the thread then split into `ns-skills-steelthread` the same day. Defend by descoping into parked rows or new Subobjectives, not by absorbing breadth into an in-flight thread.
- The package boundary may be awkward if the subsystem must be consumed by several first-party CLIs and extensions with different runtime/layering constraints; a shared core plus thin per-CLI bindings may be needed. Partially de-risked: `@nseng-ai/harness-artifacts` is seeded at `ts/packages/capabilities/harness-artifacts`, so the residual risk is API shape, not package placement.
- Resolved: the "skills is too narrow vs resources is too abstract" naming risk is settled by the dual-language decision — user-facing `skills`, domain-term `harness artifact`.
- Bare "artifact" is already used elsewhere in ns vocabulary (handoff artifacts in `@nseng-ai/handoffs`, consumer artifacts in `docs/conventions/platform-and-consumer.md`, and AREG's own "managed artifacts" for invocation-kind overlay files — a direct collision inside the tool being re-read as Artifact Registry; the term is still live in `@nseng-ai/areg`'s skill-kind operations). Mitigation: the canonical qualified term is "harness artifact" in docs/types where ambiguity exists, and reconciliation includes renaming AREG's overlay sense (e.g. "kind overlays").
- Installing into user-global assistant directories can be surprising or unsafe unless path preview and project-local scope are obvious; the install manifest and plan/preview surfaces are the mitigations (pup demonstrates the failure mode: unconditional overwrite, orphaned renames, silent staleness).
- Catalog contribution by ns extensions can become a plugin/registry system if overdesigned; the static-manifest decision keeps the first design data-only.
- Existing `skillx`, the `@nseng-ai/areg` CLI, `npx skills`, and repo skill conventions overlap semantically. The prior AREG migration Objectives (`migrate-areg-and-ns-skills`, `areg-typescript-port`, `areg-ts-cli-cleanup`) have all closed, so re-platforming no longer competes with active migration plans; the remaining coordination surface is the landed `@nseng-ai/areg` codebase itself (its `npx skills` gateway and `skills-lock.json` operations), which must be reconciled deliberately rather than forked around.
- Addressed by decision (see `updates/20260702T041140Z-reconcile-primitive-and-sdl-update-hook.md`): "install an extension" is not one flow today (Pi-native install vs presence under `.ns/extensions`), but the reconcile-primitive architecture makes convergence independent of which path an extension arrived through — commanded hooks apply, ambient detection nudges.

## Open Questions

- Resolved 2026-07-06 (`updates/20260706T160000Z-...`): `skills-lock.json` and the install manifest do **not** converge on one record format — that ambition is retired with the npx-wrapping decision. They remain complementary records that AREG's inspector reads independently.
- Where the `ns update` command surface lives — kernel/extension-lifecycle vs. this subsystem (now carried by the `npm-bundled-artifact-provisioning` Subobjective; it ships the reconcile/provision slice either way).
- Which remaining parked rows become Subobjectives vs. follow-on rows (the first follow-on graduated as `npm-bundled-artifact-provisioning`; the reconciliation sweep and the manifest-enabled update/uninstall surfaces are still to be disposed).
