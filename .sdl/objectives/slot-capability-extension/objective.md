# Slot Capability Extension

## Thesis

Slot should become an above-SDK capability extension with a curated `@sdl/slot/api` Peer API for sibling consumers such as `ccc`, a future command face for SDL/Pi surfaces where appropriate, and gateway-injected domain cores that preserve the existing standalone `slot` CLI while migration proceeds incrementally.

## Scope

- Establish `@sdl/slot/api` as the curated Peer API surface for in-process first-party consumers.
- Keep the standalone `slot` CLI stable while programmatic consumers migrate away from subprocess JSON parsing.
- Decide the future command-face strategy for Slot, including how the current standalone CLI relates to any SDL/Pi command faces.
- Migrate `ccc` Slot consumers to Peer APIs rather than CLI/process boundaries or `@sdl/slot/src/...` internals.
- Decide and migrate `slot gt` stack-discovery/free-stack needs only after the checkout slice proves the Peer API pattern.
- Document Slot vocabulary and above-SDK boundaries when the migration needs durable Slot-specific language.

## Non-Goals

- Do not remove or deprecate the existing standalone `slot` CLI during the first Peer API slices.
- Do not remove or deprecate standalone `slot`; any SDL command face must preserve documented compatibility and ownership boundaries.
- Do not make sibling packages deep-import Slot internals.
- Do not treat CLI JSON invocation as the Peer API.

## Completion Criteria

- Slot has an above-SDK command/Peer API architecture consistent with ADR 0009.
- `ccc` consumes Slot through curated Peer APIs for machine decisions instead of subprocess parsing or internals.
- The standalone `slot` CLI compatibility story is documented and tested.
- Slot stack/navigation capabilities have explicit Peer API or command-face dispositions.
- Slot-specific context/docs explain the boundary for future implementers.
