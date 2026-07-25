# @nseng-ai/sdk

`@nseng-ai/sdk` owns the `ns` CLI host and is itself the public author API: extension authors import from the package root. The SDK is a generic extension loader and command runtime: it parses extension sources, provides package acquisition and descriptor-inspection mechanics, discovers command metadata, applies precedence, loads only the selected command contribution, builds execution context, and delegates lifecycle orchestration or extension behavior to the owning package.

## Language

**ns SDK**:
The host layer of the `ns` CLI plus the public author API: command discovery, precedence, selected command loading, CLI presentation, argument/schema parsing, execution context construction, shell completion, shell integration, and the root author import surface. The SDK stays small and does not own workflow policy unless repeated command evidence proves a reusable host service belongs here.
*Avoid*: ns kernel, kernel, repository workflow command bundle, extension implementation owner, Graphite/GitHub policy owner, hidden task database, synonym for all `@nseng-ai/*` packages.

**ns command surface**:
The user-facing CLI path contributed by a built-in host command or an extension command entry. The SDK routes command paths generically; the package that contributes a command owns its extension-specific semantics.
*Avoid*: proof of SDK ownership, compatibility alias, Pi runtime command, package-private API.

**Built-in host command**:
A command implemented by the SDK because it is host infrastructure, such as runtime diagnostics, completion, or managed shell integration. Built-ins are the lowest-precedence catalog source and can be overridden by higher-precedence extension entries only through the normal catalog rules. This architectural source category is narrower than the user-facing `Built-ins:` help section.
*Avoid*: default extension command, bundled workflow, project policy, synonym for every command shown under `Built-ins:`.

**Built-in help category**:
The user-facing acquisition category rendered as `Built-ins:` in top-level help. It includes both Built-in host commands and commands from the Preinstalled descriptor catalog because both ship with the installed CLI distribution. A Project descriptor extension that contributes to or overrides an established distribution namespace does not move that top-level namespace out of this category.
*Avoid*: catalog source level, reason to relabel preinstalled descriptors as built-in commands, source-provenance override.

**Preinstalled descriptor catalog**:
Injected metadata for first-party extension commands shipped with an installed CLI distribution. It is a distribution convenience for the descriptor model: metadata is available for discovery/help/completion, while selected commands are imported lazily from their owning command modules. Its commands appear in the Built-in help category without becoming Built-in host commands.
*Avoid*: privileged built-in, SDK-owned command, reason to bypass the SDK boundary, automatic destination for repo-specific policy.

**Project descriptor extension**:
A repository-declared extension package listed in repo-root `ns.toml` and exposing `exports["./ns-extension"]`. Project descriptor entries can group commands and override lower-precedence sources without making those commands universal built-ins.
*Avoid*: default SDK command, compatibility alias, bundled first-party extension, package implementation module, extension-root scan.

**Extension acquisition**:
Generic mechanics for parsing an explicit source spec, resolving an unprefixed local package in place or ensuring an `npm:` package in managed storage, and making the resulting package available for descriptor inspection. The SDK owns these reusable mechanics; it does not decide when project config or activation files are written.
*Avoid*: lifecycle transaction, harness selection, activation reconciliation, implicit bare-name npm lookup, copying local packages into managed storage.

**Extension lifecycle orchestration**:
The ns-init-owned workflow behind `ns extension install` that requires persisted project harnesses, checks declaration identity, composes SDK acquisition with full prospective descriptor validation, records the exact source spec, and applies descriptor-driven repository activation with forward recovery.
*Avoid*: SDK built-in command, point introspection, descriptor loader, implicit floating-package refresh, rollback of completed activation duties.

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
*Avoid*: fallback alias, load-order accident, extension priority scheme.

**ns extension API**:
The concrete author surface at the `@nseng-ai/sdk` package root. It exposes `defineExtension()`, command/result types and helpers, execution-context services, schema builder `z`, and curated lower-package re-exports owned as SDK vocabulary. `ts/packages/sdk/docs/sdk-reference.md` is the authoritative export inventory.
*Avoid*: unqualified extension API, Pi runtime extension API, importing implementation modules, copying SDK types, resolving the SDK through project-local internals.

