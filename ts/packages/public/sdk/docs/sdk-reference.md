# SDK Reference

## `defineExtension(descriptor)`

Returns the descriptor unchanged with literal inference. `ExtensionDescriptor` has:

- `description: string`
- `commandDirectory?: string` — absolute Clinkr filesystem source root
- `points?: ExtensionPointDefinition[]`
- `activation?: ExtensionActivation`

Descriptor validation is exact. Recursive command entries, route names, groups, and command loader thunks are not accepted.

## `defineCommand(definition)`

Creates a contextful Clinkr structured definition whose context is `NsExtensionApi`. The definition contains the request schema, optional result schema and renderers, optional completion provider, and handler. The SDK additionally accepts `options` and `positionals` maps and applies them as Clinkr field annotations.

Command identity and route metadata are intentionally absent from the executable definition. Put those facts in the route's `metadata.ts` or `group.ts`.

## `defineRawCommand(definition)`

Creates a contextful Clinkr raw definition over `NsExtensionApi`. Its runner receives `{ context, argv, output }`, writes raw bytes through `output.writeStdout()` and `output.writeStderr()`, and returns a numeric exit status. The invocation-scoped output adapter replaces ambient process output.

## Outcomes

The SDK re-exports modern Clinkr `ok`, `negative`, `failure`, and `usageError` constructors. Their discriminant is `status` with values `success | negative | failure | usage-error`.

## Source inventory (`@nseng-ai/sdk/cli`)

`NsCommandSource` carries:

- stable `label`
- `kind`: `built-in | preinstalled | project`
- `origin`: `host | package | local`
- package facts when available
- `helpClassification`: `built-in | extension`
- either an absolute `commandDirectory` or host-internal `compose` callback

`loadNsCommandSourceInventory()` discovers package descriptors and diagnostics without opening route trees. `buildNsApp()` mounts sources and SDK built-ins into one `ClinkrApp<NsExtensionApi>`.

## Other exports

The root retains `NsExtensionApi`, command I/O/progress types and helpers, text generation types, descriptor and point schemas, text normalization/truncation helpers, and `z`.
