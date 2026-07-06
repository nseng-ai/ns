# Capability Kit Agent Instructions

Rules for editing under `@nseng-ai/capability-kit`. Read the root `AGENTS.md` and `ts/AGENTS.md` first; this file adds the kit admission test for its exports.

## Kit admission test

Before adding or renaming a barrel export:

- **Tool vocabulary only.** Export names use git/exec/worktree tool terms, never capability-domain words (`land`, `autobranch`, `objective`, `handoff`, …). The kit is agnostic about which capability owns domain behavior.
- **Two consumers or a justification.** A new standalone export must name two live consumers, or carry an explicit single-consumer justification plus a demotion trigger. This governs standalone exports, not methods on a provider gateway contract (those are one cohesive seam and may have a single caller).

## Routing

- For consumer-gateway narrowing, kit-export promotion, and the inversion rule, read `docs/conventions/consumer-gateways-and-command-shape.md`.
- For where a Real gateway implementation lives (kit-owned vs standalone), read `docs/adr/0019-gateway-real-implementation-placement-gate.md`.
