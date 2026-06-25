# Branch Context + Plans Extension Migration

## Thesis

`@sdl/branch-context` and `@sdl/plans` form SDL's plan-attachment capability area: saved implementation plans are written to the local plan store, selected or resolved, converted into branch-context attachment operations, attached through Branch Memory, and launched by CCC/Pi workflows. Under ADR 0009, this area should move above the SDL kernel as extension-owned domain logic with thin command faces and curated Peer APIs, rather than exposing broad package-root internals to sibling orchestrators.

This Objective is a child of `sdl-extension-architecture` Phase 2. It deliberately combines branch-context and plans because current workflows and consumers compose them in one user-visible flow: `/sdl:plan:*`, branch-context-from-plan, dispatch-plan, attached-plan implementation, and cmux/Pi launch. The migration should make the seam explicit: saved-plan storage and selection remain plans responsibilities, branch-context attachment remains a branch-context responsibility, and sibling orchestrators such as `ccc` consume only curated Peer APIs.

## Scope

- Design and implement the combined branch-context/plans capability migration required by ADR 0009.
- Define the Peer API subpaths and boundaries for this combined area, expected to include `@sdl/branch-context/api` and, where needed, `@sdl/plans/api` rather than broad package-root sibling imports.
- Split command faces from gateway-injected domain cores so CLI/Pi command shells build gateways at the edge and reusable domain logic can be tested without raw Pi/SDL host context.
- Migrate `ccc` and `pi-extensions` consumers from broad root imports to the curated Peer API surfaces where they need in-process capability behavior.
- Preserve existing user-visible semantics for saved plan creation/selection, branch-context creation, attached-plan lookup, implementation command formatting, session artifact evidence, and dispatch/launch flows unless a deliberate steer-first decision changes them.
- Record any dependency on `@sdl/brmem`, `@sdl/graphite`, `@sdl/extension-kit`, or neutral `@sdl/core` gateways explicitly rather than hiding it behind `@sdl/sdl` internals.

Current inventory baseline:

- Package exports are broad roots today. `@sdl/branch-context` exports context factories, Branch Memory namespace/key helpers, branch-context creation operations, attached-plan loading, session artifact helpers, implementation command formatting, existing-branch reuse helpers, and plan-content slug derivation through `.`; only `./testing` is a separate subpath. `@sdl/plans` exports CLI builders, content slug derivation, plan persistence helpers, local plan-store path helpers, saved-plan write/list/selection helpers, and session saved-plan extraction helpers through `.`. Neither package has a Peer API subpath yet.
- Likely command-face/private exports include CLI builders, command formatting/presentation helpers, preview/failure formatting, prompt builders, and root convenience exports that exist mainly so current CLIs/Pi adapters can wire commands.
- Likely Peer API candidates are the in-process seams sibling packages actually compose: saved-plan directory resolution and session/latest selection from `@sdl/plans`; branch-context operation construction, creation/attachment evidence, attached-plan loading, session artifact evidence extraction, implementation command construction, and existing-branch reuse from `@sdl/branch-context`. These candidates must still be narrowed before becoming API contract.
- Branch-context internals use plans for saved-plan file naming, validation, source-file resolution, saved-plan selection, and plan-content slug derivation. This dependency is intentional today but should be made explicit at the capability seam.
- `ccc` composes saved-plan selection from plans with branch-context operation construction, branch creation/attachment, evidence formatting, and cmux/Pi launch flows. The highest-value first proof path is `ts/packages/ccc/src/cmux/slot-dispatch-plan.ts`, followed by `slot-open-branch.ts` and `branch-context-up-and-impl.ts` for evidence lookup and implementation-session launch.
- `pi-extensions` owns Pi presentation/adapters for branch-context and enriched-plan workflows while importing both package roots for domain behavior and constants. Its adapters should remain presentation owners while depending on command faces or Peer APIs for capability behavior.
- Tests currently import package roots and `@sdl/branch-context/testing`; future test movement should follow only from deliberate public/Peer API boundary changes.
- Storage/compatibility-sensitive semantics to preserve are: saved plans live under the XDG state `enriched-plan` store, keyed by repository identity and encoded source branch; saved-plan filenames are `<slug>.md`; plan slugs are validated lowercase kebab-case with 3–7 words and no `.md`; plan source files for attachment must be absolute/home-relative regular files outside the repo; branch-context Branch Memory namespace is `branch-context`; attached-plan keys are named Markdown keys `<slug>.md`; legacy `plan.md` is explicitly unsupported; default target branch is the slug unless an explicit branch name is provided; implementation refuses detached/trunk branches and auto-selects exactly one supported attached key, falling back to local saved-plan selection only when no attached entries exist and no explicit key was requested.

## Non-Goals

