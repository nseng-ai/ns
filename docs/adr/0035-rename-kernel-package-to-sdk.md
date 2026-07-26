# ADR 0035: SDK Package and Root Author API

## Status

Accepted

## Context

Author-facing ns extension contract plus host machinery that discovers and loads extensions form one coherent SDK boundary. Calling that package kernel imposed unearned operating-system analogy. Hiding author API behind nested subpath obscured package purpose and runtime identity requirements.

## Decision

Package and ontology name is **SDK**. `@nseng-ai/sdk` is both:

- public ns extension author API at package root; and
- owner of hidden host machinery for descriptor discovery, command loading, context construction, completion, command I/O, runtime TypeScript module loading.

Authors import `defineExtension`, `defineCommand`, schemas, result helpers, service types, other documented author vocabulary from `@nseng-ai/sdk`. Internal workspace exports such as `./cli`, `./command-io`, `./context`, `./runtime/module-loader` support SDK-owned implementation seams; not additional author APIs.

Runtime loader binds `@nseng-ai/sdk` module identity held by host so loaded TypeScript extensions share same SDK and schema objects. SDK ownership alone does not make loader internals public.

Checkout-free distribution folds author surface under `@nseng-ai/ns/sdk`, plus only SDK subpaths explicitly exported by `@nseng-ai/ns` under matching `@nseng-ai/ns/sdk/*` paths. Standalone package root stays canonical author API; internal `@nseng-ai/sdk/*` export not thereby promised through product package.

“Kernel” retired from live package and product vocabulary. Use **SDK** for this package and author/host boundary, **core** when contrasting system's core with extensions, **substrate** for product-level framing. No kernel compatibility exports, aliases, alternate author specifiers.

## Consequences

- Package identity, architecture tier, author import vocabulary agree.
- Public author contract has no `/sdk/sdk` stutter, no invented `/authoring` noun.
- Shared runtime identity and hidden loading machinery stay one SDK responsibility.
- Checkout-free consumers get same author surface through product package.

## Alternatives

- **Keep a kernel package with an SDK subpath:** rejected: blurs package purpose, keeps obsolete branding.
- **Separate runtime brand/package:** rejected: discovery, loading, author-object identity are one SDK boundary.
- **Rename the root author API to `/authoring` or `/api`:** rejected: package root already names contract precisely.
- **Compatibility aliases:** rejected: pre-public cutover should leave one import identity.
- **Keep kernel as product branding:** rejected: analogy unnecessary at both package and product altitudes.
