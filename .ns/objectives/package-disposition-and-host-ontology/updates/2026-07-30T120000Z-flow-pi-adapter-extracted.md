# Flow Pi Adapter Extracted

## Summary

The current stack now implements Flow's Pi extraction as one atomic ownership boundary. The new
incubating host package `@nseng-ai/pi-ns-flow` owns the eleven `/ns:flow:*` registrations, Pi
presentation and parity, direct lifecycle discovery, invocation-time fresh loading of
`@nseng-ai/ns/cli`, and the exported stack-squash registration used by the project-local
`.pi/extensions/code.ts` composition seam.

`@nseng-ai/flow/api` now exposes three cohesive host-independent interfaces: stable Flow command
metadata and command-backed skill registrations, submit-check recovery resolution, and stack-squash
execution/presentation. Descriptor plumbing, marker parsing, prompt policy, Graphite gateway
construction, and stack-squash internals remain private to Flow. The adapter imports Flow only through
that curated interface.

The same slice removes Flow's `src/pi/` and `test/pi/`, `./pi*` exports, `pi` subpackage declaration,
and Pi Runtime coupling. Skill Exposure now consumes Flow command-backed skill metadata from
`@nseng-ai/flow/api`; direct package discovery replaces `.pi/extensions/ns.ts`; and
`.pi/extensions/code.ts` remains the intentional cross-owner composition point for Internal
smart-restack plus Flow stack squash.

## Objective Impact

This completes the Flow portion of broad Pi separation with behavior-preserving evidence rather than
an API-only transitional state. Focused and repository validation cover all eleven command routes,
submit-check recovery marker and failure paths, bounded diagnostics, immediate stack-squash
acknowledgement and outcome presentation, parity, direct discovery, exactly-once stack-squash
registration, repeated fresh CLI loading, package type safety, dependency topology, and style guards.

The hidden-Pi-coupling risk is further de-risked: Flow's adapter needs only three cohesive operations
rather than private source imports or a broad compatibility barrel. Direct package discovery also
preserves the prior cache-disabled fresh CLI behavior without retaining a project-local lifecycle
wrapper.

The Objective remains open. This slice does not implement the Pi-native internal extractions, settle
PR Feedback's remaining disposition work, or enable the deferred repository-wide Pi structural
guards.

## Follow-Ups

- Extract the remaining Pi-native internal surfaces (`harness-session`, `model-shortcuts`, and
  `worktree-status`) under the approved ontology.
- Complete PR Feedback disposition and checkout-free reconciliation.
- Enable the deferred ns-extension/Pi and `pi-ns-*` structural guards only after the remaining
  extraction prerequisites are complete.
- No package publication, registry mutation, PR submission, landing, or Objective closure is part of
  this implementation.
