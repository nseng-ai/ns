# @nseng-ai/sdk Context

## Source inventory

The SDK discovers **ns command sources**, not command routes. A source has one stable diagnostic label, a source kind and origin, package facts when applicable, a top-level help classification, and exactly one composition owner: an absolute Clinkr command directory or a host-internal programmatic callback. Discovery never enumerates routes, selects argv, assigns precedence, or reconstructs groups.

**Source-dev discovery** contributes workspace extension packages (`source-dev:*` labels) when the CLI runs from an ns source checkout with the invocation cwd inside that checkout; a package whose name is already contributed by a preinstalled, user, or project source is skipped so declared sources keep sole route ownership.

## Extension descriptor

An **Extension Descriptor** describes an extension package without executing its command modules. Its command contribution is the optional absolute `commandDirectory`; its other optional declarations are points, activation, and bundled artifacts. Descriptors do not recursively describe commands or carry loader callbacks.

## ns extension API

`@nseng-ai/sdk` is the public ns author surface. `defineCommand()` and `defineRawCommand()` return contextful modern Clinkr definitions over `NsExtensionApi`. Structured commands require both a concrete `resultSchema` and a `renderHuman` over that schema's typed output; the handler's successful data and the renderer input are `z.output` of the declared schema. This is stricter than generic Clinkr, which keeps bodyless commands and fallback rendering for lower-level consumers. Command identity and presentation metadata belong to the route-local `metadata.ts`/`group.ts` files or the host's programmatic source, not the executable definition.

## Host composition

The ns host prepares source inventory and invocation context, constructs exactly one contextful `ClinkrApp`, mounts each source under its own label, and calls only `app.run()`. Clinkr owns recursive navigation, selected loading, help, schema handling, and completion. The standalone SDK host owns the extension-point subtree; a distribution host that owns extension lifecycle composes those SDK commands into its single host-internal `extension` subtree and disables the standalone SDK subtree. Host-owned shell commands remain a separate programmatic built-in subtree; all sources own disjoint top-level routes.

## Avoid

- command catalog, command candidate, catalog precedence, or leaf candidate
- descriptor-owned command topology or loader callbacks
- SDK route enumeration, argv selection, completion interception, or render adaptation
- compatibility descriptors or legacy Clinkr command objects
- the unqualified phrase “extension API”; use **ns extension API** here
