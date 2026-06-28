# Branch Context Capability Extension

## Thesis

Branch Context already has the curated `@sdl/branch-context/api` Capability API and the saved-plan / Branch Context boundary established by the closed `branch-context-plans-extension` child Objective. The remaining Phase 2 work is to make Branch Context a clean above-SDK Capability by removing its dependency on the `@sdl/pi` Presentation Host and settling command-face ownership without re-opening the completed Plans/API migration.

This Objective is a follow-on child of `sdl-extension-architecture` Phase 2. It exists because `@sdl/branch-context` still declares `@sdl/pi` and imports `IMPL_BRANCH_CONTEXT_COMMAND_NAME` from `@sdl/pi/commands` only to format the implementation slash command. That edge violates the Extension Dependency Graph direction: Branch Context domain/package code should not depend on the Pi host just to know presentation command names.

## Scope

- Remove the `@sdl/branch-context` package dependency on `@sdl/pi` and all Branch Context source imports from `@sdl/pi/*`.
- Keep the existing Branch Context Capability API (`@sdl/branch-context/api`) as the in-process consumer surface for CCC, Pi adapters, and sibling tests, adjusting it only as needed to remove Pi-specific command-surface ownership.
- Settle command-face ownership so Pi slash command strings such as `/sdl:branch-context:impl-attached-plan` are owned or injected at the presentation edge, while Branch Context owns attached-plan loading, Branch Context creation/attachment semantics, implementation-prompt content, and portable evidence helpers.
- Preserve user-visible Branch Context and saved-plan behavior: Branch Memory namespace/key semantics, saved-plan source handling, target branch derivation, attached-plan selection, implementation prompt content, and current Pi command names unless a later steer-first decision explicitly changes them.
- Update package/context documentation where needed so future agents can distinguish Branch Context domain/API responsibilities from Pi presentation-command registration.
- Record completion evidence with import/dependency stale-edge searches and parent Objective tracking under `sdl-extension-architecture` Phase 2 step 4.

## Non-Goals

- Do not redesign the local saved-plan store, Branch Memory storage model, branch naming, plan slug derivation, attached-plan key formats, or saved-plan fallback behavior.
- Do not redo the completed `branch-context-plans-extension` work that created `@sdl/branch-context/api` / `@sdl/plans/api` and migrated broad CCC/Pi consumer imports.
- Do not make this Objective own the full `@sdl/autobranch` / `@sdl/branch-context` / `@sdl/pi` / `@sdl/sdl` manifest-cycle cleanup unless that broader cycle directly blocks removing Branch Context's Pi dependency.
- Do not convert CCC itself into the final clean consumer for every remaining capability; the parent `sdl-extension-architecture` Objective retains broader CCC clean-consumer work after per-capability children land.
- Do not introduce a privileged kernel/bundled-command path or dynamic arbitrary Pi mirroring for Branch Context commands.
- Do not create hidden registries, YAML/frontmatter, UUID state, or workflow-controller behavior.

## Completion Criteria

- `@sdl/branch-context` no longer declares `@sdl/pi` in `package.json` and Branch Context source/tests have no imports from `@sdl/pi/*`.
- Branch Context implementation-command prompt/formatting behavior no longer requires Branch Context to import Pi command-name constants; Pi/CCC presentation edges own or inject slash-command surfaces.
- Existing `@sdl/branch-context/api` consumers continue to compose through the Capability API rather than package roots or private/deep imports, with any API adjustment documented as a boundary decision.
- Current user-visible Branch Context behavior and command names are preserved unless a separate steer-first decision records an intentional change.
- Context or package documentation records the final Branch Context command-face/API/domain boundary and the reason Branch Context must not depend on the Pi Presentation Host.
- Parent Objective `sdl-extension-architecture` records this child Objective spawn and can treat the Branch Context de-Pi boundary as complete once stale-edge searches are clean.

## Assumptions and Risks

Assumptions:

- The closed `branch-context-plans-extension` Objective remains authoritative for the combined Branch Context + Plans API migration; this Objective is a follow-on for remaining layering debt, not a replacement.
- The implementation slash command string is presentation-host-specific enough that Branch Context should not own a Pi command registry. Branch Context may expose prompt/evidence primitives, while Pi and CCC format or inject the concrete slash command at the edge.
- Preserving current Pi slash command names is preferable to renaming command surfaces as part of this layering cleanup.
- `@sdl/plans` remains an intentional dependency for saved-plan semantics; removing `@sdl/pi` should not imply splitting or reworking Plans.

Risks:

- A minimal code fix could simply duplicate the Pi command string inside Branch Context, removing the package dependency while leaving ownership ambiguous. Mitigate by making command-surface ownership an explicit roadmap row and documenting the final boundary.
- Moving formatting responsibility to presentation edges could accidentally break implementation prompts or CCC/Pi launch flows. Mitigate with targeted consumer tests and evidence that existing command names and prompt behavior are preserved.
- The broader autobranch/branch-context/pi/sdl manifest-cycle debt may be adjacent enough to tempt scope creep. Mitigate by treating only Branch Context's Pi edge as in scope unless the broader cycle blocks completion.
- API preservation may conflict with removing Pi-specific exports from `@sdl/branch-context/api`. Mitigate by changing only the smallest surface needed and recording any compatibility or consumer migration decision.

## Open Questions

- Should `formatImplBranchContextCommand` remain in `@sdl/branch-context/api` with an injected command-surface parameter, move entirely to Pi/CCC presentation code, or be replaced by a more presentation-neutral implementation-prompt data helper?
- Does any live test or adapter rely on Branch Context exporting `IMPL_BRANCH_CONTEXT_COMMAND_NAME` as part of the Capability API, and if so should that consumer migrate to Pi-owned command surfaces or to an injected formatter?
- After the Branch Context Pi dependency is removed, what stale manifest-cycle evidence remains for the parent Objective to route to autobranch or broader CCC clean-consumer work?
