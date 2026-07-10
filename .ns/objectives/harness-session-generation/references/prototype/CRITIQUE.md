# Prototype Critique

The prototype succeeds as a type-composition experiment, but it is not production-conformance evidence. Its strongest result is that profile-specific factories, a small `runTurn()`/`close()` session interaction, covariant provider usage, one routing text generator, no silent fallback, and consumer-semantic validation above transport parsing can fit together. Its fake protocol deliberately—or accidentally—proves much less about real Claude/Codex lifecycle and execution behavior.

## Keep

- Profile-specific creation instead of one optional bag.
- Identity, system prompt, output mode, repository context, and timeout defaults fixed at creation; turn content, cancellation, and timeout override at `runTurn()`.
- A small session interaction with idempotent best-effort `close()` and `finally` cleanup in text generation.
- Provider-native usage bounded by a common token core, including honest `null` where unavailable.
- Structured transport parsing below Reviews' semantic findings validation, provided failure-stage evidence remains rich enough to preserve Reviews' taxonomy.
- One routing text generator over direct and isolated-session execution, with explicit no-fallback behavior.
- Concrete harness modules owning provider argv, environment, auth inheritance, wire parsing, and failure classification.

## Correct before crystallization

### 1. Keep subprocess mechanics below the domain seam

`contracts.ts` currently places `FullFidelityExecRequest`, `RawProcessEvidence`, and `FullFidelityExecChannel` beside session domain contracts. Fields such as `purpose`, `command`, `args`, `stdin`, and `structuredOutputSchema` are adapter mechanics. A process gateway should carry subprocess capabilities; concrete harness adapters should translate output schemas, resource ownership, and profile guarantees into that gateway.

The unique-symbol brand does not itself guarantee fidelity because `createFullFidelityExecChannel()` can brand any callback. Production should use a narrow internal transport gateway backed by the Node adapter and prove its behavior with conformance tests; profile factories and sessions are the curated domain surface.

### 2. Make terminal outcomes genuinely total

`StatefulSession.runTurn()` awaits `exec.execute()` without translating a rejected promise. The prototype therefore has an undocumented eighth runtime outcome despite advertising seven terminal failures. Either the internal execution gateway must be total—including startup failures—or the harness adapter must catch execution rejection and return `invocation-failed`. Throws should remain only for programmer misuse such as a turn after closure.

### 3. Do not treat the fake protocol as lifecycle proof

The prototype invents `session acquire`, `session cleanup`, generic `run --read-only`, `--output-schema-transport`, marker-only environments, JSON transcript stdin, and stdout envelopes that do not match either production runner. `ISOLATED_CWD` is constant rather than per-session owned state. Session-local history retains prior user inputs only, records failed turns before their outcome, and does not model assistant output or native continuation identifiers.

These simplifications are acceptable for testing interface composition, but they do not validate eager native session acquisition, real cleanup, isolation, read-only enforcement, or sequential multi-turn behavior. Production resource fakes should model the resources actually owned—temporary directories, generated schema/config/output files, process handles, and any real native session identifier.

### 4. Reopen lifecycle semantics

The interface says sequential, but the prototype neither serializes nor deterministically rejects concurrent turns; `close()` may race an active turn. Timeout values are not validated as finite and positive. Conformance must define concurrent `runTurn()`, close-during-turn, failed/cancelled-turn history, timeout validation, and post-close behavior.

Neither current consumer needs multiple turns, and the fake does not establish real continuation. Start production single-turn unless native continuation and a concrete consumer need justify a sequential multi-turn base.

### 5. Simplify output typing

The settled design says there is no payload generic, but the prototype adds `TMode` to `TurnOutput`, `TurnSuccess`, `TurnResult`, every session, every option, and every factory, then uses assertions because TypeScript cannot narrow the conditional generic. Before promotion, choose either a non-generic result with discriminated text/structured success variants or separate named text/structured factory surfaces. Do not promote the current conditional generic without explicitly revisiting the earlier decision.

### 6. Separate static impossibility from runtime preflight

Codex's strict isolated-generation impossibility is known at design time. A concrete Codex module should therefore omit that factory rather than export a factory that can only reject. Typed creation failure remains useful when a normally supported factory cannot satisfy guarantees for the installed CLI/version/environment.

### 7. Preserve compatibility evidence across failure stages

A single `invalid-output` kind is not enough by itself for Reviews to reproduce its pinned distinctions among invalid JSON, invalid response/envelope, invalid findings, and empty output. The session failure must retain a structured stage/cause, or Reviews must retain the relevant transport interpretation. Human-facing stderr regexes should not become the sole machine classification for authentication when stable provider evidence exists.

Text generation may deliberately narrow typed failures to its existing string error contract, but typed cause and diagnostics should remain inside the owning module for logs, conformance, and Reviews adaptation.

### 8. Keep routing ownership but revisit routing injection

The routing module owns the right behavior, but `isolatedClaudeModelRefs` and a Claude-named dependency bake one harness into its construction interface. Placement should use the canonical qualified-model parser and a small wiring-owned route decision that yields direct execution or one selected isolated-session factory. Avoid both exact-string policy leaking into callers and a speculative provider registry/capability-discovery system.

## Production evidence gaps

### Enforceable Claude read-only behavior

Codex has an explicit read-only sandbox. Existing Claude Reviews enables `Bash,Read`; a prompt asking the model not to mutate is not enforcement, and the isolation research established Claude's zero-tool isolated profile rather than repository-aware read-only execution. The Objective must prove a real Claude read-only guarantee, narrow Claude to genuinely non-mutating tools, or rename/weaken the profile before migration.

### Command execution semantics

The real command result exposes `code`, `killed`, and optional `startupError`, not distinct cancellation and timeout evidence. A production prerequisite must establish AbortSignal behavior before spawn and during execution, timeout versus cancellation classification, process-group termination/escalation, startup failure, and stdout/stderr preservation. Routing harness execution around the ns channel should add a distinct Reviews harness-exec dependency rather than replacing the existing shared channel used by unrelated gateways.

### Real provider transports

Real Claude uses its JSON event/envelope and schema flags; real Codex uses schema and output files plus last-message handling. Conformance must pin those provider-specific protocols, environment/auth behavior, temp resources, cleanup, and version drift. The prototype's invented protocol should not be copied.

### Existing TextGenerator compatibility

The prototype defines a third contract copy, requires direct usage where the current contract permits omission, and validates qualified refs more narrowly than current direct execution. Production must preserve the canonical existing `TextGenerator` caller contract, canonicalize the kernel/capability-kit duplication deliberately, and apply harness-specific model parsing only after routing selects that path.

## Placement pressure

- `capability-kit` depends on `kernel`, so placing shared runtime there prevents kernel consumption without a cycle.
- `kernel` should not own Reviews-specific Claude/Codex policy.
- `foundation` may own subprocess primitives, not harness domain behavior.
- `reviews` cannot own a seam also consumed by kernel text generation.
- `packages/internal/*` cannot serve two platform runtime consumers because outside runtime dependencies are forbidden.

This evidence favors evaluating a separate platform package for session contracts and concrete harness adapters, while retaining the canonical `TextGenerator` author contract in the kernel-facing surface and keeping route policy in wiring. That is placement evidence, not a settled decision.

## Revised verdict

The prototype row is complete as an interface experiment. It validates that the main composition can be deep and typeable and identifies several shallow alternatives to reject. It does **not** validate real CLI conformance, enforceable Claude read-only execution, multi-turn lifecycle, timeout/cancellation classification, or migration compatibility. Those gaps must block placement finalization and roadmap crystallization until researched and decided.
