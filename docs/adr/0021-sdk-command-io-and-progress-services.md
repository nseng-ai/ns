# ADR 0021: SDK Command I/O and Progress Services

## Status

Accepted

## Context

Extensions need durable command messages, transient phase output, structured progress hosts can present richly. These are intrinsic host facilities, not external-tool gateways or workflow-domain policy.

## Decision

`@nseng-ai/sdk` owns narrow command-I/O and structured-progress services reached through extension context:

- `NsCommandIo` emits transient phases, notifications, durable messages, phase clearing.
- `NsProgress` emits typed phase and optional matrix-progress events, reports whether live host listener present.

Author-facing service types and event vocabulary export from SDK root. SDK runtime code owns command-I/O factories and host adapters behind internal workspace exports such as `@nseng-ai/sdk/command-io`; those construction details are not public author API. Hosts vend concrete services; tests may supply object-literal or SDK testing fakes.

Low-level stdout, stderr, live-output streams stay distinct transport primitives. Command I/O and progress do not replace machine-result envelopes, nor turn arbitrary external gateways into SDK context fields.

Flow owns workflow-specific phase ordering, matrices, rendering, transcript tails, TTY policy, presentation drivers. Flow emits generic SDK events; does not promote its workflow vocabulary into SDK.

## Consequences

- Extension commands share one host-neutral I/O and progress contract.
- Hosts can render same events differently without moving workflow policy into SDK.
- Author contracts stay small; factories and rich-host bridges stay hidden.

## Alternatives

- **Types-only relocation:** rejected because it leaves each consumer to reconstruct host service.
- **Promote factories as author API:** rejected absent repeated author need.
- **Move Flow phase policy into the SDK:** rejected because workflow-specific ordering and rendering belong to Flow.
- **Use progress as a broad gateway bag:** rejected; unrelated Git, GitHub, input, process boundaries classified separately.