**Public author API**:
The abstract promise that extension authors have a stable import surface. The `ns extension API` (the `@nseng-ai/sdk` package root) is its current concrete surface.
*Avoid*: `@nseng-ai/sdk` internal subpaths, internal workspace export, extension package API, lower-package helper.

**Internal workspace export**:
An `@nseng-ai/sdk` subpath shared across first-party workspace packages for SDK-owned implementation seams, but not promised through the Public author API. Package metadata records these subpaths under `ns.internalWorkspaceExports`.
*Avoid*: plugin API, public SDK, command-author import path, extension domain home.

**Point definition**:
Static extension descriptor metadata declaring a point's id, accepted installation kind, cardinality, description, and optional prompt default. Point definitions are discovered from `ns.toml` extension package descriptors without selected-command loading.
*Avoid*: command entry, setting, runtime registration, package.json `ns.points`

**Point id**:
The full point identifier. First-party ids usually follow `<group>.<workflow>.<leaf>`, but the SDK treats the descriptor-provided id as the canonical identifier.
*Avoid*: path-only id, consumer-defined id, lifecycle id

**Point installation**:
Consumer project config for a point. Hook installations come from `[points]`; prompt installations can come from `[points]` or the conventional `.ns/prompts/<point-id>.md` path.
*Avoid*: point definition, extension descriptor, global install tier

**SDK project-config loader**:
The single parse/validation path for repo-root `ns.toml`, including the `[points]` table and descriptor-declared point metadata. Extension-rooted settings tables stay settings; they do not become points.
*Avoid*: kernel project-config loader, per-extension TOML parser, prompt-resolution ladder, settings-as-points

**Point catalog**:
The SDK-computed view of point definitions, installations, active prompt sources, and diagnostics such as installed-but-undefined, installation-in-effect, and defined-but-uninstalled.
*Avoid*: registry, command catalog, extension discovery catalog

**Prompt default**:
A package-relative markdown file declared by a cardinality-one prompt point and used when no higher-precedence project or development source is active.
*Avoid*: TypeScript prompt constant, hook fallback, global default

**Active prompt source**:
The prompt source selected by the resolution ladder: development environment override, `[points]`, conventional `.ns/prompts/<point-id>.md`, then descriptor default. The catalog reports this source; the SDK resolves content but does not perform the LM interaction.
*Avoid*: prompt execution, hook source, hidden fallback

**ns extension points command surface**:
Read-only CLI introspection under `ns extension points` and `ns extension point <id>` for catalog and detail output. The surface explains definitions, installations, sources, and diagnostics; it does not mutate extensions or project config.
*Avoid*: `ns extension install`, runtime lifecycle graph, extension workflow command

**extension package API**:
A curated typed programmatic export owned by an ns extension package and consumed in-process by downstream packages. Extension package APIs are separate from SDK-loaded command entries and from `@nseng-ai/sdk`.
*Avoid*: Capability API (retired name), command contribution, SDK dependency resolver, package-private module, CLI invocation of a provider.

**Gateway-injected extension core**:
The rule that extension domain logic takes injected gateways and stays outside the SDK. The SDK-loaded command surface converts SDK context into owning-package gateways at the edge and then calls the extension core.
*Avoid*: `ctx`-threaded domain logic in lower layers, host access inside domain logic, SDK-owned workflow policy.

**SDK boundary**:
The boundary between the SDK-owned author surface and code above it. SDK promotion requires repeated command evidence or a clearly documented single-command necessity, and should deepen the author-facing interface rather than expose implementation internals for convenience.
*Avoid*: one-command convenience export, importing implementation modules from extensions, treating duplication as automatically bad.

## Extension layering

The SDK is the host layer of the extension stack. Below it are neutral infra packages. Above it are the Extension Kit and the ns extension packages that own domain behavior, gateways, and command-specific policy. Generic source acquisition and descriptor inspection do not make extension lifecycle policy SDK-owned: `@nseng-ai/ns-init` composes those mechanics with project activation for `ns extension install`. The SDK loader is unaware of extension-to-extension programmatic dependencies; those dependencies are ordinary package edges through documented extension package APIs.

Dynamic Pi command registration is not a generic SDK feature. A host mirror, when one exists, is a host adapter over a selected CLI command or extension package API and must be owned/tested by the host or extension presentation package that registers it.
