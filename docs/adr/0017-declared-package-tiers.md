# ADR 0017: Declared Package Tiers

## Status

Accepted

## Context

Package layering must be machine-readable rather than reconstructed from directory names or hand-authored architecture reports. Release commitment is a separate question and must not distort architectural classification.

## Decision

Every TypeScript workspace package declares exactly one architecture tier in `package.json` at `ns.tier`. The current tier IDs are:

- `neutral-infra`
- `sdk`
- `extension-kit`
- `extension`
- `host`
- `standalone-tool`
- `internal-tool`

Tier policy is an explicit allowed-edge matrix, not a numeric rank. The TypeScript style guard reads manifests, validates tier IDs, applies the edge policy to runtime workspace dependencies, and uses the declared tier in topology reporting.

A package has one tier. Its tier applies to every declared subpackage; `ns.subpackageTiers` and other subpackage overrides are invalid. If a subpackage genuinely needs another tier, it must become its own package.

Package Tier is orthogonal to release disposition. Tier does not project onto any directory segment and disposition does not appear in `ns.tier`; ADR 0045 governs `public/`, `incubating/`, and `internal/` paths and their dependency closure independently.

Hosts and tools are off the core extension-layer axis: hosts present, register, or consume extensions, while tools may have broader policies without becoming members of the Extension Dependency Graph.

## Consequences

- Adding a workspace package requires an explicit architectural classification.
- Reports and guards share one manifest source of truth.
- Every topology circle in a container package inherits the owning package's tier.
- Architectural moves and release-disposition moves can be reviewed independently.

## Alternatives

- **Infer tier from directories:** rejected because directories encode release disposition and ownership, not architecture tier.
- **Numeric rank alone:** rejected because allowed edges are not a single total order.
- **Subpackage tier overrides:** rejected because the package graph treats a package as one distribution and dependency unit.
- **Transitional or backend debt tiers:** rejected; debt is tracked explicitly rather than made a permanent architecture class.
