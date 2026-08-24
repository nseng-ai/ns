# Command-first vertical slices begin with restack-resolve

## Summary

The implementation strategy has changed from building a broad GS provider module before user workflows to delivering command-sized vertical slices. Each slice starts from a needed outcome, experimentally settles the exact gh-stack v0.1.0 behavior involved, updates the GS README contract, and adds only the provider infrastructure, CLI behavior, portable skill, and Pi surface that the workflow proves necessary.

The first slice is `ns gs restack-resolve`, with a GS-specific portable skill and `/ns:gs:restack-resolve`. The existing `code-gt-restack-resolve` skill is precedent for the user outcome and conflict-resolution safety policy, not an implementation to port mechanically: Graphite topology, `gt restack`, `gt continue`, and Graphite-specific Slot helpers must not become GS abstractions by habit.

## Objective Impact

The standalone GS provider-module roadmap row is replaced by the restack-resolve vertical slice, and later command work is explicitly expected to grow shared infrastructure incrementally. Pi skills and command surfaces now ship with applicable CLI slices rather than waiting for one bulk host cutover.

The immediate provider question is whether gh-stack v0.1.0 exposes a public operation that can safely support local restacking and conflict continuation. In particular, `gh stack sync` claims fetch, rebase, push, PR-link, and remote-stack effects; those coupled effects must be experimentally separated before GS promises `restack-resolve` semantics. If the provider cannot support the outcome safely, the slice must record that constraint and reshape or refuse the command rather than emulate Graphite through private state or unsupported mechanics.

## Follow-Ups

- Characterize clean, conflicting, interrupted, Slot-occupied, provider-failure, and potentially networked restack cases against exactly gh-stack v0.1.0.
- Settle `ns gs restack-resolve` starting states, scope, postconditions, outcome classes, and recovery guidance in the GS README before implementation.
- Derive the portable GS skill and `/ns:gs:restack-resolve` from the settled GS command contract while preserving the existing Graphite workflow unchanged.
- Reuse or extract infrastructure only when this and later command slices demonstrate a shared GS need.
