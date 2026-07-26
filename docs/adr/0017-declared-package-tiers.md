# ADR 0017: Declared Package Tiers

## Status

Accepted

## Context

Package layering must be machine-readable, not reconstructed from directory names or hand-authored architecture reports. Release commitment separate question; must not distort architectural classification.

## Decision

Every TypeScript workspace package declares exactly one architecture tier in `package.json` at `ns.tier`. Current tier IDs:

- `neutral-infra`
- `sdk`
- `extension-kit`
- `extension`
- `host`
- `standalone-tool`
- `internal-tool`

Tier policy is explicit allowed-edge matrix, not numeric rank. TypeScript style guard reads manifests, validates tier IDs, applies edge policy to runtime workspace dependencies, uses declared tier in topology reporting.

Package has one tier, applying to every declared subpackage; `ns.subpackageTiers` and other subpackage overrides invalid. Subpackage needing another tier must become its own package.

Package Tier orthogonal to release disposition. Tier does not project onto any directory segment; disposition does not appear in `ns.tier`. ADR 0045 governs `public/`, `incubating/`, `internal/` paths and their dependency closure independently.

Hosts and tools sit off core extension-layer axis: hosts present, register, or consume extensions; tools may have broader policies without joining Extension Dependency Graph.

## Consequences

- Adding workspace package needs explicit architectural classification.
- Reports and guards share one manifest source of truth.
- Every topology circle in container package inherits owning package's tier.
- Architectural moves and release-disposition moves reviewable independently.

## Alternatives

- **Infer tier from directories:** rejected because directories encode release disposition and ownership, not architecture tier.
- **Numeric rank alone:** rejected because allowed edges are not single total order.
- **Subpackage tier overrides:** rejected because package graph treats package as one distribution and dependency unit.
- **Transitional or backend debt tiers:** rejected; debt tracked explicitly, not made permanent architecture class.
