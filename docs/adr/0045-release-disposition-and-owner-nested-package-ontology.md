# ADR 0045: Release Disposition and Owner-Nested Package Ontology

## Status

Accepted

## Context

Package path must communicate release commitment without pretending to be architecture-tier source of truth. Must also show architectural ownership, especially for host-specific integration, while keeping npm identity and dependency closure mechanically checkable.

## Decision

First segment below `ts/packages/` is exactly one path-derived **release disposition**:

- `public/`: warranted for external release and ongoing support;
- `incubating/`: genuine external release intent; contract or evidence not yet warranted; or
- `internal/`: repository-operating code with no current external release intent, not publication waiting room.

Disposition is not manifest field, allowlist, or Package Tier. `ns.tier` stays independent architectural classification governed by ADR 0017; does not project onto directories.

Paths below disposition root express ownership. Shared owners include `infra/`, `extensions/`, `tools/`; host-specific packages nest under `hosts/<host>/`; repository machinery nests under `internal/dev/`. Singular product boundaries such as `public/ns`, `public/sdk`, `public/extension-kit` are direct leaves. Each host owns its category vocabulary; Pi currently uses `runtime/`, `extensions/`, `tools/`, `subagents/`.

Every package leaf equals unscoped npm package name, globally unique across dispositions. Public and incubating packages use `@nseng-ai/<leaf>`. Internal packages use `@internal/<leaf>`, are `private: true`, never published. Parent directories do not prefix npm identity. Identity changes are hard cutovers: no forwarding packages, compatibility exports, old-name aliases.

Runtime workspace dependencies obey disposition closure:

| Consumer   | Allowed providers            |
| ---------- | ---------------------------- |
| public     | public                       |
| incubating | public, incubating           |
| internal   | public, incubating, internal |

Rule covers `dependencies`, `optionalDependencies`, `peerDependencies`; peer declarations are runtime edges for closure even when individual installation treats them as optional. Development-only edges may cross inward when tooling can distinguish them mechanically. `NS_TS_PACKAGE_DISPOSITION_TOPOLOGY` enforces roots, leaf/name identity, global leaf uniqueness, scope/private coupling, closure from one package-topology model. `ts/packages/README.md` is authoritative operational contract.

Ns extensions are harness-independent domain owners. Host integrations over ns extension belong in separately owned host packages, named `pi-ns-<domain>` for Pi adapters, and consume only curated extension package APIs. Pi-native integrations use natural Pi-facing names. Accepted ontology requires this separation even while current tree still contains extension-owned `pi` subpackages awaiting extraction; those are incomplete migration, not second destination model.

Checkout-free product package is `public/ns`; SDK and Extension Kit keep their own direct public leaves. Disposition changes are deliberate release decisions expressed as path moves. Public means release warrant, not TypeScript visibility or proof that version is already on npm.

## Consequences

- `ls ts/packages/` communicates release commitment first, ownership second.
- Promotion from incubating to public requires accepting support commitment and public dependency closure.
- Promotion from internal additionally requires npm identity/scope cutover.
- Package Tier, subpackage topology, release disposition stay simultaneous independent constraints.
- Host extraction cannot justify private deep imports; it blocks until owner exposes curated package API.

## Alternatives

- **Tier-projected role directories:** rejected: architecture role and release commitment are independent axes.
- **Flat incubator exception:** rejected: hides ownership, makes closure awkward.
- **Disposition manifest field or allowlist:** rejected: path is sole disposition declaration.
- **Mixed old/new ontology or forwarding identities:** rejected: leaves discovery and ownership ambiguous.
- **Keep Pi presentation inside ns extensions permanently:** rejected: harness integration has distinct owner and dependency boundary.
