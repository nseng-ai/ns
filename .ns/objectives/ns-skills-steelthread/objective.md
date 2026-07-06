---
edges:
  - objective: skill-management-subsystem
    annotation: Subobjective of that umbrella; this record owns the thread slice while the umbrella coordinates the reusable-subsystem ambition and its deferred breadth.
  - objective: ship-objectives-to-customers
    annotation: Customer Objective shipping is the first external consumer of this thread's `ns skills` provisioning surface, pulling objective skills into customer harness roots.
---

# ns skills Steelthread

## Thesis

Prove the harness-artifact provisioning architecture end-to-end with the thinnest real slice: one real ns-owned skill flows from a static artifact catalog, through the harness path table and a deterministic provision plan, into the `pi`, `claude-code`, and `codex` harness roots via `ns skills list/path/install`, writing an install manifest entry with per-file content hashes — boring, static, testable, and with zero `npx skills` dependency.

This is a **steelthread autoobjective** (see the `objective` skill's patterns reference — the patterns compose): the Subobjective carrying the thread of the `skill-management-subsystem` umbrella, with its roadmap and runner policy deliberately shaped for repeated Objective Runner steps with parent-LM checkpoints between committed slices. The seams between layers are where the surprises live; this thread de-risks catalog → plan → materialization → manifest integration while the design is still cheap to change. Widening is explicitly out of scope: everything beyond the thread is deferred breadth coordinated by the umbrella.

**Naming (ADR 0026 `rename-ji-to-ns`, scope amended by ADR 0028):** the surface is ns-named — the `ns` CLI and a `ns skills`-shaped command family; any new package name is `@nseng-ai/*`-scoped. The cutover has executed on trunk: `ns` is the live binary, repo state lives under `.ns/`, the extension manifest key is `ns`, and workspace packages are `@nseng-ai/*`-scoped. Build no new sdl- or ji-named surface.

## Scope

The design and implementation of the thread only. The reusable-subsystem ambition (Pup-inspired, consumable by other first-party CLIs and ns extensions) shapes the design but does not widen the scope:

- Vocabulary is decided (umbrella update `20260702T035321Z-harness-artifact-vocabulary-and-layering.md`): the domain term is **harness artifact** (kinds `skill`, `agent`, `extension-bundle`); the user-facing CLI surface says **skills**; **provision** is the verb for materializing artifacts into a harness; this domain says **harness**, not "platform". AREG is re-read as the **Artifact Registry**.
- The thread's user-visible surface: the `ns` CLI can list ns-owned harness artifacts, show where they would provision for supported harnesses/scopes, and provision — or deterministically preview provisioning — at least one real ns-owned skill (`ns skills list/path/install`, analogous to Pup's `skills list`, `skills path`, and `skills install`).
- Shared implementation in `@nseng-ai/harness-artifacts` (seeded at `ts/packages/capabilities/harness-artifacts` by pushing down areg's lockfile/mirror/frontmatter convention code; umbrella update `20260706T100934Z-harness-artifacts-package-seeded-by-areg-pushdown.md`) owns only what the thread needs: artifact catalog types, harness specs with aliases and user-vs-project scope (including `CLAUDE_CONFIG_DIR` handling), scope/path resolution, provision-plan generation, materialization as a local copy, and an install manifest with per-file content hashes written on provision. Thread conflict policy is LBYL refuse-to-clobber of locally edited files without `--force`; stale-after-upgrade detection and rename/uninstall cleanup are manifest-enabled follow-ups owned by the umbrella, not thread work.
- Entry-kind breadth is decided: the model represents all three kinds from day one; the thread provisions skills only.
- First harness set is decided: `pi` + `claude-code` + `codex` (matching `@nseng-ai/ns-init`'s `HarnessId` union), with the table shape making further harnesses pure data additions. The first consumer seam — the thread's "one real task" — is `@nseng-ai/ns-init`'s `SkillMaterializer` gateway (umbrella update `20260705T231627Z-areg-rejected-as-customer-path-ns-init-seam.md`).
- The thread has zero dependency on the third-party `npx skills` CLI: first-party content is provisioned as a local copy by our own planner.
- Design orientation, not thread scope: reconcile (declared catalogs vs. install manifest → deterministic provision plan → apply) remains the decided architectural shape (umbrella update `20260702T041140Z-reconcile-primitive-and-sdl-update-hook.md`). The thread implements install as plan-plus-apply over the first-party catalog and must not preclude reconcile generality, but does not implement it.
- The detailed Pup research report is a deliberate reference kept in the umbrella record at `.ns/objectives/skill-management-subsystem/references/pup-skill-management-report.md`; fresh-inspection deltas (no verification/hashing/versioning/manifest/uninstall in pup's skills path, `CLAUDE_CONFIG_DIR` handling, read-only carve-out) are recorded in the umbrella's `updates/`.

## Non-Goals

All deferred breadth is coordinated by the umbrella `skill-management-subsystem` (its `## Parked`), not by this record: extension-carried provisioning, the `ns update` hook and ambient-drift nudges, AREG re-platforming and lockfile/manifest convergence, the skill-workflow/vocabulary reconciliation sweep, stale-after-upgrade detection, rename cleanup, uninstall, provisioning the `agent` and `extension-bundle` kinds, and replacing the `npx skills add` acquisition channel.

Hard non-goals inherited from the umbrella and binding here:

- No marketplace, remote registry, update resolver, semantic version solver, or dependency graph.
- No automatic mutation of vendored third-party skill directories beyond explicit install commands.
- No hidden database or local cache for durable resource definitions; the install manifest is an explicit, inspectable record of what was provisioned.
- No attempt to solve every harness-specific agent/subagent/package format before the core `ns` CLI steelthread works.
- No stubbed layers: the thread must write a real manifest, resolve real harness paths for all three harnesses, and provision a real ns-owned skill consumed by a real seam.

## Completion Criteria

The thread validated end-to-end:

- A canonical package/module boundary exists for reusable harness-artifact catalog and provision-planning logic (seeded as `@nseng-ai/harness-artifacts`).
- One real ns-owned skill completes the thread through the real system: `ns skills list` shows it, `ns skills path` shows where it would provision for `pi`/`claude-code`/`codex` at user and project scope, and `ns skills install` provisions it (with a deterministic preview) as a local copy with zero `npx skills` dependency.
- Provisioning writes the install manifest with per-file content hashes, and refuse-to-clobber of locally edited files without `--force` is tested.
- Artifact entries represent all three kinds (`skill`, `agent`, `extension-bundle`) in the model; only skills provision in the thread.
- The supported harness path table is documented and tested: harness alias resolution, scope/path resolution, provision-plan output, and collision/error behavior against at least one first-party ns artifact catalog.
- The `@nseng-ai/ns-init` `SkillMaterializer` seam (or an equivalent real consumer) consumes the thread.

Deferred breadth does not hold this record open; it lives in the umbrella.

## Definition of Progress

Progress is keepable when:

- It advances the thread — catalog model, harness path table, provision plan, materialization, install manifest, or the `ns skills list/path/install` surface — as a coherent slice with passing tests.
- New behavior lives in `@nseng-ai/harness-artifacts` (or thin `ns` CLI wiring over it), stays consistent with the decided vocabulary (harness artifact / skills / provision / harness), and does not preclude the reconcile architecture.
- Design decisions the slice forces (catalog shape, manifest record format, path-table entries, plan output shape) are recorded as Semantic Updates when they bind later slices.

Do not keep changes that:

- Widen scope into the umbrella's parked breadth (extension-carried provisioning, AREG re-platforming, update/uninstall surfaces, `agent`/`extension-bundle` provisioning, reconciliation sweep).
- Stub a layer the thread exists to validate — fake manifest, fake path resolution, placeholder harness targets, or a mocked-out consumer seam presented as thread completion.
- Add a dependency on the third-party `npx skills` CLI, or mutate vendored third-party skill directories outside explicit install commands.
- Break `just` repo validation or existing `@nseng-ai/areg` / `@nseng-ai/ns-init` behavior.

Useful evidence includes:

- Passing Vitest coverage for path resolution, alias normalization, plan output, and manifest-driven refuse-to-clobber.
- `ns skills` command output (list/path/install preview and apply) against a real ns-owned skill.
- An install manifest written with per-file content hashes, verified in tests.

## Runner Policy

This Objective is execution-friendly for `objective-next` and designed for repeated Objective Runner steps under the boundaries below.

- Direct execution is allowed when: the slice advances an open roadmap row within thread scope, stays inside `ts/packages/capabilities/harness-artifacts`, `ns` CLI wiring for the `ns skills` family, the `@nseng-ai/ns-init` `SkillMaterializer` seam, and their tests/docs, and completes with passing validation.
- Steer or ask first when: a decision would bind consumers beyond the thread (public API shape intended for AREG re-platforming or extension-carried catalogs), conflict with the reconcile orientation, change `@nseng-ai/ns-init`'s gateway contract rather than implement it, require renaming/moving pushed-down substrate modules other consumers import, or resolve the open `plan` subcommand vs `install --dry-run` question — record the question instead of guessing.
- How work may change files and be left: local repository edits only, committed per slice on the working branch (never `main`/`master`); each runner step leaves a clean tree with tests passing; Objective tracking (roadmap statuses, Semantic Updates) is updated when a slice lands meaningful decisions or evidence.
- Validation before keeping work: package tests for touched packages plus repo `just` validation; formatting failures fixed via `just dprint-fix` / TS autofixers, not by hand.
- What will not happen unless explicitly requested: pushing, PR creation/submission, publishing, provisioning into real user-global harness directories outside tests or explicit user-invoked commands, edits to the umbrella record beyond mirrored-edge frontmatter, or any external write-capable action.

## Assumptions and Risks

Assumptions:

- Pup's strongest transferable idea is a static, explicit, testable artifact catalog plus harness path table, not a marketplace. (Reinforced by fresh inspection; see umbrella updates.)
- The first user-visible value comes from provisioning existing ns harness artifacts into supported harness layouts, not from inventing new resource formats.
- "Skill" is the ecosystem's converging user-facing word for any passive cross-harness artifact, so `ns skills` stays discoverable while the domain model uses the broader harness-artifact term.

Risks:

- Breadth creep is the Steelthread pattern's named failure mode and materialized once in the parent record's history (extension-carried provisioning pulled forward 2026-07-02, moved back 2026-07-06). Defend by descoping, not absorbing; anything the thread does not strictly need goes to the umbrella.
- The cardboard-thread failure mode: stubbing the manifest, preview, or a harness target would make the thread validate nothing. The thread must write a real manifest, resolve real harness paths for all three harnesses, and provision a real ns-owned skill consumed by a real seam (`@nseng-ai/ns-init`'s `SkillMaterializer`).
- The `@nseng-ai/harness-artifacts` package boundary is placed (residual risk is API shape, not package placement); a shared core plus thin per-CLI bindings may still be needed as consumers multiply — an umbrella concern the thread must not preclude.
- Installing into user-global assistant directories can be surprising or unsafe unless path preview and project-local scope are obvious; the install manifest and plan/preview surfaces are the mitigations (pup demonstrates the failure mode: unconditional overwrite, orphaned renames, silent staleness).

## Open Questions

None. The preview surface question was resolved as `ns skills install --dry-run`; see update `20260706T131908Z-ns-skills-cli-dry-run-surface-bound.md`.
