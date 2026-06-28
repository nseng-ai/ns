# Branch Context Capability Extension

## Thesis

Branch Context already has the curated `@sdl/branch-context/api` Capability API and the saved-plan / Branch Context boundary established by the closed `branch-context-plans-extension` child Objective. The remaining Phase 2 work is to make Branch Context a clean above-SDK Capability by removing its dependency on the `@sdl/pi` Presentation Host and settling command-face ownership without re-opening the completed Plans/API migration.

This Objective is a follow-on child of `sdl-extension-architecture` Phase 2. It exists because `@sdl/branch-context` still declares `@sdl/pi` and imports `IMPL_BRANCH_CONTEXT_COMMAND_NAME` from `@sdl/pi/commands` only to format the implementation slash command. That edge violates the Extension Dependency Graph direction: Branch Context domain/package code should not depend on the Pi host just to know presentation command names.

The intended end state is narrow: Branch Context owns Branch Memory attachment semantics, saved-plan-to-attached-plan behavior, attached-plan loading, implementation-prompt content, branch-context evidence, and portable domain/API helpers. Pi and CCC presentation edges own concrete slash-command surfaces such as `/sdl:branch-context:impl-attached-plan` and any launch-command formatting that embeds those surfaces.

## Current Implementation Baseline

Use this baseline to keep `objective-stack-impl` slices concrete and avoid rediscovery:

- `ts/packages/branch-context/package.json` currently declares `"@sdl/pi": "workspace:*"`.
- The only current Branch Context source import from `@sdl/pi` is `ts/packages/branch-context/src/impl-command.ts`, which imports and re-exports `IMPL_BRANCH_CONTEXT_COMMAND_NAME` and formats `/${IMPL_BRANCH_CONTEXT_COMMAND_NAME} <key>`.
- `ts/packages/branch-context/src/api.ts` and `src/index.ts` re-export `IMPL_BRANCH_CONTEXT_COMMAND_NAME` and `formatImplBranchContextCommand` through the package API/root.
- Current repo consumers of that formatter/constant include:
  - `ts/packages/ccc/src/cmux/slot-dispatch-plan.ts` and `ts/packages/ccc/test/ccc.test.ts` for cmux Pi launch command construction/assertions.
  - `ts/packages/hosts/pi/src/branch-context/from-plan-commands.ts`, `ts/packages/hosts/pi/src/branch-context/gt/upstack-impl-launch.ts`, and their tests for Pi command registration, status keys, usage text, new-session messages, and follow-up flow text.
  - `ts/packages/branch-context/test/impl-command.test.ts` for the current branch-context-owned constant/formatter behavior; this test should be removed or replaced once the behavior moves to the presentation edge.
- `ts/packages/hosts/pi/src/commands/surfaces.ts` already owns `IMPL_BRANCH_CONTEXT_COMMAND_NAME = "sdl:branch-context:impl-attached-plan"` and is the preferred home for Pi-owned command-surface constants and, if useful, a presentation-local formatter.
- `ts/scripts/typescript-style-guard/config.mjs` currently defers a legacy cycle component containing `@sdl/autobranch`, `@sdl/branch-context`, `@sdl/pi`, and `@sdl/sdl`; after the Branch Context → Pi manifest edge is removed, the deferred component should be narrowed so Branch Context is no longer tolerated inside that cycle.

## Scope

- Remove the `@sdl/branch-context` package dependency on `@sdl/pi` and all Branch Context source/test imports from `@sdl/pi/*`.
- Migrate concrete implementation slash-command names and command-invocation formatting out of `@sdl/branch-context/api` and into presentation-owned code. The default target is `@sdl/pi/commands` for Pi-owned constants/formatters, with CCC allowed to consume that neutral Pi command surface only where it is constructing a Pi launch command.
- Keep the existing Branch Context Capability API (`@sdl/branch-context/api`) as the in-process consumer surface for Branch Context domain behavior. Adjust it only to remove Pi-specific command-surface exports; do not broaden it with presentation-host concepts.
- Preserve user-visible Branch Context and saved-plan behavior: Branch Memory namespace/key semantics, saved-plan source handling, target branch derivation, attached-plan selection, implementation prompt content, session/evidence output, and current Pi command names.
- Update package/context documentation where needed so future agents can distinguish Branch Context domain/API responsibilities from Pi presentation-command registration.
- Tighten Extension Dependency Graph guard/test expectations so Branch Context is no longer included in the legacy autobranch/pi/sdl deferred cycle after its Pi edge is gone.
- Record completion evidence with import/dependency stale-edge searches and parent Objective tracking under `sdl-extension-architecture` Phase 2 step 4.

