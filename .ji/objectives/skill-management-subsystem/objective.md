# Reusable Skill Management Subsystem

## Thesis

SDL needs a Pup-inspired harness-artifact management subsystem that can list, locate, preview, and provision bundled harness artifacts — skills, agents, and extension bundles — for the first-party `ji` CLI first, while remaining reusable by other first-party CLIs and SDL extensions.

The first successful slice should be boring, static, and testable: an artifact catalog, harness install-path data, deterministic provision plans, an install manifest with content hashes, and CLI surfaces that make bundled SDL skills visible and installable without each package reimplementing harness-specific filesystem logic.

**Naming (ADR 0024, `rename-sdl-to-ji`):** the surface this Objective designs is ji-named — the `ji` CLI and a `ji skills`-shaped command family; any new package name is `@ji/*`-scoped. Prose says `ji` even though the repo's current binary is still `sdl` until the `ji-core-cutover` landing; build no new sdl-named surface. Existing package names (`@sdl/areg`) keep their current spelling here until the parent's package-scope sweep.

## Scope

This Objective covers the design and implementation path for a reusable harness-artifact subsystem inspired by DataDog/pup. The initial product target is explicitly the first-party `ji` CLI:

- Vocabulary is decided: the domain term is **harness artifact** (kinds `skill`, `agent`, `extension-bundle`); the user-facing CLI surface says **skills**; **provision** is the verb for materializing artifacts into a harness; this domain says **harness**, not "platform". AREG is re-read as the **Artifact Registry**, the advanced surface over the same framework.
- The `ji` CLI can expose and provision SDL-owned harness artifacts (`ji skills list/path/install`, analogous to Pup's `skills list`, `skills path`, and `skills install`, plus deterministic plan/preview).
- Shared implementation owns artifact catalog types, harness specs, scope/path resolution, provision-plan generation, materialization semantics, and an install manifest with per-file content hashes (stale detection after upgrades, refuse-to-clobber of locally edited files without `--force`, rename/uninstall cleanup).
- Entry-kind breadth is decided: the model represents all three kinds from day one; the first slice provisions skills only.
- Extension-carried artifacts are main-line scope: an SDL extension declares its bundled or companion skills statically in its package manifest (`sdl` field in `package.json`), and installing/enabling the extension provisions them through the shared subsystem — without executing extension code during ordinary discovery/help, and without the user needing to know AREG exists.
- The subsystem has zero dependency on the third-party `npx skills` CLI: first-party and extension-carried content is provisioned as a local copy by our own planner.
- A detailed Pup research report is kept as a deliberate Objective reference at `references/pup-skill-management-report.md`; fresh-inspection deltas (no verification/hashing/versioning/manifest/uninstall in pup's skills path, `CLAUDE_CONFIG_DIR` handling, read-only carve-out) are recorded in `updates/`.

## Non-Goals

- No marketplace, remote registry, update resolver, semantic version solver, or dependency graph in the first slice.
- No automatic mutation of vendored third-party skill directories beyond explicit install commands.
- No hidden database or local cache for durable resource definitions; the install manifest is an explicit, inspectable record of what was provisioned.
- No attempt to solve every harness-specific agent/subagent/package format before the core `ji` CLI steel thread works.
- No long-lived compatibility alias plan until the package boundary is deliberately chosen.
- No dynamic or executed catalog contribution: extension-carried catalogs are static manifest data only.
- No replacement of AREG's `npx skills add` acquisition channel for third-party GitHub skills in the first slice; that dependency is tolerated temporarily and shrinks later.

## Completion Criteria

The Objective can close when:

- A canonical package/module boundary exists for reusable harness-artifact catalog and provision-planning logic.
- The `ji` CLI surface can list available built-in artifacts, show where they would provision for supported harnesses/scopes, and provision or deterministically preview provisioning.
- The first supported harness set and path table are documented and tested.
- Artifact entries represent all three kinds (`skill`, `agent`, `extension-bundle`), with skills provisioned first and the others recorded as follow-up boundaries if not implemented.
- Provisioning writes an install manifest with content hashes, and conflict behavior (stale content, locally edited files, renames) is tested.
- An SDL extension can declare bundled skills statically in its package manifest and have them provisioned on install through the shared subsystem, or that slice is explicitly split into a follow-up Objective/roadmap item.
- The system has tests for harness alias resolution, scope/path resolution, provision-plan output, collision/error behavior, and at least one first-party SDL artifact catalog.
- The Pup research report remains checked in under this Objective and is referenced by implementation decisions.
- AREG re-platforming onto the shared core is either implemented or explicitly split into a later Objective/roadmap item coordinated with the active AREG Objectives.

## Assumptions and Risks

Assumptions:

- Pup's strongest transferable idea is a static, explicit, testable artifact catalog plus harness path table, not a marketplace. (Still active; reinforced by fresh inspection.)
- Most provisioning semantics can be shared across the first-party CLIs and SDL extensions even though they live in different package layers within the `ts/` workspace.
- The first user-visible value comes from provisioning existing SDL harness artifacts into supported harness layouts, not from inventing new resource formats.
- Extension-carried catalogs can be declared statically in the extension package manifest without executing extension code during discovery, using the existing `sdl` `package.json` field (`sdl-sdk` extension manifest) as the carrier.
- "Skill" is the ecosystem's converging user-facing word for any passive cross-harness artifact (agents degrade to skills everywhere except Claude Code), so `ji skills` stays discoverable while the domain model uses the broader harness-artifact term.

Risks:

- The package boundary may be awkward if the subsystem must be consumed by several first-party CLIs and extensions with different runtime/layering constraints; a shared core plus thin per-CLI bindings may be needed.
- Resolved: the "skills is too narrow vs resources is too abstract" naming risk is settled by the dual-language decision — user-facing `skills`, domain-term `harness artifact`.
- New: bare "artifact" is already used elsewhere in SDL vocabulary (handoff artifacts in `@sdl/handoff`, consumer artifacts in `docs/platform-and-consumer.md`, and AREG's own "managed artifacts" for invocation-kind overlay files — a direct collision inside the tool being re-read as Artifact Registry). Mitigation: the canonical qualified term is "harness artifact" in docs/types where ambiguity exists, and reconciliation includes renaming AREG's overlay sense (e.g. "kind overlays").
- Installing into user-global assistant directories can be surprising or unsafe unless path preview and project-local scope are obvious; the install manifest and plan/preview surfaces are the mitigations (pup demonstrates the failure mode: unconditional overwrite, orphaned renames, silent staleness).
- Catalog contribution by SDL extensions can become a plugin/registry system if overdesigned; the static-manifest decision keeps the first design data-only.
- Existing `skillx`, the `@sdl/areg` CLI, `npx skills`, and repo skill conventions overlap semantically; AREG re-platforming must be coordinated with the active `migrate-areg-and-ns-skills`, `areg-typescript-port`, and `areg-ts-cli-cleanup` Objectives so it lands as one plan, not competing ones.
- "Install an extension" is not one flow today: Pi extensions install via Pi's own `pi install`, while SDL-CLI extensions are loaded by presence under `.sdl/extensions` with no install command. The provisioning hook point needs a deliberate decision.

## Open Questions

- Final package name: leading candidate `@ji/harness-artifacts`; confirm before the package lands.
- First harness set: current lean is `pi` + `claude-code` first, with the table shape making further harnesses (cursor, codex, opencode, windsurf, gemini) pure data additions; confirm.
- How AREG's `skills-lock.json` and the new install manifest converge on one hash/record format so `areg check`/`doctor` can verify installs made by the casual path.
- The extension-install hook point: a unifying `ji extension install <source>` that places the extension and provisions its declared artifacts in one motion, versus per-surface hooks (Pi-native flow plus a `ji skills sync`-style follow-up).
- Whether `ji skills` needs a plan subcommand or an `install --dry-run`, per local CLI conventions.
