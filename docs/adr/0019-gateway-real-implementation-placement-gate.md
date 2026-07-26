# ADR 0019: DI Seam Classification and Gateway Placement

## Status

Accepted

## Context

Injected boundaries differ in weight and audience. A lightweight clock is not the same category as Git or GitHub, and performing I/O does not by itself decide whether a contract belongs in Neutral Infra, the Extension Kit, the SDK, or runtime boot code. Placement must preserve dependency direction, testability, and clear ownership without leaving duplicate import doors.

## Decision

A **DI Seam** is any injected, test-substitutable collaborator. A **Gateway** is the subset that abstracts a stateful or heavyweight external service such as process execution, Git, GitHub, network access, or domain-specific filesystem storage. Every Gateway is a DI Seam; lightweight primitives such as `Clock` and `TimerScheduler` are DI Seams but not Gateways. The `Gateway` suffix marks category, not package placement; incumbent precise names such as `CommandExecApi` may remain.

Classify a lower-level surface by how consumers should reach it:

1. **Pure Utility:** deterministic, I/O-free Neutral Infra imported directly.
2. **Gateway:** an injected external boundary. Its home depends on contract shape and applicability.
3. **SDK-provided service:** an intrinsic host facility reached through the SDK context, with author-facing types in `@nseng-ai/sdk` and implementation hidden in the SDK.
4. **Runtime Harness:** boot and wiring code that creates the runtime/context and is not reached through it.

For each Gateway, choose ownership by considering all of:

- ns-independent external applicability and a credible external-consumer scenario;
- implementation complexity and maintenance weight;
- reuse outside first-party extensions;
- dependency and cycle pressure;
- impact on Extension Kit cohesion; and
- consumer semantics, including command, telemetry, cwd, timeout, and environment channels.

A Gateway passing ADR 0032's admission test may be owned coherently by Neutral Infra; `@nseng-ai/foundation/exec` and `@nseng-ai/foundation/git` are current examples. Ns-shaped external-tool contracts, adapters, and fakes normally live in precise `@nseng-ai/extension-kit/<domain>` subpackages; GitHub and Graphite are current examples. A real implementation may co-locate with its contract or live behind a separate lower owner when the factors require it, but dependency arrows must point downward and the kit must not become an undifferentiated adapter dump.

Consumers own narrowed **Consumer Gateways** in their domain vocabulary and receive concrete providers from a composition root. Filesystem-backed Gateways are domain-specific and own path, containment, and persistence semantics; there is no shared raw `FileSystemGateway`.

Relocation is atomic: establish the target contract and implementation, repoint consumers and tests, then delete the old export and path in the same change. Deferral may postpone a final implementation home only after the old door is closed; it never licenses aliases, dual reads, or compatibility exports.

## Consequences

- Placement follows contract audience and dependency shape rather than I/O, suffix, or LOC alone.
- Real adapters remain substitutable by in-memory fakes at one visible seam.
- Consumers cannot silently choose a different execution or telemetry channel deep in domain logic.
- Existing Gateway moves require explicit evidence; genericity is not assumed.

## Alternatives

- **All real adapters in Extension Kit:** rejected because it would turn the kit into an implementation dumping ground.
- **Gateways can never be Neutral Infra:** rejected because ns-independent contracts may credibly serve external consumers.
- **Gateway interface always in the kit with implementation below it:** rejected when that creates an upward dependency.
- **Raw LOC threshold:** rejected because reuse, cycles, channels, and semantics matter more.
- **Keep old doors as shims:** rejected because two canonical homes make ownership ambiguous.
- **Generic GitHub domain extension or generic filesystem Gateway:** rejected because neither represents a coherent product domain contract.
