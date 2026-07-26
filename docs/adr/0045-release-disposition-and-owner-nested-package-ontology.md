# ADR 0045: Release Disposition and Owner-Nested Package Ontology

## Status

Accepted

## Context

A package path must communicate release commitment without pretending to be the architecture-tier source of truth. It must also show architectural ownership, especially for host-specific integration, while keeping npm identity and dependency closure mechanically checkable.

## Decision

The first segment below `ts/packages/` is exactly one path-derived **release disposition**:

- `public/`: warranted for external release and ongoing support;
- `incubating/`: genuine external release intent, but the contract or evidence is not yet warranted; or
- `internal/`: repository-operating code with no current external release intent, not a publication waiting room.

Disposition is not a manifest field, allowlist, or Package Tier. `ns.tier` remains the independent architectural classification governed by ADR 0017 and does not project onto directories.

Paths below the disposition root express ownership. Shared owners include `infra/`, `extensions/`, and `tools/`; host-specific packages nest under `hosts/<host>/`; repository machinery nests under `internal/dev/`. Singular product boundaries such as `public/ns`, `public/sdk`, and `public/extension-kit` are direct leaves. Each host owns its category vocabulary; Pi currently uses `runtime/`, `extensions/`, `tools/`, and `subagents/`.

Every package leaf equals the unscoped npm package name and is globally unique across dispositions. Public and incubating packages use `@nseng-ai/<leaf>`. Internal packages use `@internal/<leaf>`, are `private: true`, and are never published. Parent directories do not prefix npm identity. Identity changes are hard cutovers without forwarding packages, compatibility exports, or old-name aliases.

Runtime workspace dependencies obey disposition closure:

| Consumer   | Allowed providers            |
| ---------- | ---------------------------- |
| public     | public                       |
| incubating | public, incubating           |
| internal   | public, incubating, internal |

The rule covers `dependencies`, `optionalDependencies`, and `peerDependencies`; peer declarations are runtime edges for closure even when an individual installation treats them as optional. Development-only edges may cross inward when tooling can distinguish them mechanically. `NS_TS_PACKAGE_DISPOSITION_TOPOLOGY` enforces roots, leaf/name identity, global leaf uniqueness, scope/private coupling, and closure from one package-topology model. `ts/packages/README.md` is the authoritative operational contract.

Ns extensions are harness-independent domain owners. Host integrations over an ns extension belong in separately owned host packages, named `pi-ns-<domain>` for Pi adapters, and consume only curated extension package APIs. Pi-native integrations use natural Pi-facing names. The accepted ontology requires this separation even while the current tree still contains extension-owned `pi` subpackages awaiting extraction; those are incomplete migration, not a second destination model.

The checkout-free product package is `public/ns`; SDK and Extension Kit retain their own direct public leaves. Disposition changes are deliberate release decisions expressed as path moves. Public means release warrant, not TypeScript visibility or proof that a version is already on npm.

## Consequences

- `ls ts/packages/` communicates release commitment first and ownership second.
- Promotion from incubating to public requires accepting support commitment and public dependency closure.
- Promotion from internal additionally requires an npm identity/scope cutover.
- Package Tier, subpackage topology, and release disposition remain simultaneous independent constraints.
- Host extraction cannot justify private deep imports; it blocks until the owner exposes a curated package API.

## Alternatives

- **Tier-projected role directories:** rejected because architecture role and release commitment are independent axes.
- **Flat incubator exception:** rejected because it hides ownership and makes closure awkward.
- **Disposition manifest field or allowlist:** rejected because path is the sole disposition declaration.
- **Mixed old/new ontology or forwarding identities:** rejected because it leaves discovery and ownership ambiguous.
- **Keep Pi presentation inside ns extensions permanently:** rejected because harness integration has a distinct owner and dependency boundary.
