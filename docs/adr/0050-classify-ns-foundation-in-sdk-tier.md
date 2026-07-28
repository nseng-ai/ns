# ADR 0050: Classify ns-foundation in the SDK Tier

## Status

Accepted

## Context

ADR 0049 renamed Foundation to `@nseng-ai/ns-foundation` and established its role as cohesive shared infrastructure and conventions for the ns product family below workflow-specific behavior. It deliberately retained `ns.tier: "neutral-infra"` only temporarily because Neutral Infra means generally applicable, ns-independent infrastructure and therefore does not describe ns-foundation honestly.

The live tier taxonomy already has an `sdk` tier immediately above Neutral Infra and below the Extension Kit. ns-foundation's current dependency position belongs there: it may depend on generally applicable infrastructure such as `@nseng-ai/clinkr`, and extensions and extension-building substrate may depend on it. A new tier is not yet justified by a distinct dependency rule.

## Decision

Classify `@nseng-ai/ns-foundation` as `ns.tier: "sdk"` for now.

Tier membership describes dependency position, not package identity or API role. ns-foundation remains the shared infrastructure and conventions package for the ns product family. `@nseng-ai/sdk` remains the author-facing SDK and host-service boundary. Sharing the `sdk` tier does not permit either package to absorb the other's responsibilities.

Keep the existing tier taxonomy and rank unchanged. Reconsider a distinct tier only if later package work demonstrates a dependency rule that the current `sdk` tier cannot express.

## Consequences

- Neutral Infra once again describes only the generally applicable floor, currently exemplified by Clinkr.
- ns-foundation and `@nseng-ai/sdk` may depend on each other under same-tier layering rules; package ownership and cycle checks remain the controls against inappropriate coupling.
- Existing ns-foundation exports, modules, dependencies, path, release disposition, and behavior do not change.
- Brmem's existing dependency on ns-foundation becomes an explicit tier-debt edge while Brmem remains `neutral-infra`; its classification will be revisited during the planned Brmem README-driven package pass.
- ADR 0049 remains the rename and package-role decision; this ADR resolves the classification work it deferred.
