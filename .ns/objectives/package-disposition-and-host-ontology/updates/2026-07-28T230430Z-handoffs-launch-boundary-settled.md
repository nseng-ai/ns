# Handoffs Launch Boundary Settled

## Summary

The Handoffs launch-integration design blocker is resolved in
`references/handoffs-launch-boundary.md`. Source tracing showed that the current
`HandoffPromptCreateIntegration` is a Pi adapter-composition interface, not a
harness-independent Handoff domain interface: its implementation registers Pi tools, uses Pi
command and tool contexts, expands Pi skills, derives Pi session metadata, updates Pi status,
and sends a model-facing follow-up prompt.

The settled boundary keeps Handoff Artifact identity, storage, selection, lifecycle behavior,
and cross-package command-backed skill metadata on `@nseng-ai/handoffs/api`. The complete
create-then-launch prompt/tool/session flow moves to `@nseng-ai/pi-ns-handoffs`, which exposes a
deliberate `./handoff-launch` adapter subpath. `@nseng-ai/pi-ns-herdr` may consume that declared
subpath while continuing to consume `@nseng-ai/handoffs/api` directly for durable-reference
parsing and verification. Herdr remains responsible for destination creation, labeling, and
process launch.

## Objective Impact

This closes the Handoffs-specific design item that blocked implementation-stack orders 5, 21,
and 24. It also gives settled decision 4—the adapter-to-adapter dependency rule—a concrete
required edge: `pi-ns-herdr` to `pi-ns-handoffs/handoff-launch`. The rule still needs to be
recorded in the planned superseding ADR before final structural enforcement lands.

The hidden-Pi-coupling risk is narrowed for Handoffs. No abstract launch gateway or Pi-shaped
replica should be added to `@nseng-ai/handoffs/api`; doing so would disguise host coupling
rather than remove it. The only curated API addition required before extraction is stable
create/pickup command-name and command-backed skill metadata, currently consumed by Skill
Exposure from `@nseng-ai/handoffs/pi`. The broad Pi-separation roadmap row remains in progress
because this update settles design only; no package or source extraction has been implemented.

## Follow-Ups

- Implement the six-step extraction sequence in `references/handoffs-launch-boundary.md`,
  beginning with command-backed skill metadata on `@nseng-ai/handoffs/api` and the Skill
  Exposure repoint.
- Create `@nseng-ai/pi-ns-handoffs`, move the complete Handoffs Pi surface and tests, expose its
  declared `./handoff-launch` composition subpath, and remove Handoffs' `pi` subpackage and Pi
  Runtime peer only after all consumers move.
- Repoint the extracted Herdr Pi adapter to the declared adapter subpath while preserving its
  direct `/api` durable-reference verification and optional-integration failure semantics.
- Record the adapter-to-adapter clarification in the planned superseding ADR and cover it in the
  final structural guards.
- Continue the separate Flow API, parity identity, and Herdr/Branch Context coupling design
  work; this decision does not resolve those blockers.
