# ADR 0032: Neutral Infra Admission by External Applicability

## Status

Accepted

## Context

Neutral Infra is floor below SDK, but “neutral” cannot mean “performs no I/O.” Process execution, Git, time, future harness-session infrastructure can be broadly reusable without depending on ns. Purity useful but too narrow to decide admission.

## Decision

Surface qualifies as Neutral Infra only when both conditions hold:

1. **ns-independent public contract.** Its types, lifecycle, errors, configuration, dependencies make sense without ns vocabulary or runtime assumptions.
2. **Credible external-consumer scenario.** Review can name concrete consumer outside ns that would use surface substantially as-is. Actual adoption not required; hypothetical genericity insufficient.

Neutral Infra may perform real-world I/O. **Pure Utility** is its narrower deterministic, I/O-free subset.

Foundation owns externally credible, ns-independent infrastructure contracts and cohesive implementations. Extension Kit owns first-party ns extension-building substrate and ns-shaped external-tool contracts. I/O alone does not choose between them; contract audience and workflow semantics do.

Admission is prospective and reviewable. Existing Gateway placement does not change merely because plausible external scenario can be invented. Reclassifying existing surface requires focused application of ADR 0019's placement gate and consumer-channel analysis; move must preserve dependency direction and delete old door atomically.

Future contract loses Neutral Infra eligibility if ns-specific routing, workflow policy, or extension vocabulary enters its public surface. Such policy belongs above Foundation.

## Consequences

- `@nseng-ai/foundation/exec` and `@nseng-ai/foundation/git` stay Neutral Infra despite performing I/O.
- Foundation admission requires written evidence, challengeable during review.
- Ns-shaped GitHub and Graphite gateways stay Extension Kit concerns absent explicit reclassification decision.
- Pure Utility stays useful vocabulary without defining entire tier.

## Alternatives

- **Purity-only Neutral Infra:** rejected; excludes generic I/O infrastructure.
- **A separate `platform` tier:** rejected; duplicates Neutral Infra's dependency position.
- **Package allowlists or Foundation exceptions:** rejected; admission is general contract test.
- **Require actual external adoption:** rejected; adoption is lagging evidence.
- **Bulk-migrate plausibly generic gateways:** rejected; each placement needs its own consumer and channel evidence.