## Non-Goals

- Do not redesign the local saved-plan store, Branch Memory storage model, branch naming, plan slug derivation, attached-plan key formats, or saved-plan fallback behavior.
- Do not redo the completed `branch-context-plans-extension` work that created `@sdl/branch-context/api` / `@sdl/plans/api` and migrated broad CCC/Pi consumer imports.
- Do not make this Objective own the full `@sdl/autobranch` / `@sdl/pi` / `@sdl/sdl` manifest-cycle cleanup beyond removing Branch Context from that cycle's tolerated component.
- Do not convert CCC itself into the final clean consumer for every remaining capability; the parent `sdl-extension-architecture` Objective retains broader CCC clean-consumer work after per-capability children land.
- Do not introduce a privileged kernel/bundled-command path, dynamic arbitrary Pi mirroring, or renamed branch-context command taxonomy.
- Do not create hidden registries, YAML/frontmatter, UUID state, workflow-controller behavior, Branch Memory ledgers, or stack-state files.

## Completion Criteria

- `@sdl/branch-context` no longer declares `@sdl/pi` in `package.json`; the lockfile is updated if needed; Branch Context source/tests have no imports from `@sdl/pi/*`.
- Branch Context no longer exports `IMPL_BRANCH_CONTEXT_COMMAND_NAME` or a Pi-specific `formatImplBranchContextCommand` through `@sdl/branch-context/api` or the package root. Concrete implementation-command formatting is owned by `@sdl/pi`/CCC presentation code.
- Existing `@sdl/branch-context/api` consumers continue to compose Branch Context domain behavior through the Capability API rather than package roots or private/deep imports, with the command-surface export removal documented as a boundary decision.
- Current user-visible Branch Context behavior and command names are preserved, especially `/sdl:branch-context:impl-attached-plan`, `/sdl:branch-context:from-plan`, `/sdl:branch-context:upstack-impl-from-plan`, generated usage/follow-up text, new-session launch messages, and cmux Pi launch command strings.
- Context or package documentation records the final Branch Context command-face/API/domain boundary and the reason Branch Context must not depend on the Pi Presentation Host.
- `just ts-guard` expectations no longer tolerate Branch Context inside the legacy autobranch/pi/sdl deferred package cycle, and stale-edge searches show the Branch Context → Pi edge is gone.
- Parent Objective `sdl-extension-architecture` records this child Objective's completion evidence and can treat the Branch Context de-Pi boundary as complete.

## Definition of Progress

Progress is keepable when it removes a Branch Context → Pi source or manifest edge, moves concrete slash-command ownership toward Pi/CCC presentation code, preserves existing Branch Context behavior with targeted tests, tightens dependency-cycle guardrails, or documents the final boundary.

Useful evidence includes:

- `rg -n "@sdl/pi|IMPL_BRANCH_CONTEXT_COMMAND_NAME|formatImplBranchContextCommand" ts/packages/branch-context ts/packages/ccc ts/packages/hosts/pi ts/scripts/typescript-style-guard` before/after comparisons.
- `pnpm --dir ts --filter @sdl/branch-context run check` and `pnpm --dir ts --filter @sdl/branch-context run test` for Branch Context package safety.
- Focused Pi/CCC Vitest coverage for branch-context launch flows and command-surface formatting, followed by `just ts-check`, `just ts-test`, and `just ts-guard` when practical.
- Source/package searches proving `@sdl/branch-context` no longer imports or declares `@sdl/pi`.
- Semantic Updates that record any API export removal, guard tightening, or parent-Objective evidence.

