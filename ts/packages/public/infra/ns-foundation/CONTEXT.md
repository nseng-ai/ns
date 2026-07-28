# @nseng-ai/ns-foundation

`@nseng-ai/ns-foundation` is the container package for cohesive infrastructure and conventions shared across the ns product family below workflow-specific behavior. It exposes precise public subpath doors rather than one façade. Clinkr is the lower, generally applicable CLI layer, and ns-foundation may depend on it.

The package currently declares `ns.tier: "sdk"`: that existing tier is the closest fit for shared ns-family substrate above Neutral Infra, even though ns-foundation remains distinct from the author-facing `@nseng-ai/sdk` package. ADR 0050 records this provisional classification.

## Language

**ns-foundation Infrastructure**:
A cohesive infrastructure surface or convention shared by multiple ns packages and kept below workflow-specific behavior. It need not have an ns-independent contract or external-consumer scenario; package-specific workflow policy and extension domain behavior remain above it.
*Avoid*: generic-infrastructure-only admission, dumping ground for convenient helpers, Extension Kit substitute, neutral by definition.

**API-Kind ns-foundation Subpackage**:
A declared ns-foundation subpackage with supported cross-package runtime exports (`exec`, `time`, `cli-runtime`, …) — one of several precise public doors, each anchoring its own inbound edge class. Private implementation layers live inside the owning subpackage, never behind a `@nseng-ai/ns-foundation/api` façade.
*Avoid*: sole public door, façade barrel, extension package API.

**Infrastructure Graduation**:
A later focused extraction of independently valuable generic infrastructure from ns-foundation into a lower or outward-facing package when ownership and consumer evidence justify it. The package rename does not perform or presume such extraction.
*Avoid*: rename-time redistribution, automatic promotion, ns-independent admission requirement.
