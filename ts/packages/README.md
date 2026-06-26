# TypeScript Package Taxonomy

This tree is part architecture map and part migration task list.

## Top-level packages

- `sdl/` is the SDL kernel and CLI package. It stays top-level by design.
- `sdl-capability-kit/` is the first-party Capability Kit substrate (`@sdl/capability-kit`). It stays top-level by design and does not need a category wrapper.
- Capability packages that have not completed the capability-extension shape intentionally remain top-level. Absence from `capabilities/` is a task-list signal, not neglect.
- `ccc` is a capability, not a separate orchestrator category. It moves to `capabilities/ccc` only after its own conversion is complete.

## Category directories

- `infra/` contains below-SDK neutral packages such as core primitives, CLI framework support, Branch Memory, Graphite support, and transitional domain primitives. `domain-primitives-transitional` is temporary debt even though it belongs below the SDK.
- `capabilities/` contains completed or explicitly certified first-party capability extensions only. Moving a package here is part of the Definition of Done for that capability migration.
- `hosts/` contains presentation/runtime hosts such as Pi and `sdlcc`.
- `tools/` contains standalone tools that are off the capability-extension completion axis.

Package names, public import specifiers, binary names, and workspace dependency names are independent of this filesystem taxonomy and should remain stable unless an explicit package-rename plan says otherwise.
