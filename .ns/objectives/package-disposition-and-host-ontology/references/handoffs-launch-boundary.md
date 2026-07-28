# Handoffs Harness-Independent API and Pi Launch Boundary

## Status and scope

This is the settled design for the Handoffs portion of the deferred Pi extraction. It resolves the Handoffs launch-integration design item in `references/implementation-stack.md` and governs stack orders 5, 9, 21, and 24.

The decision is intentionally narrower than implementation: it does not move files, create `@nseng-ai/pi-ns-handoffs`, change package identities, or authorize publication. It identifies the exact ownership seams and extraction order needed for those changes.

## Decision

`@nseng-ai/handoffs/api` remains the harness-independent interface for Handoff Artifact identity, storage, selection, and lifecycle behavior. It does **not** expose the current `HandoffPromptCreateIntegration`, Pi tool definitions, Pi command contexts, prompt-delivery orchestration, or session-launch behavior.

The current `src/pi/handoff-launch.ts` interface is a Pi host-adapter interface, not a Handoff domain interface. During extraction it moves with the rest of the Pi surface to `@nseng-ai/pi-ns-handoffs`, which exposes a deliberate `./handoff-launch` adapter subpath. `@nseng-ai/pi-ns-herdr` may consume that declared adapter subpath. This is the concrete case for the implementation stack's settled adapter-to-adapter rule; it must be recorded in the planned superseding ADR before the structural guard is enabled.

Herdr's hidden `ns herdr exec handoff-tab launch` command continues to consume `@nseng-ai/handoffs/api` directly for durable-reference parsing and artifact verification. Herdr owns destination creation, labeling, and process launch. The Pi-to-Pi composition used to create the artifact and continue into Herdr belongs between the two host adapters, not in either ns extension package API.

## Ownership matrix

| Concern                                                                  | Owner after extraction                                                    | Evidence in the current tree                                                                                                                |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Handoff slug/key validation and conversion                               | `@nseng-ai/handoffs/api`                                                  | `src/core/identity.ts`, exported by `src/api/index.ts`                                                                                      |
| Artifact existence/read/create/delete/list/GC behavior                   | `@nseng-ai/handoffs/api`                                                  | `src/core/artifact-storage.ts` and `src/core/gc-core.ts`, exported by `src/api/index.ts`                                                    |
| Handoff command-backed skill metadata needed by Skill Exposure           | `@nseng-ai/handoffs/api`                                                  | Currently `src/pi/command-backed-skills.ts`; its data depends only on Foundation command metadata and stable command names                  |
| Handoff create/pickup/list/self Pi command registration and presentation | `@nseng-ai/pi-ns-handoffs`                                                | Current `src/pi/registration.ts`, `create.ts`, `pickup-list.ts`, `self.ts`                                                                  |
| Content-derived slug Pi tool registration and status                     | `@nseng-ai/pi-ns-handoffs`                                                | Current `src/pi/handoff-launch.ts`, `content-slug.ts`, `ui-status.ts`                                                                       |
| Model-facing create-then-launch prompt construction and delivery         | `@nseng-ai/pi-ns-handoffs`                                                | Current `src/pi/launch-flow.ts` depends on Pi `ExtensionAPI`, command/tool contexts, skill expansion, session metadata, and UI notification |
| Generic Pi adapter composition contract used by Herdr                    | `@nseng-ai/pi-ns-handoffs/handoff-launch`                                 | Current `HandoffPromptCreateIntegration` and `createHandoffLaunchIntegration` in `src/pi/handoff-launch.ts`                                 |
| Herdr preflight data and launch command customization                    | `@nseng-ai/pi-ns-herdr`                                                   | Current `herdr/src/pi/handoff-tab.ts` supplies workspace/model/thinking/cwd requirements and the Herdr command                              |
| Durable-reference verification before Herdr mutation                     | `@nseng-ai/pi-ns-herdr` over `@nseng-ai/handoffs/api`                     | Current `herdr/src/ns/commands/handoff-tab-launch.ts` already imports `checkHandoffArtifact` and `parseFlatHandoffSlug` from `/api`         |
| Herdr tab creation, label, and pickup process launch                     | `@nseng-ai/herdr` domain/ns surfaces, composed by `@nseng-ai/pi-ns-herdr` | Current Herdr command and gateway flow                                                                                                      |

## Why launch planning does not enter the extension API

The current launch helpers are not a hidden harness-independent module waiting to be exported:

- `prepareHandoffCreateLaunch` accepts Pi `ExtensionAPI` and `CommandContext`, resolves interactive focus through Pi UI, loads a Pi-expanded skill block, and emits Pi notifications.
- `runHandoffCreateCommand` waits on Pi, derives Pi session investigation metadata, and sends a follow-up user message.
- `buildHandoffLaunchTool` and `verifyHandoffLaunchTarget` speak Pi `ToolDefinition`, `ToolContext`, `ToolResult`, progress updates, and status.
- `buildHandoffLaunchPrompt` embeds Pi slash-command/tool instructions and destination-specific preview copy. Its Handoff invariants are valuable, but its representation is host presentation owned by the Pi adapter.
- `createHandoffLaunchIntegration` adapts Pi command execution and tool registration into a small composition interface. Its depth is useful to another Pi adapter, but that does not make it harness-independent.

