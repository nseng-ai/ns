# ADR 0032: Neutral Infra Admission by External Applicability

## Status

Accepted

## Context

Neutral Infra is the floor below the SDK, but “neutral” cannot mean “performs no I/O.” Process execution, Git, time, and future harness-session infrastructure can be broadly reusable without depending on ns. Purity is useful but too narrow to decide admission.

## Decision

A surface qualifies as Neutral Infra only when both conditions hold:

1. **ns-independent public contract.** Its types, lifecycle, errors, configuration, and dependencies make sense without ns vocabulary or runtime assumptions.
2. **Credible external-consumer scenario.** Review can name a concrete consumer outside ns that would use the surface substantially as-is. Actual adoption is not required, but hypothetical genericity is insufficient.

Neutral Infra may perform real-world I/O. **Pure Utility** is its narrower deterministic, I/O-free subset.

Foundation owns externally credible, ns-independent infrastructure contracts and cohesive implementations. The Extension Kit instead owns first-party ns extension-building substrate and ns-shaped external-tool contracts. I/O alone does not choose between them; contract audience and workflow semantics do.

Admission is prospective and reviewable. Existing Gateway placement does not change merely because a plausible external scenario can be invented. Reclassifying an existing surface requires a focused application of ADR 0019's placement gate and the consumer-channel analysis; the move must preserve dependency direction and delete the old door atomically.

A future contract loses Neutral Infra eligibility if ns-specific routing, workflow policy, or extension vocabulary enters its public surface. Such policy belongs above Foundation.

## Consequences

- `@nseng-ai/foundation/exec` and `@nseng-ai/foundation/git` can honestly remain Neutral Infra despite performing I/O.
- Foundation admission requires written evidence that can be challenged during review.
- Ns-shaped GitHub and Graphite gateways remain Extension Kit concerns absent an explicit reclassification decision.
- Pure Utility remains useful vocabulary without defining the entire tier.

## Alternatives

- **Purity-only Neutral Infra:** rejected because it excludes generic I/O infrastructure.
- **A separate `platform` tier:** rejected because it duplicates Neutral Infra's dependency position.
- **Package allowlists or Foundation exceptions:** rejected because admission is a general contract test.
- **Require actual external adoption:** rejected because adoption is lagging evidence.
- **Bulk-migrate plausibly generic gateways:** rejected because each placement needs its own consumer and channel evidence.
