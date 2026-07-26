# ADR 0008: Runtime TypeScript Extension Loading with jiti

## Status

Accepted

## Context

Extension descriptor and command modules may be authored in TypeScript and loaded by installed ns CLI without consumer-side build. Those modules import public author API from `@nseng-ai/sdk`; host and extension code must share same SDK and schema object identity across loading boundary.

## Decision

ns SDK uses jiti as runtime loader for user-authored TypeScript extension modules.

Loader binds `@nseng-ai/sdk` as virtual module backed by exact SDK object held by host. Controlled aliases may support host-owned internal source paths needed by loader, without expanding public author API or becoming extension compatibility specifiers. Loads use fresh evaluation where caller needs it.

jiti is runtime module loader, not CLI development runner. Descriptor discovery stays side-effect-light; selected command modules stay lazily loaded through current descriptor-module contract.

## Consequences

- TypeScript extension modules run without user-side build step.
- SDK types, schemas, runtime identity shared across host/extension seam.
- jiti is runtime dependency justified by this loading contract.
- Internal aliases do not become public SDK exports.

## Alternatives

- **Precompiled JavaScript and plain `import()`:** rejected because it needs build; does not itself guarantee shared SDK identity.
- **Custom transpiler and resolver:** rejected because it rebuilds hard virtual-module identity mechanism without product benefit.