Moving any of these contracts to `@nseng-ai/handoffs/api` would leak Pi host types or create abstract replicas of Pi types solely to disguise host coupling. The smaller and more truthful seam is the declared adapter subpath.

No new Handoffs launch gateway is warranted. There are not two harness-independent adapters for a launch capability; the variation is destination-specific Pi composition, already represented by the injected prompt copy and preflight callback at the host-adapter seam.

## Required curated API addition

Before deleting the Handoffs `pi` subpackage, move the stable create/pickup slash-command names and `handoffCommandBackedSkillRegistrations` behind `@nseng-ai/handoffs/api`, then repoint Skill Exposure from `@nseng-ai/handoffs/pi` to `/api`.

This is not launch/session behavior. It is declarative command-backed skill metadata with an existing non-Pi cross-package consumer. The addition passes the API rank test because it anchors the Skill Exposure runtime edge after the host surface leaves the package. It follows the already-settled precedent that stable command-name constants may be exposed through an extension's curated API when another package requires them.

The remaining Pi-only constants—tool names, self-workflow timeout/status, focus question, and other runtime presentation values—move to `@nseng-ai/pi-ns-handoffs` and do not enter `/api`.

## Target package edges and exports

`@nseng-ai/pi-ns-handoffs`:

- depends on `@nseng-ai/handoffs` and imports its domain behavior only through `@nseng-ai/handoffs/api`;
- depends on `@nseng-ai/pi-runtime` and the public host-shape packages needed by the adapter;
- exposes its default Pi extension entry and a declared `./handoff-launch` adapter-composition subpath;
- owns all current Handoffs Pi tests and parity metadata.

`@nseng-ai/pi-ns-herdr`:

- depends on `@nseng-ai/herdr`, `@nseng-ai/handoffs`, `@nseng-ai/pi-ns-handoffs`, and `@nseng-ai/pi-runtime` as required by its existing behavior;
- imports durable Handoff operations from `@nseng-ai/handoffs/api`;
- imports only the declared composition interface/factory from `@nseng-ai/pi-ns-handoffs/handoff-launch`;
- must not deep-import either package or import an extension-owned `pi` surface.

The edge is acyclic: Handoffs' Pi adapter has no Herdr dependency; Herdr supplies destination-specific copy and preflight behavior to the generic Handoffs Pi flow.

## Extraction sequence

1. **Add the harness-independent metadata surface.** Move or re-home the stable create/pickup command-name derivation and command-backed skill registrations under Handoffs core/API ownership; export them from `@nseng-ai/handoffs/api`. Repoint Skill Exposure and preserve focused API tests.
2. **Create `@nseng-ai/pi-ns-handoffs`.** Move the complete current `handoffs/src/pi/` implementation and Pi tests into the host package. Repoint all relative domain imports to `@nseng-ai/handoffs/api`; keep private adapter modules private. Give `handoff-launch` one declared package export for adapter composition.
3. **Move discovery and parity ownership.** Repoint `.pi/extensions/handoff.ts`, `.pi/extensions/claude.ts`, package-level Pi discovery, and parity `sourcePackage` values to the new adapter. Preserve direct package entry where the package manifest can own discovery.
4. **Cut the extension host surface.** Remove Handoffs `./pi*` exports, `pi` subpackage declaration, and Pi Runtime peer/dev coupling once no consumer remains. Verify Handoffs contains no Pi imports, registration, or entrypoint.
5. **Extract Herdr's Pi surface.** Create `@nseng-ai/pi-ns-herdr`; repoint its optional Handoff integration loader to `@nseng-ai/pi-ns-handoffs/handoff-launch`, including exact-optional-absence classification and tests. Keep the hidden ns command on `@nseng-ai/handoffs/api`.
6. **Record the architecture clarification and enable guards.** Land the superseding ADR's adapter-to-adapter rule, then enforce that ns extensions have no Pi surfaces and that `pi-ns-*` adapters use curated extension APIs or declared adapter subpaths permitted by disposition closure.

Steps 1–4 complete stack orders 5, 9, and 21. Step 5 unblocks order 24 but does not by itself resolve Herdr's separate Branch Context formatting/core Pi-coupling work.

## Completion evidence for implementation

The implementing stack must show:

- `rg` finds no `@nseng-ai/handoffs/pi` runtime consumer and no Pi-owned source under `@nseng-ai/handoffs`;
- Skill Exposure imports Handoff command-backed metadata from `@nseng-ai/handoffs/api`;
- Herdr's adapter imports Handoff domain behavior from `/api` and adapter composition from the declared `@nseng-ai/pi-ns-handoffs/handoff-launch` subpath;
- Handoffs API tests cover the command-backed metadata contract;
- moved Handoffs Pi tests preserve command, tool, prompt, slug, self-handoff, Claude handoff, and parity behavior;
- Herdr tests preserve optional integration absence, transitive import failure propagation, preflight gating, and generated launch instructions;
- package checks, dependency checks, typecheck, default tests, integration/isolated lanes where applicable, and the TypeScript style guard pass;
- final structural guards reject a Pi surface reintroduced into Handoffs and reject private/deep imports from either Pi adapter.

No registry publication is part of this work.
