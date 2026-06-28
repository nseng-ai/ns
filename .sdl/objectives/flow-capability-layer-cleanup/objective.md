# Flow Capability Layer Cleanup

## Thesis

Flow-owned workflow domain should live in the Flow Capability, not in neutral infra packages that make submit, PR-description, and autobranch policy look reusable below the SDK. This Objective moves the highest-priority misplacements from the architecture audit into the appropriate layers: Flow owns submit/autobranch domain and exposes curated in-process behavior to CCC through a Flow Capability API, while `@sdl/capability-kit` owns shared capability substrate such as gateway result/error shapes and common `SdlExtensionApi`-to-gateway adapter patterns.

This is a focused child slice of the broader `sdl-extension-architecture` Objective. It implements that parent Objective's layering rule for the Flow/autobranch/submit cluster without reopening unrelated capability migrations.

## Scope

- Relocate `@sdl/core/submit` domain and gateway seams out of neutral infra where they are Flow policy: PR-description generation policy, submit-related gateway seams, prompt/model envs, generated-region markers, `GithubPrGateway`, `TextGenerator`, and associated orchestration that only exists to support Flow submit/regenerate-PR behavior.
- Relocate `@sdl/graphite/submit` submit orchestration out of neutral infra where it is Flow workflow policy: submit/restack behavior, PR metadata prewrite, failure transcript shaping, and Flow-facing submit command orchestration.
- Fold `@sdl/autobranch` into Flow ownership. Autobranch branch creation, latest-commit/autobranch flows, checkpoint-message preparation, and related failure policy are Flow/CCC workflow domain, not neutral infrastructure.
- Establish or extend a curated Flow Capability API for CCC-needed autobranch/submit behavior so CCC consumes Flow as a provider capability rather than importing `@sdl/autobranch/*` or other misplaced internals directly.
- Move shared capability gateway result/error shapes and command-failure helpers that are capability-substrate concepts into `@sdl/capability-kit`, while preserving any truly generic `Result` helper in `@sdl/core` when standalone tools still need it.
- Add common `SdlExtensionApi` to gateway/runtime adapter construction patterns to `@sdl/capability-kit` when they are capability-agnostic. The Capability Kit should own adapter construction patterns, not submit/autobranch domain logic.
- Update package manifests, export maps, TypeScript style-guard/package-tier expectations, tests, and relevant context/docs so declared tiers match the resulting architecture.

## Non-Goals

- Do not move all gateways into `@sdl/capability-kit`. `GitGateway`, exec primitives, Graphite metadata/stack/status mechanics, and GitHub identity/status/low-level feedback mechanics may remain neutral infra when they are reusable external-protocol mechanics rather than capability policy.
- Do not introduce a generic GitHub capability. ADR 0016 keeps GitHub identity/status and real feedback mechanics in neutral infra while capability-facing seams are owned by the relevant capability.
- Do not move `@sdl/brmem` or Branch Memory storage primitives as part of this Objective.
- Do not use this Objective to clean up `@sdl/cmux` Pi-shaped type placement or `@sdl/core/brmem-cli`; those are separate follow-ups unless they directly block this migration.
- Do not reopen completed Slot, Objective, Branch Context/Plans, Address, or Aretro child Objectives.
- Do not add execution policy or autonomous runner rules; this Objective is planning-first and can be implemented through ordinary confirmed Objective work.

## Completion Criteria

- `@sdl/core/submit` no longer exports Flow-owned submit/PR-description policy or capability-facing submit seams from neutral infra; any remaining core code is demonstrably reusable protocol/mechanics with no Flow policy.
- `@sdl/graphite/submit` no longer owns Flow submit orchestration; Graphite-neutral branch, metadata, stack, status, and low-level command mechanics remain in `@sdl/graphite` where appropriate.
- `@sdl/autobranch` is no longer declared or treated as neutral infra. Its domain behavior is owned by Flow, and stale package/export/style-guard allowances are removed or reclassified.
- CCC imports Flow-owned autobranch/submit behavior through a curated Flow Capability API rather than through `@sdl/autobranch/*`, `@sdl/core/submit`, `@sdl/graphite/submit`, or private/deep Flow internals.
- Capability gateway result/error shapes and reusable command-failure helpers used as capability substrate are available from `@sdl/capability-kit`; capability consumers no longer rely on submit-specific neutral-infra result aliases for that purpose.
- Package `sdl.tier` declarations, package manifests, export maps, and TypeScript style guard expectations reflect the new layering and do not carry obsolete neutral-infra exceptions for the moved Flow domain.
- Relevant docs/context/ADRs references are updated or annotated so forward guidance matches the new Flow/Capability Kit boundary while historical Semantic Updates remain historical fact.
- Completion evidence includes targeted tests for the moved Flow behavior, Capability API consumer coverage for CCC-facing paths, and the relevant repo checks/style guards needed to prove import and tier boundaries.

## Assumptions and Risks

Assumptions:

- The submit/PR-description and autobranch code currently in `@sdl/core/submit`, `@sdl/graphite/submit`, and `@sdl/autobranch` is primarily Flow/CCC workflow policy, not a stable third-party or cross-capability substrate.
- Any genuinely reusable GitHub, Git, and Graphite protocol mechanics can be separated from Flow policy without forcing an upward dependency from neutral infra into Flow.
- A Flow Capability API is the right in-process seam for CCC's needs, consistent with ADR 0009/0012's consumer/provider model.
- Standalone tools that currently import generic `Result` from `@sdl/core/result` can continue to do so, or can be migrated without pulling capability-specific gateway semantics below the SDK.

Risks:

- The existing submit code may interleave protocol mechanics and Flow policy more tightly than the audit suggests, making a clean split require intermediate compatibility exports or several small PRs.
- Moving autobranch into Flow may expose broader CCC clean-consumer coupling than this Objective intends to own; if that happens, keep the Flow API seam in scope but park unrelated CCC orchestration cleanup.
- Package export-map and jiti/module-loader assumptions may hide stale aliases to `@sdl/core/submit`, `@sdl/graphite/submit`, or `@sdl/autobranch/*`; stale-edge searches and style-guard updates are required completion evidence.
- Over-promoting helpers to `@sdl/capability-kit` could turn the kit into a second domain home. The kit must stay capability-agnostic: adapters and shared result/error shapes only.

## Open Questions

- What is the exact name and shape of Flow's curated Capability API subpath for CCC consumption, and should it cover both submit and autobranch in one surface or separate cohesive exports?
- Which pieces, if any, of the current `RealGithubPrGateway` / PR-description implementation are reusable lower-level mechanics that should remain in `@sdl/core` after Flow owns the seam and policy?
- Does moving `@sdl/graphite/submit` reveal Graphite helper functions that should be retained as neutral non-submit primitives under existing `@sdl/graphite` subpaths?
- Can `@sdl/autobranch` be deleted as a package in one cutover, or is a short-lived re-export/compatibility step useful inside the private workspace while consumers are repointed?
