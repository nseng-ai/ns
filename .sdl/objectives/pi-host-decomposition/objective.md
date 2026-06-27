# Pi Host Decomposition

## Thesis

`@sdl/pi` should become a smaller Pi Presentation Host: it should own Pi runtime integration, project-local discovery adapters, neutral helper subpaths, and thin presentation shells, but it should not remain the home for large self-contained feature subsystems or vertically integrated capability domain logic.

This Objective decomposes the fat host in two explicit lanes. Pi-native standalone tools should move into packages that stack on top of `@sdl/pi` and consume its Pi runtime/helper surface. Vertically integrated capability mirrors should thin toward their owning Capability packages and Capability APIs, preserving Pi command/presentation behavior while moving capability domain decisions out of the host. `context-profiler` is the reference extraction candidate, not the entire goal.

The Objective is aligned with `sdl-extension-architecture`: domain logic belongs in Capabilities, the Extension Dependency Graph must stay acyclic, and `@sdl/pi` is a Presentation Host rather than a Capability. This Objective owns the Pi-host decomposition track itself; the architecture parent continues to own the broader Capability migration endgame and transitional-package retirement.

## Scope

- Inventory `@sdl/pi` at `ts/packages/hosts/pi/` as a package boundary: current exports, package dependencies, reverse imports, test ownership, Pi runtime APIs, and feature-domain seams.
- Extract Pi-native standalone tools from `@sdl/pi` into packages that depend on `@sdl/pi`, not the reverse, beginning with `context-profiler` as the reference recipe.
- Treat the following Pi-native areas as extraction candidates unless inventory evidence proves a different disposition is safer: `context-profiler`, `grill`, `thermo-council`, `runner-subagents`, and `terminal`.
- For the `context-profiler` reference slice, explicitly resolve known reverse-import hazards before moving code: PR views currently consume `context-profiler` render utilities, `thermo-council` consumes its LM JSON helper, and Pi parity registration consumes its parity record.
- Separate capability-mirror thinning from standalone tool extraction. Handoff, Branch Context, PR feedback, Objective, Plans, and similar Pi surfaces should become thin Pi shells over their owning Capability packages/APIs where they still contain capability-specific decisions.
- Keep user-visible Pi slash commands, model-visible tools, parity records, and project-local discovery adapters working intentionally while changing package ownership.
- Record any package-placement conventions discovered by the reference extraction, including whether a new package belongs under a host/tool tier, a capability tier, or another explicit workspace location.
- Coordinate with `sdl-extension-architecture` when a capability mirror needs a child Objective rather than a local Pi package extraction.

## Non-Goals

- Do not treat `@sdl/pi` itself as a Capability package; it remains the Pi Presentation Host and runtime integration package.
- Do not move capability domain logic from Pi into new Pi-stacked tool packages when that logic belongs in an existing or future Capability package.
- Do not rename or remove user-visible Pi commands merely to simplify package topology.
- Do not migrate standalone non-Pi tools such as `packagechk`, `vibechk`, `areg`, or `aretro` as part of this Objective.
- Do not use this Objective to re-open completed Objective capability migration work except where Pi still has a thin presentation shell or stale coupling to verify.
- Do not add hidden registries, package-state ledgers, YAML/frontmatter, or workflow-controller state to track decomposition.
- Do not make `@sdl/pi` depend on newly extracted Pi-native tool packages if that would invert the intended stacked direction; use project-local discovery adapters or registration seams that preserve acyclicity.

## Completion Criteria

- `context-profiler` has been extracted or otherwise conclusively dispositioned as the reference Pi-native package slice, including its source, tests, parity registration, and shared render/LM-JSON utility seams.
- Each named Pi-native extraction candidate (`context-profiler`, `grill`, `thermo-council`, `runner-subagents`, `terminal`) has either moved to an appropriate package stacked above `@sdl/pi` or has a recorded evidence-backed disposition explaining why it should remain in the host or move to a different layer.
- The vertically integrated capability mirror lane has an explicit status for the major Pi capability surfaces, including Handoff, Branch Context, PR feedback, Objective, and Plans-adjacent commands: thin shell complete, delegated to an owning Capability/API, or spawned/deferred to a capability Objective.
- `@sdl/pi`'s remaining exports are intentional neutral helper or runtime/presentation subpaths rather than accidental feature-domain entrypoints.
- Package dependency direction remains acyclic under `just ts-guard`; newly extracted Pi-native packages depend on `@sdl/pi` helper/runtime subpaths rather than forcing the host to import feature implementations.
- Relevant package context or roadmap documentation records the final decomposition convention so future agents know how to choose between Pi-native tool packages and Capability packages.
- Existing Pi user-facing behavior for affected commands/tools is preserved or intentionally changed with explicit documentation and tests.

