# Reduced Invocation Surface Qualified

## Summary

The reduced invocation surface is qualified across standalone, fake-driven, and Pi-host scenarios. The final evidence gap was embedded finite JSON acquisition: Pi slash commands now receive an invocation-owned empty JSON input reader, so `--input-json` cannot fall back to ambient `process.stdin`. The host isolation scenario directly exercises that reader and verifies unchanged process stdin lifecycle plus no ambient stdout or stderr writes.

Accumulated focused suites cover standalone finite JSON request input, command-owned parsing and validation, fake-driven request/output/interaction, Pi success and failure presentation, confirmation and selection, fail-closed no-UI behavior, non-ANSI rendering, terminal-control sanitization, idle waiting, and stale-context avoidance.

## Objective Impact

The sixth roadmap item is complete. Runner checkpoint `c1dd910c9513207afe34368be2019e72a8dc02c0` records the final qualification implementation and passed the runner gate.

Child-reported validation includes focused Pi runtime and Flow suites, typecheck, lint, formatting, style guard, the full TypeScript suite with 6,371 passing tests, and diff checks. Parent verification ran Clinkr, JSON-input, Pi runtime, and Flow-focused scenarios: 34 files and 537 tests passed. Default `just` remains blocked by pre-existing dprint drift in the Objective's unchanged MCP reference; sanity continues to pass.

## Follow-Ups

- Synchronize durable Clinkr, Foundation, SDK, Pi, and workflow documentation with the shipped finite-JSON, semantic-interaction, invocation-output, and host-ownership contract.
- Update relevant CONTEXT.md vocabulary only where the implementation now establishes authoritative terms.
- Write the required final future-directions document with evidence thresholds and explicit deferral.
