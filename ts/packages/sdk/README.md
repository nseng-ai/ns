# @nseng-ai/sdk

`@nseng-ai/sdk` owns the `ns` CLI host and the `@nseng-ai/sdk` author API for command-contributing extensions. It owns command discovery, precedence, selected-command loading, argument/schema parsing, rendering glue, completion plumbing, shell integration, and execution-context construction. It does not own concrete workflow policy or capability command surfaces; those belong to the extension or capability package that contributes them.

## Command catalog

The SDK builds a command catalog from lightweight metadata before it imports selected command code. Catalog entries come from three source levels, in increasing precedence:

```text
built-in command table < preinstalled descriptor catalog < ns.toml-declared descriptors
```

Built-in commands are SDK-owned host commands. Preinstalled descriptor catalog entries are injected by the installed CLI distribution so reusable first-party extensions can be available without every repository declaring them. Project entries come from extension packages listed in the effective repository configuration; each package exposes `exports["./ns-extension"]` as a typed descriptor module. Higher-precedence entries override lower-precedence entries with the same command key; overrides are recorded as diagnostics rather than compatibility aliases.

## Project configuration

Local runtime reads combine the checked-in repository-root `ns.toml` with an optional checkout-local `ns.local.toml`. Tables merge recursively. At every other leaf, the local value replaces the checked-in value; arrays replace wholesale rather than concatenate. Keys present in only one file remain present. This means a local `extensions` array, point hook array, or `[slots].provision` array replaces the corresponding checked-in array.

`ns.local.toml` is ignored by git and is intended for checkout-specific settings. Configuration editors, extension install/uninstall, and other mutation flows continue to read and write `ns.toml` only; they never flatten the effective configuration back into the checked-in file. Commit-addressed, deployment, sandbox, and other cloud execution paths also read committed `ns.toml` only. Do not put configuration required by remote execution solely in `ns.local.toml`: the ignored overlay does not travel to the cloud.

Both files are parsed independently before their parsed TOML tables are merged and validated, so diagnostics identify the source file. An invalid local overlay fails the affected local configuration load rather than silently falling back to `ns.toml`.

## Descriptor modules

An extension descriptor is a cheap typed module that default-exports `defineExtension({ ... })` from `@nseng-ai/sdk`. The descriptor contains metadata plus lazy command-module thunks:

```ts
import { defineExtension } from "@nseng-ai/sdk";

export default defineExtension({
	group: "greet",
	description: "Greeting commands.",
	entries: [{ name: "hello", load: () => import("./commands/hello.ts") }],
});
```

Descriptor modules must stay side-effect-light and should import only `@nseng-ai/sdk` at top level. Command implementation modules own domain behavior and are loaded only when their command is selected.

## Preinstalled descriptor catalog

The SDK accepts an injected preinstalled command catalog derived from descriptor modules. Each entry carries command metadata and either a package module specifier or a descriptor-native lazy loader for the owning command module. The SDK treats these entries as ordinary catalog candidates at the preinstalled precedence level:

- top-level help and completion can list them from metadata;
- `ns.toml` descriptor entries can override them;
- selected-command help, JSON schema, and execution import only the selected command module;
- the owning package remains responsible for domain behavior, prompts, gateways, and presentation policy.

This keeps the SDK generic while allowing an installed CLI to bundle a reusable catalog.

## Loading behavior

Discovery is side-effect-light. `ns --version`, `ns --runtime`, unselected command lookup, and completion use built-in definitions, injected preinstalled metadata, and declared descriptor metadata without importing unrelated command implementation modules.

Top-level help (`ns`, `ns --help`, and `ns -h`) lists descriptor and preinstalled commands from metadata. Malformed discovery entries and help-time import failures that do not affect the selected command are printed as stderr warnings while the invocation continues and stdout remains reserved for primary output.

When a command is selected, the SDK imports and validates exactly that command contribution, including selected-command help and `--json-schema`. Diagnostics that affect the selected command are fatal, including higher-precedence broken overrides that would otherwise fall back to a lower-precedence command.

## Shell completion

`ns` ships first-party shell completion built on the Clinkr completion engine. Completion is a Clinkr primitive: Clinkr owns the static command/option/value planner over its own surface metadata, and the SDK wires that planner to the dynamic command catalog.

Supported shells are bash, zsh, and fish:

```bash
# bash (~/.bashrc)
eval "$(ns completion bash)"

# zsh (~/.zshrc)
eval "$(ns completion zsh)"

# fish (~/.config/fish/config.fish)
ns completion fish | source
```

Each `ns completion <shell>` command prints a setup script that registers a completion hook for `ns`. The script does not embed a snapshot of the command tree; it calls back into `ns completion exec resolve <words...>` so suggestions reflect the current built-in, preinstalled, and project descriptor catalog.

Resolution preserves lazy extension loading. Top-level completion is built from side-effect-light catalog metadata. Selected-command option and value completion imports only the selected command, matching selected-command help and JSON schema behavior. Extension commands can provide runtime value candidates through the optional `completionProvider` hook; provider failures are captured so static candidates remain available and resolver stdout stays candidate-only.

Limitations:

- bash, zsh, and fish only;
- no Carapace spec export backend;
- no rich file/directory completion helper API;
- candidate descriptions are omitted from resolver stdout.

## Extension authoring API

Start with the extension-author guide, [Writing an ns extension](./docs/writing-an-ns-extension.md). Descriptor modules default-export a descriptor object created with `defineExtension()` from `@nseng-ai/sdk`. Command modules default-export a command object, usually created with `defineCommand()`:

```ts
import { defineCommand, ok, z } from "@nseng-ai/sdk";

export default defineCommand({
	name: "hello",
	summary: "Say hello.",
	description: "Say hello with custom project policy.",
	schema: z.object({ name: z.string().default("world") }),
	resultSchema: z.string(),
	handler(_ctx, request) {
		return ok(`hello ${request.name}`);
	},
});
```

`@nseng-ai/sdk` is both the public author API for extensions (imported from the package root) and the host that loads them; the loading machinery is implementation hidden in the SDK. The authoritative SDK export reference lives in [`docs/sdk-reference.md`](./docs/sdk-reference.md). Extension authors should import SDK vocabulary from `@nseng-ai/sdk` rather than SDK implementation modules or lower packages unless another package explicitly documents a public API for that dependency.

Descriptor modules are leaf authoring surfaces, not shared libraries. If reusable behavior proves out inside one descriptor or command module, move or copy the contract into an owning package and expose it deliberately through `@nseng-ai/sdk` or another documented package export.

## Boundary checklist

Use these cut lines when deciding where code belongs:

- **SDK service:** discovery, loading, precedence, command presentation, completion, execution/context primitives, shell integration, and small author helpers with proven reuse or explicit necessity.
- **Extension or capability package:** workflow policy, prompts, external command choreography, gateway construction, domain behavior, command-specific rendering, and command names that should travel with the owning package rather than every SDK installation.
- **Preinstalled catalog entry:** distribution metadata for a reusable extension command, not proof that the SDK owns the command's behavior.
- **Internal workspace export:** package-to-package sharing for SDK-owned implementation seams, not an author API and not a reason for extension files to import SDK internals.

Future command slices should add tests at the layer that owns the behavior: SDK tests for generic discovery/loading/precedence/author-API contracts, owning-package tests for capability command behavior, and host tests for any explicit host mirror.
