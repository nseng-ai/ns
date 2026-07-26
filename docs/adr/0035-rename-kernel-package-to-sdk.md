# ADR 0035: SDK Package and Root Author API

## Status

Accepted

## Context

The author-facing ns extension contract and the host machinery that discovers and loads extensions form one coherent SDK boundary. Calling that package a kernel imposed an unearned operating-system analogy, while hiding author API behind a nested subpath obscured the package's purpose and runtime identity requirements.

## Decision

The package and ontology name is **SDK**. `@nseng-ai/sdk` is both:

- the public ns extension author API at the package root; and
- the owner of hidden host machinery for descriptor discovery, command loading, context construction, completion, command I/O, and runtime TypeScript module loading.

Authors import `defineExtension`, `defineCommand`, schemas, result helpers, service types, and other documented author vocabulary from `@nseng-ai/sdk`. Internal workspace exports such as `./cli`, `./command-io`, `./context`, and `./runtime/module-loader` support SDK-owned implementation seams but are not additional author APIs.

The runtime loader binds the `@nseng-ai/sdk` module identity held by the host so loaded TypeScript extensions share the same SDK and schema objects. Loader internals do not become public merely because the SDK owns them.

Checkout-free distribution folds the author surface under `@nseng-ai/ns/sdk` and only the SDK subpaths explicitly exported by `@nseng-ai/ns` under matching `@nseng-ai/ns/sdk/*` paths. The standalone package root remains the canonical author API; an internal `@nseng-ai/sdk/*` export is not thereby promised through the product package.

“Kernel” is retired from live package and product vocabulary. Use **SDK** for this package and author/host boundary, **core** when contrasting a system's core with extensions, and **substrate** for product-level framing. There are no kernel compatibility exports, aliases, or alternate author specifiers.

## Consequences

- Package identity, architecture tier, and author import vocabulary agree.
- The public author contract has no `/sdk/sdk` stutter or invented `/authoring` noun.
- Shared runtime identity and hidden loading machinery remain one SDK responsibility.
- Checkout-free consumers receive the same author surface through the product package.

## Alternatives

- **Keep a kernel package with an SDK subpath:** rejected because it blurs package purpose and retains obsolete branding.
- **Separate runtime brand/package:** rejected because discovery, loading, and author-object identity are one SDK boundary.
- **Rename the root author API to `/authoring` or `/api`:** rejected because the package root already names the contract precisely.
- **Compatibility aliases:** rejected because the pre-public cutover should leave one import identity.
- **Keep kernel as product branding:** rejected because the analogy is unnecessary at both package and product altitudes.
