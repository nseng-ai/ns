# @nseng-ai/sdk

`@nseng-ai/sdk` owns the `ns` CLI host and the `@nseng-ai/sdk` author API. The kernel is a generic extension loader and command runtime: it parses extension sources, provides package acquisition and descriptor-inspection mechanics, discovers command metadata, applies precedence, loads only the selected command contribution, builds execution context, and delegates lifecycle orchestration or capability behavior to the owning package.

## Language

**ns kernel**:
The host layer of the `ns` CLI: command discovery, precedence, selected command loading, CLI presentation, argument/schema parsing, execution context construction, shell completion, shell integration, and the public author SDK. The kernel stays small and does not own workflow policy unless repeated command evidence proves a reusable host service belongs here.
*Avoid*: repository workflow command bundle, capability implementation owner, Graphite/GitHub policy owner, hidden task database, synonym for all `@nseng-ai/*` packages.

**ns command surface**:
The user-facing CLI path contributed by a built-in host command or an extension command entry. The kernel routes command paths generically; the package that contributes a command owns its capability-specific semantics.
*Avoid*: proof of kernel ownership, compatibility alias, Pi runtime command, package-private API.

**Built-in host command**:
A command implemented by the kernel because it is host infrastructure, such as runtime diagnostics, completion, or managed shell integration. Built-ins are the lowest-precedence catalog source and can be overridden by higher-precedence extension entries only through the normal catalog rules.
*Avoid*: default capability command, bundled workflow, project policy.

**Preinstalled descriptor catalog**:
Injected metadata for first-party extension commands shipped with an installed CLI distribution. It is a distribution convenience for the descriptor model: metadata is available for discovery/help/completion, while selected commands are imported lazily from their owning command modules.
*Avoid*: privileged built-in, kernel-owned command, reason to bypass the SDK boundary, automatic destination for repo-specific policy.

**Project descriptor extension**:
A repository-declared extension package listed in repo-root `ns.toml` and exposing `exports["./ns-extension"]`. Project descriptor entries can group commands and override lower-precedence sources without making those commands universal built-ins.
*Avoid*: default kernel command, compatibility alias, bundled first-party extension, package implementation module, extension-root scan.

**Extension acquisition**:
Generic mechanics for parsing an explicit source spec, resolving an unprefixed local package in place or ensuring an `npm:` package in managed storage, and making the resulting package available for descriptor inspection. The kernel owns these reusable mechanics; it does not decide when project config or activation files are written.
*Avoid*: lifecycle transaction, harness selection, activation reconciliation, implicit bare-name npm lookup, copying local packages into managed storage.

**Extension lifecycle orchestration**:
The ns-init-owned workflow behind `ns extension install` that requires persisted project harnesses, checks declaration identity, composes kernel acquisition with full prospective descriptor validation, records the exact source spec, and applies descriptor-driven repository activation with forward recovery.
*Avoid*: kernel built-in command, point introspection, descriptor loader, implicit floating-package refresh, rollback of completed activation duties.

**Extension descriptor**:
A typed side-effect-light module that default-exports `defineExtension({ ... })` from `@nseng-ai/sdk`. It declares command entries, point definitions, activation metadata, and bundled artifacts as metadata plus lazy command-module thunks.
*Avoid*: command implementation module, JSON manifest, root crawler, eager import boundary.

**ns command entry**:
A command contribution inside an extension descriptor or preinstalled descriptor catalog entry. It names one command leaf and points at the module that implements selected-command behavior.
*Avoid*: extension root, package API, Pi mirror, YAML task spec.

**Extension discovery**:
The side-effect-light CLI step that scans built-in definitions, injected preinstalled descriptor metadata, and `ns.toml`-declared descriptors to build the command catalog without importing unrelated command implementation modules.
*Avoid*: eager module loading for help, partial registration state from failed modules, hidden plugin registry, filesystem extension-root scanning.

**Selected command loading**:
The CLI step that imports and validates exactly one external command contribution after the user selects a command. Selected help and JSON schema may load the selected contribution; top-level help and unrelated commands must not load unselected descriptor entries. Discovery diagnostics that affect the selected command are fatal; unrelated discovery diagnostics are warnings.
*Avoid*: loading all extension code to discover command names, fallback past a broken higher-precedence selected command, bricking static help/version/runtime for unrelated malformed entries.

**Catalog precedence**:
The ordering used to resolve duplicate command keys: built-in host commands < preinstalled descriptor catalog < project descriptor extensions. Higher-precedence entries override lower-precedence entries with diagnostics rather than compatibility aliases.
*Avoid*: fallback alias, load-order accident, capability priority scheme.

