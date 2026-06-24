# Slot Capability Extension

## Thesis

Slot should become an above-SDK capability extension with a curated `@sdl/slot/api` Peer API for sibling consumers such as `ccc` and `sdlcc`, an SDL-owned Slot command face for human/agent CLI usage, and gateway-injected domain cores that keep Slot implementation ownership in `@sdl/slot` while exposing supported command access through `sdl slot ...`.

## Scope

- Establish `@sdl/slot/api` as the curated Peer API surface for in-process first-party consumers.
- Route supported Slot command-line usage through `sdl slot ...`; keep `@sdl/slot` as the implementation, operation, and Peer API owner rather than merging Slot into the SDL kernel.
- Decide and maintain the Slot command-face strategy, including shell/navigation semantics under the SDL surface.
- Migrate in-process sibling Slot consumers such as `ccc` and `sdlcc` to Peer APIs rather than CLI/process boundaries or `@sdl/slot/src/...` internals.
- Decide and migrate `sdl slot gt` stack-discovery/free-stack needs only after the checkout slice proves the Peer API pattern.
- Document Slot vocabulary and above-SDK boundaries when the migration needs durable Slot-specific language.

## Non-Goals

- Do not merge Slot domain logic into `@sdl/sdl`; the SDL command face should mount Slot's owned command implementation.
- Do not reintroduce a standalone `slot` compatibility shim unless a future Objective explicitly changes the hard-cutover decision.
- Do not make sibling packages deep-import Slot internals.
- Do not treat CLI JSON invocation as the Peer API.

## Completion Criteria

- Slot has an above-SDK command/Peer API architecture consistent with ADR 0009.
- In-process sibling consumers such as `ccc` and `sdlcc` consume Slot through curated Peer APIs for machine decisions instead of subprocess parsing or internals.
- The `sdl slot ...` CLI-only compatibility story is documented and tested, including removal of the standalone `slot` executable and standalone shell/completion surfaces.
- Slot stack/navigation capabilities have explicit Peer API or command-face dispositions.
- Slot-specific context/docs explain the boundary for future implementers.

## Assumptions and Risks

- De-risked: `@sdl/slot/api` can be consumed by `sdlcc` without introducing a package dependency cycle; PR #2131 adds the dependency and validates the workspace.
- Still active: Slot vocabulary/context documentation remains the durable boundary-setting follow-up now that command-face and Peer API dispositions are mostly settled.

## Open Questions

- What exact Slot vocabulary/context document shape should future implementers use for the above-SDK boundary?
