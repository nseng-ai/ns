# Shared Project Inspection Core

## Summary

Batch 4 finding A now has a shared operation-layer project inspection core in `ts/packages/areg/src/operations/project-inspection.ts`. The core keeps the durable `AregProjectGateway` primitive fact methods stable and adds thin command-specific wrappers for `areg check`, `areg skill list/show/apply`, `areg init`, and `areg update-skills`.

## Objective Impact

This completes the lower-risk part of the gateway-collapse slice: duplicated project-inspection choreography now routes through one shared core without changing CLI output, Clinkr result schemas, or skill-kind Git-root fallback semantics. Gateway monolith splitting is intentionally deferred because this slice did not require real/fake gateway edits.

## Follow-Ups

- Decide whether finding A still needs a narrow `real-gateways.ts` / `fake-gateways.ts` project-inspection helper split after the shared core has baked.
- Keep the broader `AregProjectGateway` boundary domain-oriented; do not replace it with a generic filesystem gateway as part of this cleanup.
