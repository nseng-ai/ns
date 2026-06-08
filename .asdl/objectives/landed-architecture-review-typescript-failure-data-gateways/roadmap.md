# Roadmap

## Work

- [ ] Baseline TypeScript boundary examples against the convention.
      Evidence to gather: Pi runtime command-result normalization, machine-envelope parsing, objective-list parsing, Pi extension handoff/planned-branch failure paths, `ccc` land-stack result unions, planned-branch gateways, and `asdl-dev` gateway result helpers. Output should distinguish expected recoverable outcomes from invariant/configuration/programmer errors.
- [ ] Write the TypeScript failure-as-data and gateway-boundary ADR.
      The ADR should state: expected user/environment/external-system/parser outcomes are returned as structured data; programmer errors and impossible states still throw; semantic gateways are required when external interaction is reused, parsed, policy-bearing, mutation-bearing, or fake-test valuable; result semantics are standardized but one universal result shape is not.
- [ ] Cross-link TypeScript guidance and apply one targeted drift slice only if evidence warrants it.
      Guidance links should make the ADR discoverable from TypeScript style and TypeScript fake-driven testing workflows when appropriate. Any refactor must target a recoverable expected outcome where returned data improves caller branching, presentation, or fake-driven testing. Validation evidence should include focused Vitest coverage for changed boundary behavior plus the affected package check/test command.
- [ ] Park or close remaining candidates with rationale.
      Record why inspected candidate throws/gateways were fixed, deferred, or left alone. Close only when no active non-parked convention or drift-review work remains.

## Parked

- Python failure-as-data and gateway guidance is out of scope for this TypeScript child Objective.
- A universal `Result` helper or single result shape across TypeScript packages is parked unless concrete drift proves package-local result shapes are causing bugs or review friction.
- Full repo inventory and mass refactoring are parked; this Objective uses a Pi-runtime anchor plus representative TypeScript comparison evidence.
- Payload artifact architecture remains owned by its separate Objective lineage.