**ns extension API**:
The concrete `@nseng-ai/sdk` subpath used by extension authors. It exposes `defineExtension()`, command/result types and helpers, execution-context capabilities, schema builder `z`, and curated lower-package re-exports owned as SDK vocabulary. `ts/packages/sdk/docs/sdk-reference.md` is the authoritative export inventory.
*Avoid*: unqualified extension API, Pi runtime extension API, importing implementation modules, copying SDK types, resolving SDK through project-local internals.

**Public author API**:
The abstract promise that extension authors have a stable import surface. The `ns extension API` (`@nseng-ai/sdk`) is its current concrete surface.
*Avoid*: every `@nseng-ai/sdk` subpath, internal workspace export, capability package API, lower-package helper.

**Internal workspace export**:
An `@nseng-ai/sdk` subpath shared across first-party workspace packages for kernel-owned implementation seams, but not promised through the Public author API. Package metadata records these subpaths under `ns.internalWorkspaceExports`.
*Avoid*: plugin API, public SDK, command-author import path, capability domain home.

**Point definition**:
Static extension descriptor metadata declaring a point's id, accepted installation kind, cardinality, description, and optional prompt default. Point definitions are discovered from `ns.toml` extension package descriptors without selected-command loading.
*Avoid*: command entry, setting, runtime registration, package.json `ns.points`

**Point id**:
The full point identifier. First-party ids usually follow `<group>.<workflow>.<leaf>`, but the kernel treats the descriptor-provided id as the canonical identifier.
*Avoid*: path-only id, consumer-defined id, lifecycle id

**Point installation**:
Consumer project config for a point. Hook installations come from `[points]`; prompt installations can come from `[points]` or the conventional `.ns/prompts/<point-id>.md` path.
*Avoid*: point definition, extension descriptor, global install tier

**Kernel project-config loader**:
The single parse/validation path for repo-root `ns.toml`, including the `[points]` table and descriptor-declared point metadata. Extension-rooted settings tables stay settings; they do not become points.
*Avoid*: per-capability TOML parser, prompt-resolution ladder, settings-as-points

**Point catalog**:
The kernel-computed view of point definitions, installations, active prompt sources, and diagnostics such as installed-but-undefined, override-in-effect, and defined-but-uninstalled.
*Avoid*: registry, command catalog, extension discovery catalog

**Prompt default**:
A package-relative markdown file declared by an override prompt point and used when no higher-precedence project or development source is active.
*Avoid*: TypeScript prompt constant, hook fallback, global default

**Active prompt source**:
The prompt source selected by the resolution ladder: development environment override, `[points]`, conventional `.ns/prompts/<point-id>.md`, then descriptor default. The catalog reports this source; the kernel resolves content but does not perform the LM interaction.
*Avoid*: prompt execution, hook source, hidden fallback

**ns extension points command surface**:
Read-only CLI introspection under `ns extension points` and `ns extension point <id>` for catalog and detail output. The surface explains definitions, installations, sources, and diagnostics; it does not mutate extensions or project config.
*Avoid*: `ns extension install`, runtime lifecycle graph, capability workflow command

**Capability API**:
A curated typed programmatic export owned by a capability package and consumed in-process by downstream packages. Capability APIs are separate from kernel-loaded command entries and from `@nseng-ai/sdk`.
*Avoid*: command contribution, kernel dependency resolver, package-private module, CLI invocation of a provider.

**Gateway-injected capability core**:
The rule that capability domain logic takes injected gateways and stays outside the kernel. The kernel-loaded command surface converts SDK context into owning-package gateways at the edge and then calls the capability core.
*Avoid*: `ctx`-threaded domain logic in lower layers, host access inside domain logic, kernel-owned workflow policy.

**SDK boundary**:
The boundary between the kernel-owned author SDK and code above it. SDK promotion requires repeated command evidence or a clearly documented single-command necessity, and should deepen the author-facing interface rather than expose implementation internals for convenience.
*Avoid*: one-command convenience export, importing implementation modules from extensions, treating duplication as automatically bad.

## Extension layering

The kernel is the SDK/host layer. Below it are neutral infra packages. Above it are capability-kit packages and capability packages that own domain behavior, gateways, and command-specific policy. Generic source acquisition and descriptor inspection do not make extension lifecycle policy kernel-owned: `@nseng-ai/ns-init` composes those mechanics with project activation for `ns extension install`. The kernel loader is unaware of capability-to-capability programmatic dependencies; those dependencies are ordinary package edges through documented Capability APIs.

Dynamic Pi command registration is not a generic kernel feature. A host mirror, when one exists, is a host adapter over a selected CLI command or Capability API and must be owned/tested by the host or capability presentation package that registers it.
