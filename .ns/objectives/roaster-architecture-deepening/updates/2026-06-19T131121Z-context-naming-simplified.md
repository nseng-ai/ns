# Context Naming Simplified

## Summary

Candidate 3's shipped design was tightened after review: `RoasterContext` now names the prebound, operation-facing context rather than the raw adapter bundle. The raw dependency bundle is named `RoasterGateways`, with `createRealRoasterGateways()` constructing adapters and `bindRoasterContext(gateways, environment)` producing the bound `RoasterContext` used by CLI handlers.

Evidence considered: follow-up review request to avoid two context classes; local diff in `context.ts`, `cli.ts`, roaster scenario tests, and facade unit tests; targeted roaster tests; TypeScript check.

## Objective Impact

The Objective still treats candidate 3 as shipped. The semantic improvement is narrower API language: there is one caller-facing `RoasterContext`, and the unbound adapter collection is explicitly not a context. The runtime binding decision remains unchanged: `cwd`, `env`, and optional `signal` are bound at `runCli` time, not at gateway construction time.

## Follow-Ups

- Keep future roaster operation code importing `RoasterContext` only when it needs the bound caller-facing interface.
- Use `RoasterGateways` for raw adapter tests, fake construction, and low-level gateway isolation.
