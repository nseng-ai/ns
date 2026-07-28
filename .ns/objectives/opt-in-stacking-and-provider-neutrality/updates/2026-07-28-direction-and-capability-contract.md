# Direction and Capability Contract Accepted

## Summary

ADR 0049 accepts ordinary Git branches plus GitHub pull requests as the default workflow and makes stacking an explicitly selected, provider-neutral capability. The accompanying capability matrix compares current Graphite behavior, locally observed `github/gh-stack` v0.0.8 semantics, and colocated Jujutsu as a contract-shape constraint.

The decision splits topology, preparation, reconciliation, publication, and branch creation rather than defining a universal stack gateway. It also records eight quotable jj guardrails covering optional current branch, ordered publication inputs, non-ritual outcomes, index independence, partial providers, open provider identity, observed postconditions, and provider-private-state isolation.

## Objective Impact

The first two roadmap rows are complete. Neutral vocabulary now distinguishes Branch Workflow Target, Stack Workflow Target, Stack Provider, Stack Topology, and Branch Creation Provider from Graphite-private topology and facts.

The shallow-seam risk is materially reduced: later implementation slices have a capability contract and conformance scenarios against which to review provider-neutral interfaces. Exact setting names, flag spellings, and the Extension Kit subpath remain implementation-level choices rather than unresolved architecture.

## Follow-Ups

- Remove the four named ambient Graphite couplings without changing Flow policy in the same slices.
- Introduce discriminated targets and explicit provider selection before extracting neutral topology and mutation seams.
- Revalidate gh-stack behavior when the follow-up adapter Objective begins because v0.0.x semantics may drift.
