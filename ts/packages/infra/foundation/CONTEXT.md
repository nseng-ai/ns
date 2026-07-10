# @nseng-ai/foundation

`@nseng-ai/foundation` is the Neutral Infra container package for generic infrastructure with ns-independent contracts — Pure Utilities plus I/O-performing surfaces such as process execution — exposed as precise public subpath doors rather than one façade. Admission and boundary decisions live in ADR 0032; this glossary carries the package's terms only.

## Language

**Foundation Infrastructure**:
A surface owned by `@nseng-ai/foundation` because its public contract is ns-independent and its design states a credible external-consumer scenario; it may perform real-world I/O. Capability-specific policy, ns workflow semantics, and ns extension-building substrate are excluded regardless of genericity.
*Avoid*: pure-utility-only foundation, dumping ground for generic-looking helpers, Capability Kit substitute.

**ns-Independent Contract**:
A public contract whose types, lifecycle, errors, configuration, and dependencies make sense without ns vocabulary or ns runtime assumptions — the first half of the ADR 0032 admission test.
*Avoid*: merely unbranded naming, contract that leaks ns result or workflow types.

**External-Consumer Scenario**:
The concrete, reviewable prose scenario in which a consumer outside ns would use a surface as-is — the second half of the ADR 0032 admission test. Actual external adoption is not required; hypothetical genericity without a stated scenario is insufficient.
*Avoid*: "could be useful someday", adoption metrics requirement.

**API-Kind Foundation Subpackage**:
A declared foundation subpackage with supported cross-package runtime exports (`exec`, `time`, `cli-runtime`, …) — one of several precise public doors, each anchoring its own inbound edge class. Private implementation layers live as folders inside the owning subpackage, never as a `@nseng-ai/foundation/api` barrel.
*Avoid*: sole public door, façade barrel, Capability API.

**Harness Session**:
A prospective foundation surface for consuming a coding harness (Claude Code, Codex) through a bounded session lifecycle — start, exchange turns, observe events, terminate. It qualifies as Foundation Infrastructure only while its contract stays free of ns-specific routing or review policy; no implementation exists in this package yet.
*Avoid*: text-generation routing policy, Reviews integration, ns capability surface.
