# ADR 0019: DI Seam Classification and Gateway Placement

## Status

Accepted

## Context

Injected boundaries differ in weight and audience. Lightweight clock not same category as Git or GitHub. Doing I/O alone does not decide whether contract belongs in Neutral Infra, Extension Kit, SDK, or runtime boot code. Placement must preserve dependency direction, testability, clear ownership; no duplicate import doors left behind.

## Decision

**DI Seam** is any injected, test-substitutable collaborator. **Gateway** is subset abstracting stateful or heavyweight external service such as process execution, Git, GitHub, network access, or domain-specific filesystem storage. Every Gateway is DI Seam; lightweight primitives such as `Clock` and `TimerScheduler` are DI Seams, not Gateways. `Gateway` suffix marks category, not package placement; incumbent precise names such as `CommandExecApi` may stay.

Classify lower-level surface by how consumers should reach it:

1. **Pure Utility:** deterministic, I/O-free Neutral Infra, imported directly.
2. **Gateway:** injected external boundary. Home depends on contract shape and applicability.
3. **SDK-provided service:** intrinsic host facility reached through SDK context, author-facing types in `@nseng-ai/sdk`, implementation hidden in SDK.
4. **Runtime Harness:** boot and wiring code creating runtime/context, not reached through it.

For each Gateway, choose ownership by weighing all of:

- ns-independent external applicability plus credible external-consumer scenario;
- implementation complexity and maintenance weight;
- reuse outside first-party extensions;
- dependency and cycle pressure;
- impact on Extension Kit cohesion;
- consumer semantics, including command, telemetry, cwd, timeout, environment channels.

Gateway passing ADR 0032's admission test may be owned coherently by Neutral Infra; `@nseng-ai/foundation/exec` and `@nseng-ai/foundation/git` are current examples. Ns-shaped external-tool contracts, adapters, fakes normally live in precise `@nseng-ai/extension-kit/<domain>` subpackages; GitHub and Graphite are current examples. Real implementation may co-locate with its contract or live behind separate lower owner when factors require it. Dependency arrows must still point downward; kit must not become undifferentiated adapter dump.

Consumers own narrowed **Consumer Gateways** in their domain vocabulary, receive concrete providers from composition root. Filesystem-backed Gateways are domain-specific, own path, containment, persistence semantics; no shared raw `FileSystemGateway`.

Relocation is atomic: establish target contract and implementation, repoint consumers and tests, delete old export and path in same change. Deferral may postpone final implementation home only after old door closed; never licenses aliases, dual reads, compatibility exports.

## Consequences

- Placement follows contract audience and dependency shape, not I/O, suffix, or LOC alone.
- Real adapters stay substitutable by in-memory fakes at one visible seam.
- Consumers cannot silently pick different execution or telemetry channel deep in domain logic.
- Existing Gateway moves need explicit evidence; genericity not assumed.

## Alternatives

- **All real adapters in Extension Kit:** rejected because it turns kit into implementation dumping ground.
- **Gateways can never be Neutral Infra:** rejected because ns-independent contracts may credibly serve external consumers.
- **Gateway interface always in the kit with implementation below it:** rejected when that creates upward dependency.
- **Raw LOC threshold:** rejected because reuse, cycles, channels, semantics matter more.
- **Keep old doors as shims:** rejected because two canonical homes make ownership ambiguous.
- **Generic GitHub domain extension or generic filesystem Gateway:** rejected because neither is coherent product domain contract.
