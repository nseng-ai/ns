# TypeScript Package Taxonomy

This tree is part architecture map and part migration task list.

Structure *inside* a container package — which units earn `ns.subpackages` rank, naming, and importer rules — is governed by [`docs/conventions/subpackage-conventions.md`](../../docs/conventions/subpackage-conventions.md) (ADR 0022/0023).

## Top-level packages

- `sdl/` is the ji kernel and CLI package. It stays top-level by design.
- `capability-kit/` is the first-party Capability Kit substrate (`@ns/capability-kit`). It stays top-level by design and does not need a category wrapper.
- Capability packages move under `capabilities/` either when certified standalone (`plans`, `address`, `aretro`) or during their container conversion slices. Remaining top-level capability packages are migration residue.
- `ccc` is a capability, not a separate orchestrator category. It moves to `capabilities/ccc` only during its own conversion slice.

## Category directories

- `infra/` contains below-SDK neutral packages such as core primitives, CLI framework support, Branch Memory, and Graphite support. The former transitional domain-primitives package has been deleted; shared first-party capability-building primitives now live under precise `@ns/capability-kit/*` subpaths.
- `capabilities/` contains first-party capabilities that are already in the category directory, including standalone capabilities and converted/certified capability extensions.
- `hosts/` contains presentation/runtime hosts such as Pi and `nscc`.
- `capability-pi/` contains Pi command/presentation packages attached to first-party capabilities. They depend on the owning capability APIs plus neutral Pi host helper subpaths, and project-local `.pi/extensions/*` discovery adapters import them directly.
- `internal/` contains private, project-local Pi-native tools under the reserved `@internal/*` scope. They are not ji capabilities, not public CLIs, and not distribution packages. They are registered only through this repository's `.pi/extensions/*` discovery adapters.
- `tools/` contains standalone tools that are off the capability-extension completion axis.

Package names, public import specifiers, binary names, and workspace dependency names are independent of this filesystem taxonomy and should remain stable unless an explicit package-rename plan says otherwise.
