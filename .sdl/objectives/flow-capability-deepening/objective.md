# Flow Capability Deepening

## Thesis

Flow should become the reference first-party Capability: a package with a thin SDL command face, a curated `sdl-flow/api` Capability API for in-process consumers, and gateway-injected domain cores that are easier to test and evolve than command-shell or argv-scripted orchestration.

The prior `flow-capability-layer-cleanup` Objective moved misplaced Flow domain policy into the Flow package and closed. PR #2379 then narrowed `sdl-flow/api` from a broad compatibility barrel into cohesive runtime operations, removed CCC land-stack mirror wrappers, removed unused Flow non-command package exports, and moved Flow land-stack tests into the Flow package. This Objective tracks the next restructuring stage: deepen Flow internals without re-widening the public API.

## Scope

- Keep `sdl-flow/api` narrow: expose cohesive runtime operations and signature-required types for CCC/consumer use, not land-stack helper modules, presentation helpers, constants, error constructors, or internal test seams.
- Split the relocated land-stack tests into ownership-focused Flow test files so helper coverage lives near the modules it verifies and review diffs stop depending on one oversized test file.
- Decompose large Flow land modules, especially `ts/packages/capabilities/flow/src/land.ts` and `src/land-stack.ts`, into clearer command-shell, orchestration, presentation, preflight, merge-loop, cleanup, and Graphite/GitHub fact seams.
- Introduce gateway-injected land/land-stack domain seams where they reduce argv-scripted tests and align with the repository's Capability architecture: raw `SdlExtensionApi`/`exec` adaptation belongs at the command shell edge; domain logic should consume typed gateways or focused collaborators.
- Clean up CCC-era residue now living under Flow, such as test/temp naming and helper names, while preserving durable compatibility where names are user-visible or stored state.
- Add or update Flow package context vocabulary so future agents understand Flow's command face, Capability API, land-stack ownership, submit/autobranch boundaries, and CCC consumption boundary.
- Keep behavior-preservation evidence: user-facing `sdl flow ...` commands, Pi mirrors, land-stack safety behavior, and PR #2379 API narrowing should remain stable unless a later explicit decision changes them.

## Non-Goals

- Do not broaden `sdl-flow/api` back into a compatibility barrel to make internal tests or CCC wrappers convenient.
- Do not move Flow domain logic down into `@sdl/core`, `@sdl/graphite`, `@sdl/kernel`, `sdl-sdk`, or `@sdl/pi`. Neutral packages may keep protocol/mechanics helpers only.
- Do not introduce a generic GitHub or Graphite Capability as part of this Objective.
- Do not change durable backup-ref namespaces or other persisted/user-visible names merely to remove CCC wording unless compatibility and migration behavior are explicitly designed.
- Do not redesign the public `sdl flow` command family or Pi mirror command names except as a separately approved product/API decision.
- Do not treat validation commands, CI status, or Graphite PR mechanics as roadmap work; record them only as evidence for semantic rows.

## Completion Criteria

- Land-stack test coverage is split into focused Flow-owned test files, with no CCC tests importing Flow private land-stack helpers and no reliance on CCC mirror wrappers.
- `src/land.ts` and `src/land-stack.ts` are reduced to readable shells/orchestrators over smaller owned modules; module boundaries match domain concepts rather than historical CCC wrapper structure.
- Land/land-stack core behavior has at least one meaningful gateway-injected or collaborator-injected seam that replaces brittle command-argv scripting for important domain paths, with fake-driven tests proving the seam.
- `sdl-flow/api` remains narrow and search evidence shows it does not export land-stack implementation helpers, constants, presentation helpers, error constructors, stack facts, worktree helpers, PR facts, landing-plan helpers, or merge-loop phases.
- Flow package exports remain limited to `./api` plus command-loader entries unless a new subpath has an explicit Capability API rationale.
- CCC runtime/facade code consumes Flow only through `sdl-flow/api` or command execution, not private Flow internals or deleted mirror paths.
- Flow context documentation exists or is refreshed, and root context/map wording no longer leaves Flow's current ownership ambiguous.
- Completion evidence includes targeted Flow/CCC tests, TypeScript checks/style guards relevant to import boundaries, and search evidence for API/export cleanliness.

## Assumptions and Risks

Assumptions:

- PR #2379's API narrowing is the new baseline: `sdl-flow/api` should stay cohesive and consumer-oriented while Flow internals remain package-private.
- The large land-stack test file can be split mostly mechanically before deeper runtime refactors, reducing risk for later architectural changes.
- Land/land-stack behavior is Flow domain even when CCC or Pi presents or composes it; CCC should remain a consumer/composer, not the owner of land internals.
- Some CCC-era names are only historical implementation residue and can be renamed; others, such as backup refs, may be durable compatibility surfaces and need explicit treatment.

Risks:

- Land-stack safety behavior is mutation-heavy and Graphite/GitHub-sensitive; over-eager refactoring could weaken guardrails or hide confirmation/cleanup semantics.
- Gateway extraction may over-abstract if it is not shaped by concrete tests and current land-stack phases.
- Splitting tests without improving seams could create many files that still share brittle fixtures. Prefer splits that reveal ownership and make later fake-driven seams easier.
- Context/documentation updates could overclaim the target state before code catches up; keep wording accurate about current state versus direction.
- Existing Objective prose and historical updates may still describe old CCC ownership; do not rewrite history, but add current-state context where forward guidance matters.

## Open Questions

- What is the smallest useful land-stack domain gateway set: one `LandingGateway`, several focused gateways for Git/Graphite/GitHub/worktrees, or collaborator objects around existing phases?
- Should the single-PR land path and stack land path share a deeper `LandingWorkflow`, or should they remain separate strategies behind a small dispatch layer?
- Which CCC-era persisted names are compatibility contracts, and which are safe internal renames?
- Should Flow expose any additional cohesive Capability API operation after land-stack deepening, or is `executeStackLanding` still sufficient for current consumers?
