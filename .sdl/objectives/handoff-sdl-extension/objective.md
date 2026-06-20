# Handoff SDL Extension

## Thesis

Handoff Artifacts should become a first-class SDL extension command tree, with `sdl handoff ...` as the canonical portable command surface for Handoff lifecycle operations. To make that real without flattening names or regressing SDL's discovery model, SDL must first support manifest-declared nested extension command trees with side-effect-light discovery and selected leaf loading. The existing Pi commands and handoff skills should be edited in place as adapters over the new package/SDL core, while broader skill or Pi-extension resource management is explicitly deferred.

## Scope

- Extend SDL's extension system to support nested command trees contributed by extensions.
  - Static manifest metadata describes groups and executable leaves.
  - Discovery/help/command lookup must not eager-load extension modules.
  - Selected leaves load only the module needed for the invoked command.
  - The SDK grows a focused leaf-command helper such as `defineCommand()` rather than exposing internal command-group implementation details as the public author API.
- Convert the TypeScript `@asdl/handoff` package into the real pressure-test extension for the nested tree API.
  - Target command tree: `sdl handoff create`, `sdl handoff pickup`, `sdl handoff list`, `sdl handoff delete`, and `sdl handoff gc`.
  - Stage delivery so `list`, `delete`, and `gc` prove command-tree infrastructure before `create` and `pickup` finalize their headless contracts.
- Cut over the standalone `handoff` CLI once SDL parity exists.
  - The package may keep shared operation modules, but the independent standalone CLI surface should be removed at cutover rather than kept as a temporary shim, migration diagnostic, or long-lived parallel public surface.
- Preserve public Pi command and skill names while changing their internals in place where needed.
  - `/handoff:create`, `/handoff:pickup`, `/handoff:list`, `handoff-create`, and `handoff-pickup` remain user-facing names.
  - Those surfaces should call or describe the new SDL/package core rather than duplicating Branch Memory recipes once the core exists.
- Define headless boundaries for full lifecycle support.
  - `sdl handoff create` is deterministic storage core: it accepts final Markdown from stdin or `--file`, validates branch/slug/overwrite policy, and stores the artifact.
  - Pi/skills remain authoring frontends that compose the Markdown from session context before invoking the core.
  - `sdl handoff pickup` owns mechanical selection and read behavior, returning artifact content plus metadata; Pi/skills own conversational summary, user-control prompt, and any continuation.
- Update handoff and SDL documentation, context language, and tests so future agents can discover the new architecture.

## Non-Goals

- Do not build the Pup-inspired skill-management or Pi-extension-management subsystem in this Objective.
- Do not integrate skill or Pi-extension resource management into SDL extensions as part of this work.
- Do not eager-load SDL extension modules for discovery, top-level help, or unrelated command lookup.
- Do not introduce hidden registries, UUID lifecycle state, task databases, or workflow controllers for Handoff Artifacts.
- Do not create new public Pi command names for handoff lifecycle operations unless a later explicit design reverses the adapter decision.
- Do not make `sdl handoff pickup` automatically continue implementation work after reading a handoff.
- Do not preserve the standalone `handoff` CLI as a long-lived parallel public surface after SDL parity is established.

## Completion Criteria

- SDL supports manifest-declared nested extension command trees with side-effect-light discovery and selected leaf loading.
- The public SDL SDK exposes a leaf-command authoring API appropriate for selected command modules, such as `defineCommand()`.
- `@asdl/handoff` contributes a nested SDL extension tree for the full Handoff Artifact lifecycle target: `create`, `pickup`, `list`, `delete`, and `gc`.
- Existing Handoff operations use shared package logic behind SDL leaves and any remaining adapters, rather than separate duplicate command implementations.
- The standalone `handoff` CLI surface and installed `handoff` binary/shim are removed once equivalent SDL commands exist; no temporary compatibility binary is retained.
- Existing Pi handoff commands and handoff skills keep their public names and are updated in place to align with the new SDL/package core.
- Documentation and context files explain the split between portable SDL command core, Pi/skill authoring or presentation adapters, and Branch Memory technical storage.
- Tests prove both the generic SDL nested-extension behavior and the Handoff-specific command tree, including a regression that unrelated SDL discovery/help does not import selected handoff leaf modules.

## Assumptions and Risks

Assumptions:

- Handoff is a strong real-world pressure test for SDL nested extension commands because its natural public shape is `sdl handoff <operation>`, not flat commands such as `sdl handoff-list`.
- Static manifest metadata can describe arbitrary nested command trees well enough for discovery and help without importing extension code.
- A selected leaf module API is enough for the first durable nested-command design; extension authors do not need to export internal Clinkr groups directly.
- Pi commands and skills can remain stable user-facing adapters while their internals move toward SDL/package core calls.
- Headless create and pickup boundaries can be useful without SDL owning conversation summarization or session continuation.

Risks:

- Nested command-tree support may expand SDL's extension API surface more than the current handoff migration needs. Mitigate by keeping the public SDK minimal and using Handoff as the proving example.
- Hard-cutting over the standalone `handoff` CLI may break habits or scripts if parity and documentation are incomplete. Mitigate by sequencing removal after SDL parity, auditing every binary/shim/doc/skill/Pi call site, and recording migration guidance.
- `create` may accidentally become a model-authoring workflow inside SDL. Mitigate by defining SDL create as deterministic storage over final Markdown, with Pi/skills responsible for authoring.
- `pickup` may blur into automatic execution. Mitigate by keeping SDL pickup to selection/read/metadata and preserving the user-control prompt in Pi/skill adapters.
- Existing handoff skills may contain storage recipes that drift from the new core. Mitigate by editing them in place as part of cutover rather than leaving parallel instructions.
- The parked Pup-inspired resource-management subsystem may be tempting to fold in. Mitigate by explicitly treating it as later work outside this Objective.

## Open Questions

- What exact manifest schema should represent nested groups and executable leaves?
- What path-routing, help, selected-loading, and diagnostic behavior should `sdl <group> <leaf>` use before command-tree infrastructure is implemented?
- Should selected leaf modules repeat their command name/description for validation, or should the manifest own discovery metadata entirely while the module owns schema/options/run behavior?
- What JSON or structured output should `sdl handoff pickup` return for Pi/skill adapters?
- Should `sdl handoff create` derive slugs from final Markdown itself, require an explicit slug, or support both with a deterministic derivation helper?
- Which context files should gain new vocabulary for "SDL command tree", "leaf command", and "Handoff SDL extension" after the design lands?
