# Branch Context API Metadata Implemented

## Summary

The additive Branch Context API precursor is implemented alongside the Handoffs metadata slice. Branch Context core now owns the stable command names used by Skill Exposure for branch-context creation, attached-plan implementation, and plan saving. `@nseng-ai/branch-context/api` exports those names, while the existing Branch Context Pi surface preserves its named exports through compatibility forwarding.

Skill Exposure now imports Branch Context command identities from `@nseng-ai/branch-context/api` rather than `@nseng-ai/branch-context/pi`. Focused API coverage fixes the exact strings, and Branch Context vocabulary now distinguishes stable cross-package command identity from Pi-owned registration, presentation, and launch behavior.

## Objective Impact

This implements implementation-stack order 4's command-name portion and advances order 9. Together with the Handoffs and Objectives API migrations, Skill Exposure now uses curated APIs for three of its four extension-owned metadata dependencies; Flow remains the only `/pi` metadata import and still requires its separately planned API-shape decision.

The broader Branch Context Pi extraction remains incomplete. Its Pi registration, session workflows, package exports, Pi Runtime coupling, discovery, parity ownership, and eventual `@nseng-ai/pi-ns-branch-context` package are unchanged. Package-focused checks/tests and the full repository gate provide implementation evidence; no package manifest surface was created or removed, and nothing was published.

## Follow-Ups

- Settle Flow's curated API shape before migrating Skill Exposure's final `/pi` metadata import.
- Extract Branch Context's Pi implementation only in its planned adapter package slice, preserving behavior and parity ownership.
- Remove compatibility Pi exports and enable structural guards only after remaining consumers and host surfaces have migrated.
