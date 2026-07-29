# Handoffs API Metadata Implemented

## Summary

The first additive precursor in the Handoffs extraction sequence is implemented. Handoffs core now owns the stable `/ns:handoff:create` and `/ns:handoff:pickup` command names and their Skill-Backed Command Registrations; `@nseng-ai/handoffs/api` exports that narrow harness-independent metadata surface, while the existing Handoffs Pi exports remain available through compatibility forwarding modules.

Skill Exposure now imports the Handoffs registration table from `@nseng-ai/handoffs/api` rather than `@nseng-ai/handoffs/pi`. Exact API contract coverage fixes the two command strings and specialized-command registration rows, and the Handoffs context vocabulary now includes stable cross-package Skill-Backed Command metadata while continuing to exclude Pi presentation and session-launch behavior.

## Objective Impact

This implements Handoffs extraction sequence step 1, corresponding to implementation-stack order 5 and the Handoffs portion of order 9. It partially validates the Hidden Pi coupling risk: an existing non-Pi runtime consumer can obtain the required Handoffs metadata through the curated extension API without importing Pi-only tool, session, timeout, status, or presentation constants.

The broader separation remains incomplete. Handoffs still retains its Pi subpackage and manifest exports for additive compatibility, and `@nseng-ai/pi-ns-handoffs`, Herdr adapter composition, the remaining extension extractions, and final structural guards are still outstanding. Focused Handoffs and Skill Exposure checks/tests and the full `just` gate pass. No package or manifest surface was created or removed, and nothing was published.

## Follow-Ups

- Extract Handoffs Pi orchestration into `@nseng-ai/pi-ns-handoffs` according to `references/handoffs-launch-boundary.md`.
- Repoint later Pi and Herdr composition only when their declared adapter surfaces exist; do not bypass the curated Handoffs API with private imports.
- Remove Handoffs compatibility Pi exports and add final structural enforcement only in the later extraction sequence steps.
