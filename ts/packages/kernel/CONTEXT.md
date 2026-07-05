# @ns/kernel

`@ns/kernel` owns the `ns` CLI host and the `@ns/kernel/sdk` author API. The kernel is a generic extension loader and command runtime: it discovers command metadata, applies precedence, loads only the selected command contribution, builds execution context, and delegates behavior to the owning extension or capability package.

## Language

**ns kernel**:
The host layer of the `ns` CLI: command discovery, precedence, selected extension loading, CLI presentation, argument/schema parsing, execution context construction, shell completion, shell integration, and the public author SDK. The kernel stays small and does not own workflow policy unless repeated command evidence proves a reusable host service belongs here.
*Avoid*: repository workflow command bundle, capability implementation owner, Graphite/GitHub policy owner, hidden task database, synonym for all `@ns/*` packages.

**ns command surface**:
The user-facing CLI path contributed by a built-in host command or an extension command entry. The kernel routes command paths generically; the package that contributes a command owns its capability-specific semantics.
*Avoid*: proof of kernel ownership, compatibility alias, Pi runtime command, package-private API.

**Built-in host command**:
A command implemented by the kernel because it is host infrastructure, such as runtime diagnostics, completion, or managed shell integration. Built-ins are the lowest-precedence catalog source and can be overridden by higher-precedence extension entries only through the normal catalog rules.
*Avoid*: default capability command, bundled workflow, project policy.

**Preinstalled extension catalog**:
Injected metadata for first-party extension commands shipped with an installed CLI distribution. It is a distribution convenience for the same extension model: metadata is available for discovery/help/completion, while selected commands are imported lazily from their owning package module specifiers.
*Avoid*: privileged built-in, kernel-owned command, reason to bypass the SDK boundary, automatic destination for repo-specific policy.

**Project-local extension**:
A checked-in repository extension under `<repo>/.ns/extensions` that contributes command behavior for that checkout. Project-local entries can group commands and override lower-precedence sources without making those commands universal built-ins.
*Avoid*: default kernel command, compatibility alias, bundled first-party extension, package implementation module.

**Global extension**:
A user-level extension discovered under `$XDG_DATA_HOME/ns/extensions`. Global entries have higher precedence than built-ins and preinstalled metadata, and lower precedence than project-local entries.
*Avoid*: project policy, installed catalog entry, kernel command.

**Extension root**:
A discovery root containing direct files, directory indexes, or package manifests. Direct files and directory indexes can be imported for top-level help summaries; package manifests contribute side-effect-light metadata.
*Avoid*: recursive command crawler, hidden task registry, eager import boundary.

**ns command entry**:
A command contribution inside an extension's `commands` array or a manifest/preinstalled catalog descriptor. It names one command leaf and points at the module that implements selected-command behavior.
*Avoid*: extension root, package API, Pi mirror, YAML task spec.

**Extension discovery**:
The side-effect-light CLI step that scans built-in definitions, injected preinstalled metadata, global roots, and project roots to build the command catalog without importing unrelated extension command modules.
*Avoid*: eager module loading for help, partial registration state from failed modules, hidden plugin registry.

**Selected extension loading**:
The CLI step that imports and validates exactly one external command contribution after the user selects a command. Selected help and JSON schema may load the selected contribution; top-level help and unrelated commands must not load unselected package manifest or preinstalled entries. Discovery diagnostics that affect the selected command are fatal; unrelated discovery diagnostics are warnings.
*Avoid*: loading all extension code to discover command names, fallback past a broken higher-precedence selected command, bricking static help/version/runtime for unrelated malformed entries.

**Catalog precedence**:
The ordering used to resolve duplicate command keys: built-in host commands < preinstalled extension metadata < global extensions < project-local extensions. Higher-precedence entries override lower-precedence entries with diagnostics rather than compatibility aliases.
*Avoid*: fallback alias, load-order accident, capability priority scheme.

**ns extension API**:
The concrete `@ns/kernel/sdk` subpath used by extension authors. It exposes `defineExtension()`, command/result types and helpers, execution-context capabilities, schema builder `z`, and curated lower-package re-exports owned as SDK vocabulary. `ts/packages/kernel/docs/sdk-reference.md` is the authoritative export inventory.
*Avoid*: unqualified extension API, Pi runtime extension API, importing implementation modules, copying SDK types, resolving SDK through project-local internals.

**Public author API**:
The abstract promise that extension authors have a stable import surface. The `ns extension API` (`@ns/kernel/sdk`) is its current concrete surface.
*Avoid*: every `@ns/kernel` subpath, internal workspace export, capability package API, lower-package helper.

**Internal workspace export**:
An `@ns/kernel` subpath shared across first-party workspace packages for kernel-owned implementation seams, but not promised through the Public author API. Package metadata records these subpaths under `ns.internalWorkspaceExports`.
*Avoid*: plugin API, public SDK, command-author import path, capability domain home.

**Capability API**:
A curated typed programmatic export owned by a capability package and consumed in-process by downstream packages. Capability APIs are separate from kernel-loaded command entries and from `@ns/kernel/sdk`.
*Avoid*: command contribution, kernel dependency resolver, package-private module, CLI invocation of a provider.

**Gateway-injected capability core**:
The rule that capability domain logic takes injected gateways and stays outside the kernel. The kernel-loaded command surface converts SDK context into owning-package gateways at the edge and then calls the capability core.
*Avoid*: `ctx`-threaded domain logic in lower layers, host access inside domain logic, kernel-owned workflow policy.

**SDK boundary**:
The boundary between the kernel-owned author SDK and code above it. SDK promotion requires repeated command evidence or a clearly documented single-command necessity, and should deepen the author-facing interface rather than expose implementation internals for convenience.
*Avoid*: one-command convenience export, importing implementation modules from extensions, treating duplication as automatically bad.

**Single-file extension**:
A direct `.ns/extensions/<name>.ts` or `.ns/extensions/<name>.js` authoring module. It is a leaf surface: it may import the public author API, but workspace packages must not import from it.
*Avoid*: shared package module, helper library, public SDK source.

## Extension layering

The kernel is the SDK/host layer. Below it are neutral infra packages. Above it are capability-kit packages and capability packages that own domain behavior, gateways, and command-specific policy. The kernel loader is unaware of capability-to-capability programmatic dependencies; those dependencies are ordinary package edges through documented Capability APIs.

Dynamic Pi command registration is not a generic kernel feature. A host mirror, when one exists, is a host adapter over a selected CLI command or Capability API and must be owned/tested by the host or capability presentation package that registers it.
