# ADR 0021: SDK Command I/O and Progress Services

## Status

Accepted

## Context

Extensions need durable command messages, transient phase output, and structured progress that hosts can present richly. These are intrinsic host facilities, not external-tool gateways or workflow-domain policy.

## Decision

`@nseng-ai/sdk` owns narrow command-I/O and structured-progress services reached through the extension context:

- `NsCommandIo` emits transient phases, notifications, durable messages, and phase clearing.
- `NsProgress` emits typed phase and optional matrix-progress events and reports whether a live host listener is present.

Author-facing service types and event vocabulary are exported from the SDK root. SDK runtime code owns command-I/O factories and host adapters behind internal workspace exports such as `@nseng-ai/sdk/command-io`; those construction details are not public author API. Hosts vend concrete services, and tests may provide object-literal or SDK testing fakes.

Low-level stdout, stderr, and live-output streams remain distinct transport primitives. Command I/O and progress do not replace machine-result envelopes or turn arbitrary external gateways into SDK context fields.

Flow owns workflow-specific phase ordering, matrices, rendering, transcript tails, TTY policy, and presentation drivers. It emits the generic SDK events but does not promote its workflow vocabulary into the SDK.

## Consequences

- Extension commands share one host-neutral I/O and progress contract.
- Hosts can render the same events differently without moving workflow policy into the SDK.
- Author contracts remain small while factories and rich-host bridges stay hidden.

## Alternatives

- **Types-only relocation:** rejected because it leaves each consumer to reconstruct the host service.
- **Promote factories as author API:** rejected absent repeated author need.
- **Move Flow phase policy into the SDK:** rejected because workflow-specific ordering and rendering belong to Flow.
- **Use progress as a broad gateway bag:** rejected; unrelated Git, GitHub, input, and process boundaries are classified separately.
