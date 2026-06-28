# Roadmap

## Work

- [ ] Inventory the current Branch Context Pi edge and consumer expectations.
  - Evidence to gather: `@sdl/branch-context` package dependencies, `@sdl/pi/*` imports in Branch Context source/tests, consumers of `IMPL_BRANCH_CONTEXT_COMMAND_NAME` and `formatImplBranchContextCommand`, current Pi command registration locations, and current CCC/Pi uses of `@sdl/branch-context/api`.

- [ ] Decide and implement the command-surface ownership boundary.
  - Target: Branch Context no longer imports Pi command-name constants. Pi/CCC presentation edges own or inject concrete slash command strings, while Branch Context keeps presentation-neutral attached-plan loading, prompt content, and evidence helpers. Preserve `/sdl:branch-context:impl-attached-plan` unless a separate steer-first decision changes it.
  - Evidence: targeted tests or source checks showing implementation prompts/launch flows still use the intended command surface without a Branch Context → Pi import.

- [ ] Remove the `@sdl/branch-context` → `@sdl/pi` package edge.
  - Target: delete the `@sdl/pi` dependency from `ts/packages/branch-context/package.json`; keep Branch Context imports limited to its intentional lower/provider dependencies such as `@sdl/brmem`, `@sdl/core`, `@sdl/graphite`, and `@sdl/plans`.
  - Evidence: package check/typecheck for Branch Context and stale-edge search for `@sdl/pi` under `ts/packages/branch-context`.

- [ ] Preserve and document the Capability API boundary.
  - Target: `@sdl/branch-context/api` remains the curated consumer surface for CCC/Pi composition, with any removal or signature change of Pi-specific exports documented. `@sdl/plans/api` and saved-plan storage behavior remain out of scope unless directly affected by the command-surface cleanup.
  - Evidence: consumer import-boundary search over CCC/Pi branch-context consumers and package/context documentation that states the final Branch Context command-face/API/domain boundary.

- [ ] Record completion and parent tracking.
  - Target: write the completion evidence needed for this child and update `sdl-extension-architecture` Phase 2 step 4 to record the Branch Context child spawn/progress/closure as appropriate.
  - Evidence: clean stale-edge gates for Branch Context → Pi, preserved command names/prompt behavior, and parent Objective update once the child has material progress or closure evidence.

## Parked

- Reworking saved-plan storage, Branch Memory namespace/key compatibility, branch naming, slug derivation, or attached-plan selection.
- Re-opening the broader Branch Context + Plans API migration already completed by `branch-context-plans-extension`.
- Dynamic arbitrary Pi mirroring for Branch Context commands.
- Full autobranch/branch-context/pi/sdl manifest-cycle cleanup unless it directly blocks removing Branch Context's Pi dependency.
- Broader CCC clean-consumer conversion across remaining capabilities; this stays with the parent `sdl-extension-architecture` Objective and other child Objectives.
