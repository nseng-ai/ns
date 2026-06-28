# Roadmap

## Work

- [x] Inventory Handoff surfaces, consumers, and storage-sensitive semantics. (Evidence: updates/2026-06-27T230253Z-handoff-surface-inventory-baseline.md)
  - Policy: direct execution after preview.
  - Guidance: inspect `ts/packages/handoff/**`, `ts/packages/hosts/pi/src/handoff/**`, Handoff-related Pi tests, `.pi` adapters, handoff skills/prompts, install/shim references, docs, and import surfaces. Record current standalone CLI behavior, Pi command names, Branch Memory namespace/key/branch semantics, create/pickup authoring boundaries, list/delete/gc contracts, and all call sites that would be affected by `sdl handoff ...` parity or standalone CLI removal.
  - Evidence: an Objective update or durable roadmap note names the exact current surfaces and compatibility constraints, with source searches for `handoff`, `/handoff:`, `@sdl/handoff`, and standalone binary references.

- [x] Prove the SDL nested command-tree contract needed by Handoff. (Evidence: updates/2026-06-27T232531Z-sdl-handoff-group-contract.md)
  - Policy: direct execution after preview using the Runner Policy defaults; stop only before public SDL SDK author API changes, aliases, or a new manifest schema beyond existing grouped-command mechanics.
  - Guidance: represent Handoff as grouped SDL commands with `sdl.group: "handoff"` and leaves `list`, `delete`, `gc`, `create`, and `pickup` unless implementation evidence proves that existing grouped-command mechanics are insufficient. Keep discovery/help side-effect-light, load only the selected leaf, diagnose group/leaf collisions, and prefer internal SDL command infrastructure fixes over public SDK expansion.
  - Evidence: grouped Handoff-shaped extension tests now cover package-level `sdl.group`, selected leaf loading, help/schema routing, unknown leaf diagnostics, group/leaf collision rejection, and non-eager-loading.

- [~] Establish `@sdl/handoff/api` and gateway-injected Handoff Domain Core seams. (Admin-core evidence: updates/2026-06-27T233608Z-handoff-api-admin-core.md)
  - Policy: direct execution after preview for additive API/core slices; stop before changing storage semantics or exposing Pi/session presentation in the API.
  - Guidance: start from concrete consumers: SDL command leaves and Pi adapters. Expected API/Core candidates include identity/slug helpers, summaries, technical locators, list/read/create/delete/gc operations, selection helpers, and gateway-injected request/result types. Keep Pi UI/session continuation out of the API.
  - Evidence: `@sdl/handoff/api` now exports identity, summaries, storage/admin functions, and deleted-branch GC planning/execution with fake-backed tests. Remaining API/core work should extend the seam for create and pickup/read when those leaves are implemented.

- [~] Migrate Handoff inventory/admin commands to `sdl handoff list`, `sdl handoff delete`, and `sdl handoff gc`. (Admin-leaf evidence: updates/2026-06-27T234932Z-sdl-handoff-admin-leaves.md)
  - Policy: direct execution after preview for implementation and tests; ask before running real delete/gc against real Branch Memory as validation.
  - Guidance: these are the lowest-risk leaves because `@sdl/handoff` already owns standalone list/delete/gc operations. Preserve JSON/Markdown output intent, branch/all-branches/deleted-branch behavior, confirmation and dry-run/force semantics, and technical locator evidence.
  - Evidence: grouped SDL `handoff` extension leaves now exist for `list`, `delete`, and `gc`, with SDL scenario tests over fake Branch Memory/Git and shared Handoff-owned schemas/renderers/core. Remaining parity evidence includes the `-y`/`-f` short-alias gap in SDL contributed commands and broader call-site/cutover inventory.

- [x] Implement deterministic `sdl handoff create`. (Evidence: updates/2026-06-28T005922Z-deterministic-sdl-handoff-create.md)
  - Policy: direct execution after preview using the Runner Policy defaults; stop before adding content-derived/model-derived slugging or overwrite behavior.
  - Guidance: SDL create should store final Markdown supplied through stdin or `--file`; require an explicit validated `--slug`, default to the current branch with optional `--branch`, refuse overwrite by default, and return technical locator evidence. Pi/skills remain responsible for composing the final Markdown artifact from session context and deriving content-based slugs.
  - Evidence: fake-backed storage tests, SDL command scenarios for stdin/file/missing slug/existing key/branch failures, and Pi/skill docs updated away from raw Branch Memory recipes where possible.

- [ ] Implement mechanical `sdl handoff pickup`.
  - Policy: direct execution after preview using the Runner Policy defaults; stop before adding automatic continuation, launch behavior, or conversational summarization.
  - Guidance: SDL pickup should select/read an artifact and return artifact content plus Handoff Summary / Handoff Technical Locator metadata suitable for Pi/skill presentation. Exact slug selection and current/explicit branch selection are enough for the first portable command; ambiguous/fuzzy selection can remain in Pi unless a deterministic Handoff API helper is already present.
  - Evidence: fake-backed read/selection tests, SDL command scenarios, and Pi adapter tests showing presentation/continuation remains in Pi.

- [ ] Align Pi Handoff adapters and skills over the Handoff API / SDL command core.
  - Policy: direct execution after preview for one adapter family at a time; steer first before changing public Pi command names or continuation UX.
  - Guidance: preserve `/handoff:create`, `/handoff:pickup`, `/handoff:list`, handoff tab/self tools, and Claude handoff helpers. Move deterministic storage/list/read/admin behavior to Handoff-owned core/API or SDL leaves; leave authoring prompts, UI notifications, picker presentation, tab launch, self replacement, and user-control prompts in Pi/skills.
  - Evidence: Pi adapter tests, skill/prompt diffs, and source searches showing Pi no longer owns Handoff domain decisions or embeds stale Branch Memory recipes where Handoff core now exists.

- [ ] Run standalone `handoff` cutover inventory and remove the standalone CLI after SDL parity.
  - Policy: direct execution after preview once the preview names parity evidence, call-site inventory, docs/test updates, and rollback/stop conditions; stop only if an unclassified call site still requires the old binary.
  - Guidance: classify every standalone `handoff` binary/shim/doc/test/skill/adapter reference as migrated, removed, or retained only as package-internal implementation. Once parity is proven, remove the binary/shim and durable public docs for the standalone CLI rather than leaving a long-lived compatibility surface.
  - Evidence: call-site inventory, package metadata diff, removed shim/install references, updated docs, and tests proving `sdl handoff ...` covers the public lifecycle.

- [ ] Refresh Handoff, SDL, Pi, context, and parent Objective documentation.
  - Policy: direct execution after preview; steer first before introducing new canonical terminology beyond the ADR 0009/0012/0016 vocabulary.
  - Guidance: document Handoff as a Capability with a Command Face, Domain Core, and Capability API; distinguish Branch Memory technical storage from the Handoff Artifact user model; explain Pi/skill adapter boundaries; and update `sdl-extension-architecture` when Handoff is spawned, materially advanced, or completed.
  - Evidence: context/docs diffs, parent Objective update when appropriate, and stale-term searches for old nested-command or standalone-CLI wording.

## Parked

- Dynamic arbitrary `/sdl:*` Pi mirrors for all SDL extension commands.
- Extension-owned skill, prompt, or Pi-extension installation/update/marketplace behavior.
- Automatic continuation execution after picking up a Handoff Artifact.
- Changes to Handoff Branch Memory namespace, key shape, storage layout, or artifact schema.
- Migrating unrelated capabilities or converting CCC itself as part of the Handoff child Objective.
