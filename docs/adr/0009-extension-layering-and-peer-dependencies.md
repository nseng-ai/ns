# ADR 0009: Extension Layering and the Extension Dependency Graph

## Status

Accepted

## Context

ns needs a stable place for generic infrastructure, author-facing host contracts, shared first-party extension-building substrate, and extension-owned domain behavior. It also needs a disciplined way for one extension to reuse another without coupling through commands, host presentation, or private source.

## Decision

The extension architecture is layered bottom to top:

```text
Neutral Infra → SDK → Extension Kit → ns extensions
```

- **Neutral Infra** exposes ns-independent contracts, including I/O-performing infrastructure that passes the admission test in ADR 0032.
- **SDK** (`@nseng-ai/sdk`) is the ns extension API and host boundary.
- **Extension Kit** (`@nseng-ai/extension-kit`) supplies first-party ns extension-building substrate: ctx-to-gateway adapters, ns-shaped gateways and fakes, shared result/error shapes, and small shared primitives when the SDK is the wrong home.
- **ns extensions** own product domain behavior, prompts, workflow policy, command contributions, and command-specific presentation.

The SDK, Extension Kit, and presentation hosts such as Pi are not extension-domain homes. Domain behavior belongs to the extension that names it. Promotion downward into the SDK is rare and requires proven generality; opinionated first-party patterns may remain in the Extension Kit indefinitely.

When an ns extension contributes an SDK-loaded Command Face, that contribution is discovered and loaded independently. When a downstream **consumer** extension needs a provider's behavior in-process, the provider exposes a curated **extension package API** at `@nseng-ai/<provider>/api`. Consumers import only that subpath, never package internals or host presentation. The resulting Extension Dependency Graph must be acyclic.

Extension cores are gateway-injected. Host API objects are adapted to narrowed gateways at composition edges; domain logic does not receive the entire SDK context merely to perform external I/O. Shared command/protocol composition is in-process rather than through parsing another extension's human CLI output.

The terms **ns extension API** (`@nseng-ai/sdk`), **extension package API** (`@nseng-ai/<name>/api`), and **Pi runtime extension API** name distinct surfaces and must not be collapsed into bare “extension API.”

Package release disposition is independent of this layering and is governed by ADR 0045.

## Consequences

- Extension domain ownership remains visible and testable outside host shells.
- Provider packages deliberately curate the contracts consumed by other extensions.
- The Extension Kit can share ns-specific substrate without becoming a product domain or a general third-party framework.
- Cycles and private/deep provider imports are architecture defects.

## Alternatives

- **Expose derived gateways directly as SDK fields such as `ctx.git`:** rejected because it freezes opinionated gateway shapes into the author contract.
- **Put extension domain in the SDK, Extension Kit, or Pi host:** rejected because it inverts ownership.
- **Pass full SDK context through extension package APIs:** rejected because it couples domain tests to host machinery.
- **Compose extensions through CLI output:** rejected because human presentation is not an in-process contract.
- **Permanent lower domain package:** rejected because domain belongs to its owning extension.
