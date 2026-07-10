# Prototype Critique Reopens Production Contract Questions

## Summary

A source-backed critique of the throwaway prototype is recorded at `references/prototype/CRITIQUE.md`. It preserves the prototype as useful interface evidence while narrowing the stronger claims in `updates/2026-07-10-candidate-contract-prototype.md`: that earlier update remains immutable historical context, but “validated at prototype level” now means type composition and interface-depth evidence, not real CLI lifecycle or migration conformance.

The critique keeps profile-specific factories, a small `runTurn()`/`close()` interaction, bounded provider-native usage, structured transport parsing below consumer-semantic validation, one routing text generator, explicit no-fallback behavior, and provider-owned argv/env/wire translation. It continues to reject a shared Harness marker, generic subprocess wrapper, provider-specific TextGenerator subclasses, capability discovery, and one optional profile bag.

It also finds material gaps:

- subprocess `purpose`, argv, stdin, and structured-schema mechanics leaked into the prototype's domain contract; the brand does not guarantee channel fidelity;
- `runTurn()` can reject if execution throws, creating an undocumented eighth outcome beyond the seven terminal failures;
- fictional acquire/cleanup commands, constant isolated cwd, marker-only environment, invented JSON transcript, and invented provider envelopes do not prove native lifecycle, isolation, history, parsing, or cleanup;
- sequential turns, concurrency, close-during-turn, failed-turn history, and positive finite timeout invariants remain undefined;
- the conditional output-mode generic conflicts with the settled no-payload-generic direction and requires assertions;
- Codex's statically impossible isolated profile should likely be absent rather than represented by an always-rejecting factory;
- generic `invalid-output` and flattened string errors are insufficient by themselves to preserve Reviews' pinned invalid-JSON, invalid-envelope, invalid-findings, and empty-output distinctions;
- real Claude repository-aware read-only enforcement is unproven, and the real command result does not yet distinguish caller cancellation from timeout as the prototype assumes.

## Objective Impact

- The prototype row remains complete as an interface experiment, but its roadmap evidence is narrowed explicitly. It is not production conformance evidence.
- The prior placement/migration grilling row is now blocked by two new research rows: enforceable read-only/native continuation behavior, and full-fidelity command/transport prerequisites.
- The production contract is reopened only where the prototype supplied contrary evidence: single versus multi-turn lifecycle, concurrency/close semantics, output typing, static unsupported-profile surfaces, structured failure-stage evidence, and the internal command seam.
- New risks record Claude read-only uncertainty, command-channel cancellation/timeout ambiguity, Reviews dependency-splitting hazards, parse-taxonomy loss, and binary-resolution/environment coupling.
- Placement pressure now has a concrete hypothesis—not a decision: a separate platform package may be necessary because capability-kit depends on kernel, kernel should not own Reviews harness policy, foundation owns subprocess primitives rather than harness semantics, Reviews cannot own a shared seam, and `packages/internal/*` cannot have platform runtime dependents.

## Follow-Ups

- Research enforceable Claude read-only behavior and real Claude/Codex continuation/resource semantics before promising a sequential read-only-agent base.
- Research and probe the real Node command adapter's startup, cancellation, timeout, process termination, cwd/env/stdin, binary resolution, and evidence behavior; keep schema/resource semantics in concrete harness adapters.
- Grill the reopened contract questions together with package placement, curated exports, canonical `TextGenerator` ownership, routing injection, and migration staging.
- Crystallize production slices only after those decisions; include real provider conformance and Reviews compatibility bridges rather than copying the prototype protocol.
