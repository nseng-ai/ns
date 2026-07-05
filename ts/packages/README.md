# TypeScript Package Taxonomy

This tree is part architecture map and part migration task list.

Structure *inside* a container package — which units earn `ns.subpackages` rank, naming, and importer rules — is governed by [`docs/conventions/subpackage-conventions.md`](../../docs/conventions/subpackage-conventions.md) (ADR 0022/0023).

## Top-level packages

- `kernel/` is the ns kernel and CLI package. It stays top-level by design. Some legacy directory names remain as migration residue until a focused path-move slice removes them.
- `capability-kit/` is the first-party Capability Kit substrate (`@ns/capability-kit`). It stays top-level by design and does not need a category wrapper.
- Capability packages move under `capabilities/` either when certified standalone (`plans`, `address`, `aretro`) or during their container conversion slices. Remaining top-level capability packages are migration residue.
- `ccc` is a capability, not a separate orchestrator category. It moves to `capabilities/ccc` only during its own conversion slice.

## Category directories

- `infra/` contains below-SDK neutral packages such as core primitives, CLI framework support, Branch Memory, and Graphite support. The former transitional domain-primitives package has been deleted; shared first-party capability-building primitives now live under precise `@ns/capability-kit/*` subpaths.
- `capabilities/` contains first-party capabilities that are already in the category directory, including standalone capabilities and converted/certified capability extensions.
- `hosts/` contains presentation/runtime hosts such as Pi and `nscc`.
- `capability-pi/` contains Pi command/presentation packages attached to first-party capabilities. They depend on the owning capability APIs plus neutral Pi host helper subpaths, and project-local `.pi/extensions/*` discovery adapters import them directly.
- `internal/` contains tested, repo-internal tooling under the reserved `@internal/*` scope — package-grade code that exists only to operate this repo, not to ship as part of ns-the-product. It is the middle rung between `.ns/*` prototypes and platform packages.
  - **Promotion ladder:** `.ns/*` prototype → `packages/internal/*` (tested workspace citizen) → platform package. An internal package is the tested home for consumer-side tooling that has outgrown an in-place `.ns/*` prototype but is not yet (or never will be) a platform capability; if it earns platform status it graduates out of the space. See [`docs/conventions/platform-and-consumer.md`](../../docs/conventions/platform-and-consumer.md).
  - **`internal/` vs `tools/`:** `internal/` packages are enforced to have no outside runtime dependents and are never published; `tools/` packages are standalone and potentially shippable. Choose `internal/` for repo-operating machinery, `tools/` for anything meant to stand on its own.
  - **Dependency semantics:** runtime dependencies (`dependencies`, `optionalDependencies`, `peerDependencies`) on `internal/*` from outside the space are banned inbound, enforced by the style-guard rule `NS_TS_INTERNAL_SPACE_ADMISSION` (path↔scope coupling, mandatory `private: true`, no outside runtime dependents). `devDependencies` and test-only consumption are allowed — the root `ts/package.json` consumes `@internal/pi-tools` as a `devDependency`, the sanctioned carve-out.
- `tools/` contains standalone tools that are off the capability-extension completion axis.

Package names, public import specifiers, binary names, and workspace dependency names are independent of this filesystem taxonomy and should remain stable unless an explicit package-rename plan says otherwise.