- Do not redesign enriched-plan storage, Branch Memory storage semantics, branch naming, plan slug derivation, or attached-plan key formats unless explicitly approved as a separate steer-first decision.
- Do not move standalone tools or unrelated capabilities into this Objective.
- Do not convert `ccc` itself into the orchestrator extension here; this Objective should prepare `ccc` consumption through Peer APIs so the parent Objective can convert `ccc` later.
- Do not add a privileged SDL kernel or bundled-extension path for branch-context or plans commands.
- Do not make Pi dynamic command mirroring part of this migration; Pi adapters can remain engineered presentation surfaces unless a later Objective changes that architecture.
- Do not create hidden registries, YAML/frontmatter, UUID state, or workflow-controller behavior in Objective or plan storage.

## Completion Criteria

- The branch-context/plans capability boundary is documented in code/docs/Objectives with clear command-face versus Peer API responsibilities.
- Curated Peer API subpaths exist for the in-process behavior sibling packages need, and `ccc`/Pi consumers no longer depend on broad package roots or private/deep implementation paths for those behaviors.
- Domain cores that perform saved-plan resolution, branch-context operation construction/attachment, attached-plan loading, and launch evidence formatting are testable through injected gateways/fakes rather than raw host context or argv-string scripting.
- Existing branch-context and plans user-visible behavior remains covered by package tests and scenario/integration tests where applicable.
- The migration records the final dependency stance between plans, branch-context, brmem, graphite, extension-kit, ccc, and pi-extensions.
- Parent Objective `sdl-extension-architecture` can treat this child as complete when it prepares `ccc` to consume branch-context/plans through Peer APIs as part of the later orchestrator-extension conversion.

## Definition of Progress

Progress is keepable when it narrows or documents the combined capability boundary, moves sibling consumption toward curated Peer APIs, separates command shells from gateway-injected domain cores, or improves tests around those boundaries without changing user-visible storage or launch semantics accidentally.

Useful evidence includes targeted import-boundary searches, package export-map diffs, fake-gateway unit tests, existing branch-context/plans tests, relevant `ccc`/Pi adapter tests, and Objective updates explaining any boundary decisions.

Do not keep changes that silently alter saved-plan path layout, branch-context Branch Memory keys, branch naming, attached-plan selection, plan slug behavior, Pi command names, or cmux/launch semantics.

## Runner Policy

This Objective is execution-friendly for one bounded migration slice after preview.

Direct execution is allowed after preview for slices such as inventorying current exports/consumers, adding a curated Peer API subpath, moving one command shell to call an existing gateway-injected core, migrating one `ccc` or Pi consumer to a Peer API, or adding tests that lock an already-decided boundary.

Steer first before changing public command names, saved-plan storage layout, Branch Memory namespaces or keys, branch naming, slug derivation, compatibility aliases, dynamic Pi mirroring, package-level capability ownership, or any behavior that could affect existing saved plans or attached branch contexts.

The runner may edit TypeScript, package metadata, tests, docs/context files, and Objective tracking for this Objective. The runner must not push, submit, land, publish, mutate GitHub, mutate real Branch Memory entries as validation, or run real branch-creation/attachment flows without explicit confirmation.

## Assumptions and Risks

Assumptions:

- Combining branch-context and plans in one child Objective is more useful than splitting them immediately because current user-visible flows and consumers compose them tightly.
- Plans can still retain a distinct responsibility for local plan-store persistence and selection even when tracked in the same child Objective as branch-context.
- Existing root exports are broader than the eventual Peer API should be; the migration can introduce curated subpaths without breaking command faces.
- `@sdl/brmem` remains the Branch Memory storage primitive below/adjacent to this capability, not a hidden branch-context-internal database.
- `ccc` should eventually consume branch-context/plans as an orchestrator through Peer APIs, not through package internals or human-facing CLI output.

Risks:

- The combined Objective could grow too broad if it tries to migrate all saved-plan, branch-context, Pi, and CCC behavior in one PR. Mitigate by roadmap slicing around one boundary or consumer class at a time.
- Peer APIs may accidentally freeze too much of today's broad package-root surface. Mitigate by starting from concrete sibling needs and keeping command-only helpers out of Peer APIs.
- Storage compatibility is sensitive: saved plan files, Branch Memory keys, branch-context namespaces, and attached-plan selection must not drift silently.
- Pi and CCC presentation flows may hide behavior assumptions not obvious from package tests. Mitigate with targeted consumer tests before/after migration slices.

## Open Questions

- Should the long-term public package root remain a human-facing convenience export, or should sibling packages move exclusively to Peer API subpaths for branch-context/plans behavior?
- Which exact pieces belong in `@sdl/plans/api` versus `@sdl/branch-context/api` once saved-plan dispatch is decomposed?
- Should plan-content slug derivation live with plans, branch-context, or a small shared seam after the combined capability is split internally?
- Which `ccc` dispatch-plan flows should migrate first as proof of the Peer API shape?