## Definition of Progress

For implementation sessions, meaningful progress is a reviewable repository slice that either removes a concrete `@sdl/pi` host coupling, proves an extraction/disposition decision with tests and dependency evidence, or records a package-boundary convention future agents can apply. Routine validation is evidence for those slices, not standalone progress.

For the current `objective-stack-impl` path, the highest-value executable stack is the `context-profiler` reference extraction. It should proceed in this order unless implementation evidence forces a smaller stop:

1. Rehome the neutral reverse-import seams: display-width/scroll helpers used by PR preview views, and LM JSON parsing used by `thermo-council`, into intentional `@sdl/pi` helper subpaths or another explicitly justified neutral home.
2. Extract `context-profiler` into the provisional Pi-tool package tier, expected as `ts/packages/pi-tools/context-profiler/` with package name `@sdl/pi-context-profiler`, preserving tests, command registration, and parity metadata without making `@sdl/pi` import the extracted package.
3. Record the reference extraction recipe and update package/context language only after the package graph and focused behavior tests prove the convention.

## Runner Policy

A future `objective-stack-impl` runner is authorized, after its normal preview and confirmation, to implement as much of the current executable stack as can be validated locally in one sequential Graphite stack. Default branch shape: one branch for neutral helper seams, one branch for the `context-profiler` package extraction, and one branch for the recipe/context rebaseline if extraction succeeds. It may split further when a branch would mix unrelated decisions, but should not combine capability-mirror thinning or runner/terminal disposition into the same stack.

Allowed actions are local repository edits, focused and broad local validation, Objective updates for meaningful evidence, and Graphite branch creation/amend/restack. Do not submit PRs, push, resolve GitHub threads, create hidden ledgers, use Branch Memory as stack state, or perform external write-capable actions unless the user separately asks. Stop and ask if the extraction would require `@sdl/pi` to depend on an extracted Pi-tool package, if package workspace placement conflicts with existing dependency policy, if parity registration cannot stay acyclic, if validation fails for reasons that are not mechanical fixes, or if implementation evidence suggests moving capability domain logic into a Pi-tool package.

## Assumptions and Risks

Assumptions:

- `@sdl/pi` is large because it has accreted multiple feature subsystems, not because all of that code is intrinsically part of the Pi runtime host.
- `context-profiler` remains the best first extraction because its production code has no known Capability-package dependency and its entanglement appears to be mostly Pi helper/runtime usage plus a few reverse imports from sibling Pi views.
- Pi-native tools such as `grill`, `thermo-council`, `runner-subagents`, and `terminal` can be evaluated as packages stacked on `@sdl/pi` even when the final disposition for some of them may be “host runtime primitive” rather than “standalone tool package.”
- Capability mirrors should thin toward owning Capability packages/APIs rather than becoming new Pi-stacked packages; this keeps domain logic out of the Presentation Host and avoids duplicating the architecture parent.
- Project-local `.pi/extensions/*.ts` discovery adapters can preserve registration behavior while implementation packages move, provided dependency direction is designed explicitly.

Risks:

- The `context-profiler` extraction may reveal shared Pi TUI utilities that deserve a neutral helper subpath or small support package before the feature package can move cleanly.
- Moving runner-subagents or terminal too aggressively could extract runtime infrastructure that should remain a neutral Pi helper surface; require disposition evidence before treating them like ordinary tools.
- Capability mirror thinning can overlap with `sdl-extension-architecture` child Objectives; mitigate by spawning or updating capability-specific Objectives instead of silently absorbing their domain migrations here.
- Pi command parity may regress if package extraction changes registration order, command names, tool schemas, acknowledgement behavior, or runtime output plumbing without focused tests.
- The dependency direction can accidentally invert if `@sdl/pi` imports extracted feature packages directly; the intended direction is extracted package → `@sdl/pi`, with registration/discovery designed around that constraint.
- Current context documentation may contain stale path language for `@sdl/pi`; use the actual package path and verify context drift before relying on path prose as evidence.

## Open Questions

- What package naming and workspace location should extracted Pi-native tool packages use: a host-adjacent tier, a Pi-tool tier, or another explicit convention?
- Which shared render, scroll, width, and LM-JSON helpers should remain in `@sdl/pi` as neutral helper subpaths versus move into a separate Pi UI/support package?
- Which of `runner-subagents` and `terminal` are true standalone Pi-native tools versus core Pi runtime/presentation infrastructure that should stay in the host behind neutral exports?
- For PR feedback, Handoff, Branch Context, Objective, and Plans-adjacent Pi surfaces, which remaining logic is presentation-only and which belongs in the owning Capability package/API?
- Should successful extraction of the first two Pi-native tools update `sdl-extension-architecture`, create narrower child Objectives, or remain tracked only here until closure?
