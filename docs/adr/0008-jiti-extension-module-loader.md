# ADR 0008: Runtime TypeScript Extension Loading with jiti

## Status

Accepted

## Context

Extension descriptor and command modules may be authored in TypeScript and loaded by an installed ns CLI without a consumer-side build. Those modules import the public author API from `@nseng-ai/sdk`; host and extension code must share the same SDK and schema object identity across the loading boundary.

## Decision

The ns SDK uses jiti as the runtime loader for user-authored TypeScript extension modules.

The loader binds `@nseng-ai/sdk` as a virtual module backed by the exact SDK object held by the host. Controlled aliases may support host-owned internal source paths needed by the loader without expanding the public author API or becoming extension compatibility specifiers. Loads use fresh evaluation where the caller requires it.

jiti is a runtime module loader, not the CLI development runner. Descriptor discovery remains side-effect-light, and selected command modules remain lazily loaded through the current descriptor-module contract.

## Consequences

- TypeScript extension modules run without a user-side build step.
- SDK types, schemas, and runtime identity are shared across the host/extension seam.
- jiti is a runtime dependency justified by this loading contract.
- Internal aliases do not become public SDK exports.

## Alternatives

- **Precompiled JavaScript and plain `import()`:** rejected because it requires a build and does not itself guarantee shared SDK identity.
- **Custom transpiler and resolver:** rejected because it rebuilds the hard virtual-module identity mechanism without product benefit.
