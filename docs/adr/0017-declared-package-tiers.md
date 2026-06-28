# ADR 0017: Declared package tiers

## Status

Accepted

## Context

ADR 0009 established the Extension Dependency Graph invariant and ADR 0012 refined where domain package layers belong: capability domain lives in Capabilities above the SDK, not in the Pi host, Capability Kit, or SDL kernel. ADR 0016 clarified the GitHub gateway / SDK package boundary.

The architecture topology report already used colors and tier bands to explain this model, but those tiers were editorial per report run. A report spec had to hand-classify packages with abbreviated tier ids, and the TypeScript style guard enforced adjacent concerns (deep capability imports and extension cycles) without a manifest source of truth for package tiering.

The repo now needs package tiering to be explicit enough for tools to validate. New packages should not silently choose their place in the architecture by whoever authored the latest report, and known migration debt should be documented as package-edge debt rather than hidden in prose.

## Decision

Every TypeScript workspace package under `ts/packages/**/package.json` declares its package tier in `sdl.tier`.

The canonical tiers are:

- `capability`
- `capability-kit`
- `sdk`
- `transitional`
- `neutral-infra`
- `host`
- `tool`

Tier policy is an explicit allowed-edge matrix, not a numeric rank. Capability-to-capability edges are allowed when they use curated Capability APIs; host edges are off-axis because hosts present/register/consume capabilities; tool edges are permissive because standalone tooling is not part of the core Extension Dependency Graph. Dependencies on `transitional` are debt: the current consumers are allowlisted as migration debt, and new consumers fail enforcement.

The architecture topology extractor reads and validates `sdl.tier`, emits `packages[name].tier`, and computes `tierViolations` from manifest runtime edges. The report renderer uses declared tiers by default; report specs may override individual tiers only as a presentation exception.

The TypeScript style guard enforces that every workspace package has a known tier and that runtime workspace package edges obey the tier policy unless they are in an explicit package-edge debt allowlist.

## Consequences

- Adding a TypeScript workspace package requires choosing a declared tier.
- Topology reports no longer hand-author the normal tier map; declared manifests are the source of truth.
- Current migration debt remains visible: known hard package edges and current transitional consumers pass only through explicit allowlist entries.
- New upward layer edges and new transitional consumers fail the TypeScript style guard.
- `CONTEXT.md`, `CONTEXT-MAP.md`, report docs, and guard tests carry the same seven-tier vocabulary.

This ADR refines ADR 0009, ADR 0012 domain-package-layer, and ADR 0016; it does not rewrite their historical text.