Do not keep changes that silently alter saved-plan paths, Branch Memory namespaces/keys, target branch derivation, attached-plan selection, implementation prompt content, cmux launch behavior, or Pi command names.

## Runner Policy

This Objective is execution-friendly for `objective-stack-impl` after its required preview and user confirmation.

Direct execution is allowed after preview for:

- inventorying current imports/consumers and confirming the baseline;
- moving implementation slash-command formatting to Pi/CCC presentation code;
- removing Pi-specific exports from `@sdl/branch-context/api`/root and migrating in-repo consumers;
- deleting the `@sdl/pi` dependency from `@sdl/branch-context` and updating the pnpm lockfile;
- tightening `ts-guard` deferred-cycle expectations so Branch Context is no longer grandfathered into the legacy cycle;
- updating Branch Context/Pi/CCC context docs and Objective tracking.

Steer first before changing command names, CLI/Pi command taxonomy, saved-plan or Branch Memory compatibility, branch naming, slug derivation, dynamic Pi mirror behavior, public SDK surface, or ownership of broader autobranch/pi/sdl cycle cleanup.

The runner may edit TypeScript, package metadata, pnpm lockfile, tests, docs/context files, and this/parent Objective tracking. The runner must not push, submit, land, publish, mutate GitHub, mutate real Branch Memory entries as validation, or run real branch-context creation/attachment flows without explicit confirmation. PR submission remains outside `objective-stack-impl` unless separately requested.

## Assumptions and Risks

Assumptions:

- The closed `branch-context-plans-extension` Objective remains authoritative for the combined Branch Context + Plans API migration; this Objective is a follow-on for remaining layering debt, not a replacement.
- The implementation slash command string is presentation-host-specific enough that Branch Context should not own a Pi command registry or default Pi command name.
- Moving the current `formatImplBranchContextCommand` behavior to `@sdl/pi/commands` (or an equally local presentation helper) is preferable to duplicating the command string inside Branch Context.
- Preserving current Pi slash command names is preferable to renaming command surfaces as part of this layering cleanup.
- `@sdl/plans` remains an intentional dependency for saved-plan semantics; removing `@sdl/pi` should not imply splitting or reworking Plans.
- CCC's existing dependency on neutral `@sdl/pi/...` helper subpaths may be used for the narrow case of constructing a Pi launch command, but Branch Context package code must not depend on that host surface.

Risks:

- A minimal code fix could duplicate the Pi command string inside Branch Context, removing the package dependency while leaving ownership ambiguous. Mitigate by removing Pi-specific command exports from the Capability API/root and documenting the final boundary.
- Moving formatting responsibility to presentation edges could accidentally break implementation prompts, follow-up flow text, or CCC/Pi launch flows. Mitigate with targeted consumer tests and evidence that existing command names and launch messages are preserved.
- The broader autobranch/pi/sdl manifest-cycle debt may be adjacent enough to tempt scope creep. Mitigate by shrinking Branch Context out of the deferred cycle and leaving the remaining cycle to the parent Objective.
- API preservation may conflict with removing Pi-specific exports from `@sdl/branch-context/api`. Mitigate by treating the removal as an intentional internal boundary adjustment in this private repo, migrating all in-repo consumers, and documenting the change.

## Open Questions

No open design question should block `objective-stack-impl` from previewing and executing the planned stack. Ask the user only if implementation evidence shows one of these assumptions is false:

- `@sdl/pi/commands` cannot own a presentation-local formatter without violating Pi package boundaries, in which case use a Pi branch-context-local helper and document why.
- CCC cannot consume the neutral Pi command surface for Pi launch command construction, in which case keep the formatter local to CCC's cmux launch code and duplicate only the presentation-owned surface there.
- Removing the Pi-specific Branch Context API exports breaks an intentional in-repo consumer not identified in the baseline search, in which case pause to decide whether that consumer should migrate to Pi/CCC presentation code or receive a presentation-neutral API shape.
