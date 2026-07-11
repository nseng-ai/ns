# Production Contract and Foundation Placement Settled

## Summary

An interactive grilling session resolved every design branch reopened by the prototype critique.

### Profiles and lifecycle

- Rename `read-only-agent` to **`reading-agent`**. The profile guarantees explicit repository cwd, repository-reading intent, advisory non-mutation, structured output, cancellation, and finite timeout. “Reading” describes task intent and tool posture, not universal OS-level containment. Codex keeps its stronger read-only sandbox; Claude's available containment is documented honestly.
- Both initial profiles are **single-turn**. A second turn is profile misuse. Multi-turn, transcript replay, native continuation, concurrent turns, and close-during-active-turn semantics stay parked until a real consumer justifies a new profile.
- Statically impossible factories are absent. Claude exposes isolated-generation and reading-agent creation; Codex exposes reading-agent creation only. Typed creation failures represent version/environment preflight for normally supported factories, not static impossibility.

### Results and failures

- `TurnResult<TUsage>` keeps usage as its only generic. Successful output is a non-generic discriminated union of text and structured values; creation still fixes output mode.
- The seven common terminal failure kinds remain. Each failure also carries typed stage/cause and raw diagnostics so Reviews can preserve invalid-JSON, provider-envelope, empty-output, and related compatibility distinctions without parsing message prose. Consumer-semantic invalid-findings remains above the session seam.

### Command substrate

- Foundation command execution replaces the ambiguous result shape with a **breaking required discriminated union**: ordinary exit, spawn failure, caller cancellation, and timeout. No backward-compatibility fields remain. The Node adapter is authoritative because it knows which termination path occurred; callers migrate atomically.
- Harness execution consumes a private narrowed gateway over foundation exec. It carries only process mechanics. Output schemas, profile purpose, resource ownership, and provider semantics remain in concrete adapters. `NsExecOptions` is not widened.
- Reviews receives a distinct harness-exec dependency; existing git, log, and unrelated gateways retain their established command channels.

### Foundation ownership and layering

Foundation intentionally becomes publicly responsible for harness-session semantics. The cohesive capability lives there:

- a curated thin public harness API façade;
- a private harness feature containing a parameterized single-turn lifecycle engine;
- concrete Claude Code and Codex profile adapters;
- foundation exec beneath it with truthful termination evidence.

The private engine is parameterized by acquisition, execution, interpretation, and release behavior. It owns eager acquisition, one-turn enforcement, positive finite timeout validation, expected-exception normalization, idempotent close, and exactly-once best-effort release. Concrete profile adapters own real argv, environment/native auth, cwd and temporary resources, stdin/output-file protocols, structured-schema translation, provider envelope/usage parsing, and failure mapping. The hook interface is not exported.

This is deliberate broader foundation ownership, not an attempt to pretend harness semantics are neutral process primitives. Cross-package importers use a curated foundation API surface; provider mechanics and generic lifecycle hooks do not leak into that interface.

### Migration stack

The stack is substrate-first and incremental:

1. Replace foundation command results with the exhaustive termination union and migrate callers.
2. Add foundation's public harness API, private engine, and Claude isolated-generation adapter.
3. Canonicalize unified text generation and migrate one live isolated-generation steelthread with no fallback.
4. Add reading-agent adapters and migrate Reviews provider-by-provider, Codex then Claude, behind compatibility bridges and a distinct harness-exec dependency.
5. Remove obsolete launchers/knobs only after replacement proof, then finalize curated exports, documentation, and migration-invariants evidence.

## Objective Impact

- The contract questions reopened by `updates/2026-07-10-prototype-critique-reopens-contract.md` are resolved. No design question now blocks implementation.
- The two speculative research rows and the broad placement grilling row are replaced by execution-ready implementation slices.
- The Objective's earlier sequential multi-turn and universal read-only language is superseded by single-turn profiles and advisory `reading-agent` semantics.
- Package Fog is resolved in favor of cohesive public foundation ownership with a private parameterized engine and concrete adapters. Exact private hook signatures and failure-stage names may refine during implementation without changing the public contract.
- Current PR evidence: PR #3319 is open for the Objective, research, and prototype work against `review-harness-routing/prepare-adapter-request`; the local branch also contains the prototype-critique commit `a8276b587` before this grilling update.

## Follow-Ups

- Implement the foundation command-result migration first, including cancellation before spawn and in flight, timeout/escalation, spawn failure, ordinary exit, and output preservation.
- Keep each later roadmap row independently valid and testable; route Objective tracking through `objective-update` between slices.
- Preserve the two already accepted Reviews behavior changes—harness-managed Claude auth and finite timeout—as explicit expectation changes rather than bundling unrelated compatibility drift.
- Do not copy the throwaway prototype's fictional acquire/cleanup commands, generic JSON transcript, constant cwd, marker environment, or invented provider envelopes into production.
