# Roadmap

## Work

- [ ] Inventory Handoff surfaces, consumers, and storage-sensitive semantics.
  - Policy: direct execution after preview.
  - Guidance: inspect `ts/packages/handoff/**`, `ts/packages/hosts/pi/src/handoff/**`, Handoff-related Pi tests, `.pi` adapters, handoff skills/prompts, install/shim references, docs, and import surfaces. Record current standalone CLI behavior, Pi command names, Branch Memory namespace/key/branch semantics, create/pickup authoring boundaries, list/delete/gc contracts, and all call sites that would be affected by `sdl handoff ...` parity or standalone CLI removal.
  - Evidence: an Objective update or durable roadmap note names the exact current surfaces and compatibility constraints, with source searches for `handoff`, `/handoff:`, `@sdl/handoff`, and standalone binary references.

- [ ] Design the SDL nested command-tree contract needed by Handoff.
  - Policy: steer first before finalizing manifest/schema shape, public SDK helper names, command lookup/help behavior, or compatibility aliases.
  - Guidance: define how `sdl handoff <leaf>` is represented in extension metadata, how discovery/help stays side-effect-light, how selected leaves load, how group/leaf collisions are diagnosed, and what authoring helper (for example, `defineCommand()`) belongs in `sdl-sdk` versus internal SDL command infrastructure.
  - Evidence: ADR/docs/test-plan or implementation notes plus targeted SDL tests for nested discovery, selected loading, help/unknown diagnostics, and non-eager-loading.

- [ ] Establish `@sdl/handoff/api` and gateway-injected Handoff Domain Core seams.
  - Policy: direct execution after preview for additive API/core slices; steer first before freezing broad API contracts or changing storage semantics.
  - Guidance: start from concrete consumers: SDL command leaves and Pi adapters. Expected API/Core candidates include identity/slug helpers, summaries, technical locators, list/read/create/delete/gc operations, selection helpers, and gateway-injected request/result types. Keep Pi UI/session continuation out of the API.
  - Evidence: package export-map diff, fake-backed tests for core behavior, and import-boundary searches showing consumers use `@sdl/handoff/api` rather than package roots, identity-only subpaths for domain decisions, or Pi-local copies.

- [ ] Migrate Handoff inventory/admin commands to `sdl handoff list`, `sdl handoff delete`, and `sdl handoff gc`.
  - Policy: direct execution after preview for implementation and tests; ask before running real delete/gc against real Branch Memory as validation.
  - Guidance: these are the lowest-risk leaves because `@sdl/handoff` already owns standalone list/delete/gc operations. Preserve JSON/Markdown output intent, branch/all-branches/deleted-branch behavior, confirmation and dry-run/force semantics, and technical locator evidence.
  - Evidence: SDL command scenario tests, Handoff operation tests, non-eager-loading regression, and compatibility searches showing no duplicate command-local implementation remains.

- [ ] Define and implement deterministic `sdl handoff create`.
  - Policy: steer first for slug derivation and overwrite policy; direct execution after those decisions for implementation/tests.
  - Guidance: SDL create should store final Markdown supplied through stdin or `--file`; it should validate branch/slug/key/overwrite policy and return technical locator evidence. Pi/skills remain responsible for composing the final Markdown artifact from session context.
  - Evidence: fake-backed storage tests, SDL command scenarios for stdin/file/overwrite/branch failures, and Pi/skill docs updated away from raw Branch Memory recipes where possible.

- [ ] Define and implement mechanical `sdl handoff pickup`.
  - Policy: steer first for structured output and selection behavior; direct execution after those decisions for implementation/tests.
  - Guidance: SDL pickup should select/read an artifact and return content plus metadata suitable for Pi/skill presentation. It must not automatically continue work, launch tabs, replace sessions, or summarize conversationally.
  - Evidence: fake-backed read/selection tests, SDL command scenarios, and Pi adapter tests showing presentation/continuation remains in Pi.

- [ ] Align Pi Handoff adapters and skills over the Handoff API / SDL command core.
  - Policy: direct execution after preview for one adapter family at a time; steer first before changing public Pi command names or continuation UX.
  - Guidance: preserve `/handoff:create`, `/handoff:pickup`, `/handoff:list`, handoff tab/self tools, and Claude handoff helpers. Move deterministic storage/list/read/admin behavior to Handoff-owned core/API or SDL leaves; leave authoring prompts, UI notifications, picker presentation, tab launch, self replacement, and user-control prompts in Pi/skills.
  - Evidence: Pi adapter tests, skill/prompt diffs, and source searches showing Pi no longer owns Handoff domain decisions or embeds stale Branch Memory recipes where Handoff core now exists.

- [ ] Run standalone `handoff` cutover inventory and remove the standalone CLI after SDL parity.
  - Policy: steer first before removal unless parity evidence and call-site inventory are already explicit in the preview.
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
