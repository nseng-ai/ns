# ADR 0049: Rename Foundation to ns-foundation

## Status

Accepted

## Context

`@nseng-ai/foundation` accumulated shared infrastructure and conventions for the ns product family even though ADR 0032 described Foundation as a home only for ns-independent contracts with credible external-consumer scenarios. That admission rule no longer describes the package honestly. Clinkr is the lower, generally applicable CLI layer; the package above it is ns-wide infrastructure, so the existing dependency from Foundation to `@nseng-ai/clinkr` is intentional rather than an inversion.

## Decision

Hard-rename the package to `@nseng-ai/ns-foundation` and its directory to `ts/packages/public/infra/ns-foundation/`, with no forwarding package, compatibility export, alias, or dual-name period. Rename the package as-is: preserve its exports, modules, version, behavior, and runtime dependency on `@nseng-ai/clinkr`. Independently valuable generic infrastructure may be extracted downward or outward in later focused work, but this identity cutover does not redistribute modules.

ADR 0032 remains immutable historical evidence, but its Foundation placement and admission claims are superseded for ns-foundation. Clinkr remains the lower, generally applicable CLI package; ns-foundation owns cohesive shared infrastructure and conventions for multiple packages in the ns product family below workflow-specific behavior.

Temporarily retain `ns.tier: "neutral-infra"`. The tier name and its current ns-independent semantics do not fit ns-foundation's explicit role; repairing the tier taxonomy and reclassifying the package is deferred architecture work, not evidence that ns-foundation is neutral.

## Consequences

- Workspace consumers, release tooling, fixtures, current guidance, and published-package preparation recognize only `@nseng-ai/ns-foundation`.
- The package directory leaf continues to equal its unscoped npm name.
- Existing subpath exports and the `ns-foundation → clinkr` dependency remain intact.
- Future module extraction requires its own ownership and dependency decision; the rename supplies no compatibility residue or presumption that every current resident should remain permanently.
