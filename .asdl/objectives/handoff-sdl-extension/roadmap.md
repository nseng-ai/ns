# Roadmap

## Work

- [ ] Design and spike SDL nested command-tree routing before implementation.
  - Define how `sdl <group> <leaf>` consumes argv, handles `--help`, reports unknown groups/leaves, and keeps selected leaf loading side-effect-light.
  - Decide group-vs-leaf collision behavior and diagnostics before committing to the manifest schema.
  - Evidence should be a small tested spike or design note that future infrastructure work can implement directly.

- [ ] Add SDL nested extension command-tree infrastructure first.
  - Define the manifest tree shape for groups and executable leaves.
  - Preserve side-effect-light discovery and selected leaf loading.
  - Add the public SDK leaf authoring API, expected to be `defineCommand()` or an equivalent focused helper.
  - Evidence should include generic SDL tests for nested discovery, selected loading, help/lookup behavior, diagnostics, and non-eager-loading.

- [ ] Prototype one Handoff leaf with `sdl handoff list`.
  - Prove the nested extension path with the lowest-risk Handoff command before migrating destructive or authoring flows.
  - Preserve JSON/Markdown output and branch-scope semantics from the existing package contract.
  - Include a non-eager-loading regression that unrelated SDL discovery/help does not import the selected Handoff leaf module.

- [ ] Use Handoff inventory/admin commands as the first full migration slice.
  - Add `sdl handoff list`, `sdl handoff delete`, and `sdl handoff gc` through the new nested extension mechanism.
  - Reuse existing `@asdl/handoff` operation logic where possible instead of forking command behavior.
  - Keep branch, slug, deleted-branch, confirmation, and JSON/Markdown output semantics aligned with the current package contract.

- [ ] Define and implement the deterministic create core.
  - Add `sdl handoff create` as storage over final Markdown from stdin or `--file`.
  - Include branch selection, slug/derived-key policy, overwrite protection, and technical locator output.
  - Keep model/session authoring in Pi commands and skills rather than SDL.

- [ ] Define and implement the portable pickup core.
  - Add `sdl handoff pickup` for mechanical selection, Branch Memory read, artifact content, and metadata output.
  - Keep conversational summary, user-control prompting, and continuation decisions in Pi/skill adapters.

- [ ] Run a standalone `handoff` cutover inventory before removal.
  - Inventory docs, skills, Pi extension calls, package exports, shim installation, tests, and `just install-handoff` / `install-tools` references.
  - Classify each call site as removed, migrated to `sdl handoff ...`, or retained only as shared package internals.

- [ ] Hard-cut over the standalone `handoff` CLI surface after SDL parity.
  - Remove the standalone binary/shim rather than keeping a temporary compatibility command or migration diagnostic.
  - Remove documentation that presents the standalone CLI as the durable public path once `sdl handoff ...` is ready.

- [ ] Edit existing Pi commands and skills in place as adapters.
  - Preserve `/handoff:create`, `/handoff:pickup`, `/handoff:list`, `handoff-create`, and `handoff-pickup` names.
  - Route deterministic storage/list/read/admin work through the new SDL/package core where appropriate.
  - Keep Pi-specific UI/session behavior in Pi, including authoring prompts, pickup summary presentation, and waiting for user direction.

- [ ] Refresh docs, context language, and migration guidance.
  - Update SDL docs for nested extension command trees and selected leaf modules.
  - Update Handoff docs to show `sdl handoff ...` as the portable command core.
  - Update Pi/skill docs to distinguish adapters from the portable core.
  - Explicitly park Pup-inspired skill/Pi-extension resource management as a separate future subsystem.

## Parked

- Pup-inspired reusable skill, agent, and Pi-extension resource management package.
- Installing SDL extension-owned skills or Pi extensions through SDL extension metadata.
- Marketplace, update, uninstall, or version-resolution behavior for agent resources.
- Dynamic arbitrary `/sdl:*` Pi mirrors for all SDL extension commands.
- Automatic continuation execution after picking up a Handoff Artifact.
