# ADR 0009: Extension Layering and the Extension Dependency Graph

## Status

Accepted

## Context

ns needs stable home for generic infrastructure, author-facing host contracts, shared first-party extension-building substrate, extension-owned domain behavior. Also needs disciplined way for one extension to reuse another without coupling through commands, host presentation, or private source.

## Decision

Extension architecture layered bottom to top:

```text
Neutral Infra → SDK → Extension Kit → ns extensions
```

- **Neutral Infra** exposes ns-independent contracts, including I/O-performing infrastructure passing admission test in ADR 0032.
- **SDK** (`@nseng-ai/sdk`): ns extension API and host boundary.
- **Extension Kit** (`@nseng-ai/extension-kit`) supplies first-party ns extension-building substrate: ctx-to-gateway adapters, ns-shaped gateways and fakes, shared result/error shapes, small shared primitives when SDK is wrong home.
- **ns extensions** own product domain behavior, prompts, workflow policy, command contributions, command-specific presentation.

SDK, Extension Kit, and presentation hosts such as Pi are not extension-domain homes. Domain behavior belongs to extension that names it. Promotion downward into SDK is rare; needs proven generality. Opinionated first-party patterns may stay in Extension Kit indefinitely.

When ns extension contributes SDK-loaded Command Face, that contribution is discovered and loaded independently. When downstream **consumer** extension needs provider behavior in-process, provider exposes curated **extension package API** at `@nseng-ai/<provider>/api`. Consumers import only that subpath, never package internals or host presentation. Resulting Extension Dependency Graph must be acyclic.

Extension cores are gateway-injected. Host API objects adapted to narrowed gateways at composition edges; domain logic does not receive entire SDK context merely to perform external I/O. Shared command/protocol composition is in-process, not parsing another extension's human CLI output.

Terms **ns extension API** (`@nseng-ai/sdk`), **extension package API** (`@nseng-ai/<name>/api`), and **Pi runtime extension API** name distinct surfaces; must not be collapsed into bare “extension API.”

Package release disposition is independent of this layering, governed by ADR 0045.

## Consequences

- Extension domain ownership stays visible and testable outside host shells.
- Provider packages deliberately curate contracts consumed by other extensions.
- Extension Kit shares ns-specific substrate without becoming product domain or general third-party framework.
- Cycles and private/deep provider imports are architecture defects.

## Alternatives

- **Expose derived gateways directly as SDK fields such as `ctx.git`:** rejected because it freezes opinionated gateway shapes into author contract.
- **Put extension domain in the SDK, Extension Kit, or Pi host:** rejected because it inverts ownership.
- **Pass full SDK context through extension package APIs:** rejected because it couples domain tests to host machinery.
- **Compose extensions through CLI output:** rejected because human presentation is not in-process contract.
- **Permanent lower domain package:** rejected because domain belongs to its owning extension.
