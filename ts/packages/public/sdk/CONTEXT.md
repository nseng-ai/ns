# @nseng-ai/sdk Context

## Source inventory

The SDK discovers **ns command sources**, not command routes. A source has one stable diagnostic label, a source kind and origin, package facts when applicable, a top-level help classification, and exactly one composition owner: an absolute Clinkr command directory or a host-internal programmatic callback. Discovery never enumerates routes, selects argv, assigns precedence, or reconstructs groups.

**Source-dev discovery** contributes workspace extension packages (`source-dev:*` labels) when the CLI runs from an ns source checkout with the invocation cwd inside that checkout. Command-source selection is `Built-in > explicit Project > current-checkout source-dev > User > ordinary Preinstalled` for matching validated manifest package names. Built-in and explicit Project owners block a same-name source-dev package. An admitted source-dev package with commands atomically replaces same-name User and ordinary Preinstalled source records. A commandless source-dev package remains present as metadata but does not suppress lower command sources. This package-name replacement is limited to the source-dev selection edges and does not replace direct Project-versus-User normalized source-identity behavior. The effective source inventory remains distinct from command-route selection and composition.

This targeted command-source selection does not align Point-definition discovery in `point-catalog.ts`. Point definitions can still resolve from a User package in another checkout while commands resolve from the current source checkout; that alignment is follow-up work.

## Extension descriptor

An **Extension Descriptor** describes an extension package without executing its command modules. Its command contribution is the optional absolute `commandDirectory`; its other optional declarations are points and activation. Descriptors do not recursively describe commands or carry loader callbacks.

## ns extension API

`@nseng-ai/sdk` is the public ns author surface. `defineCommand()` and `defineRawCommand()` return contextful modern Clinkr definitions over `NsExtensionApi`. Command identity and presentation metadata belong to the route-local `metadata.ts`/`group.ts` files or the host's programmatic source, not the executable definition.

## Effective project configuration

`EffectiveProjectConfig` is the invocation-bound typed read capability. Its only operation is asynchronous `get(setting)`. The capability discovers the Git project from invocation `cwd`, reads the project `ns.toml`, validates the requested `ProjectSetting`, and returns the effective value with absolute project-source provenance. Missing settings and a missing `ns.toml` are successful absence; project discovery, source reads, malformed TOML, and invalid settings are distinct typed failures.

One capability shares root discovery and source loading across its reads and remains a stable invocation snapshot. A later invocation creates a new capability. `NsExtensionApi.projectConfig` is required. Long-lived Pi registrations retain a factory rather than a capability. The Node factory uses the caller's command execution channel and does not create an unrelated executor. Per ADR 0058, active harness identity and `NS_HARNESS` injection are not part of this scope.

This project-only slice does not activate `ns.local.toml`, user settings, generic merging, or source mutation. Lower-level point/catalog and non-model setting readers remain until their own migration slices.

## Host composition

The ns host prepares source inventory and invocation context, constructs exactly one contextful `ClinkrApp`, mounts each source under its own label, and calls only `app.run()`. Clinkr owns recursive navigation, selected loading, help, schema handling, and completion. The host constructs `NsExtensionApi.projectConfig` only after final invocation `cwd` and environment are known. Clinkr is the canonical owner of `ConfirmationResult` and `SelectionResult<T>`; the SDK exposes host confirmation and selection operations using those result types. Every host provides both semantic capabilities and reports whether the current invocation can use confirmation and selection. Confirmation returns `confirmed`, `declined`, or `cancelled`; selection returns `selected` with a value or `cancelled`. Missing host support is an error, not a user outcome. The standalone SDK host owns the extension-point subtree; a distribution host that owns extension lifecycle composes those SDK commands into its single host-internal `extension` subtree and disables the standalone SDK subtree. Host-owned shell commands remain a separate programmatic built-in subtree; all sources own disjoint top-level routes.

## Avoid

- command catalog, command candidate, catalog precedence, or leaf candidate
- descriptor-owned command topology or loader callbacks
- SDK route enumeration, argv selection, completion interception, or render adaptation
- compatibility descriptors or legacy Clinkr command objects
- the unqualified phrase “extension API”; use **ns extension API** here
