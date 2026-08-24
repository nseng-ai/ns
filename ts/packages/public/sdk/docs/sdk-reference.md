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

## `NsExtensionApi.projectConfig`

Every command receives a required invocation-scoped `EffectiveProjectConfig`. Its only operation is:

```ts
get<T>(setting: ProjectSetting<T>): Promise<
  Result<EffectiveValue<T> | undefined, ProjectConfigError>
>;
```

`ProjectSetting<T>` declares a non-empty TOML path tuple, a Zod schema, and an optional invalid-value message. A configured value includes `value` and provenance containing source `project`, the absolute discovered `ns.toml` path, and the requested setting path.

Successful `undefined` means only that the setting is absent from a valid project configuration, including when the project has no `ns.toml`. The typed failure union distinguishes project absence, operational project discovery failure, source-read failure, invalid TOML source, and invalid requested setting.

`createNodeEffectiveProjectConfig()` is exported from `@nseng-ai/sdk/project-config` for composition roots. It accepts invocation `cwd`, a copied environment, the host's `CommandExecApi`, and optional cancellation. It shares project discovery and source loading only within that capability. Hosts create one capability per invocation; registration-lifetime caches and public refresh/load lifecycles are not part of the contract.

This API currently reads only project `ns.toml`. It does not activate local or user layers or generic merge behavior.

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

The root retains `NsExtensionApi`, the author-facing effective-project-config types, command I/O/progress types and helpers, text generation types, descriptor and point schemas, text normalization/truncation helpers, and `z`. The concrete Node project-config factory remains under `@nseng-ai/sdk/project-config`.
