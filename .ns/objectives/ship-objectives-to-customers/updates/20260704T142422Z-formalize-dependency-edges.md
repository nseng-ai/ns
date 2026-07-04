# Formalize the three in-flight dependency edges

## Summary

An edge audit found that this Objective's three in-flight dependencies — `skill-management-subsystem` (skill delivery), `cross-harness-parity` (reachability doctrine), and `eve-parity-docs-site` (docs-site shell) — existed only as one-sided prose in this record's Thesis and Scope. None of the three counterpart records mentioned this Objective at all, the exact locality/drift gap ADR 0025 introduced Objective Edges to close. All three are now formal mirrored edges with perspective-correct annotations on both sides, joining the existing `checkout-free-sdl-distribution` edge.

## Objective Impact

- The dependency surface stated in prose ("also depends on in-flight work for skill bundling, the documentation site, and cross-harness reachability") is now machine-visible: `ns objective list`/`check` see four edges, and each counterpart record is self-describing about being consumed by customer shipping.
- The Blocked Sentence is deliberately unchanged: only `checkout-free-sdl-distribution` is the hard external-publish gate. The other three remain coordinated dependencies per the recorded risk mitigation ("treating them as dependencies with explicit interface expectations rather than blocking work").
- No scope, criteria, or roadmap change — this formalizes relationships the record already asserted.

## Follow-Ups

- When any of the three counterpart Objectives closes, its close flow re-judges this record's Blocked Sentence and edge annotations per the objective-close skill.
