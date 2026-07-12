# @nseng-ai/sdk

`@nseng-ai/sdk` owns the `ns` CLI host and the `@nseng-ai/sdk/sdk` author API for command-contributing extensions. It owns command discovery, precedence, selected-command loading, argument/schema parsing, rendering glue, completion plumbing, shell integration, and execution-context construction. It does not own concrete workflow policy or capability command surfaces; those belong to the extension or capability package that contributes them.

## Command catalog

The kernel builds a command catalog from lightweight metadata before it imports selected command code. Catalog entries come from three source levels, in increasing precedence:

```text
built-in command table < preinstalled descriptor catalog < ns.toml-declared descriptors
```

Built-in commands are kernel-owned host commands. Preinstalled descriptor catalog entries are injected by the installed CLI distribution so reusable first-party extensions can be available without every repository declaring them. Project entries come from extension packages listed in repo-root `ns.toml`; each package exposes `exports["./ns-extension"]` as a typed descriptor module. Higher-precedence entries override lower-precedence entries with the same command key; overrides are recorded as diagnostics rather than compatibility aliases.

## Descriptor modules

An extension descriptor is a cheap typed module that default-exports `defineExtension({ ... })` from `@nseng-ai/sdk/sdk`. The descriptor contains metadata plus lazy command-module thunks:

```ts
import { defineExtension } from "@nseng-ai/sdk/sdk";

export default defineExtension({
	group: "greet",
	description: "Greeting commands.",
	entries: [{ name: "hello", load: () => import("./commands/hello.ts") }],
});
```

Descriptor modules must stay side-effect-light and should import only `@nseng-ai/sdk/sdk` at top level. Command implementation modules own domain behavior and are loaded only when their command is selected.

## Preinstalled descriptor catalog

The kernel accepts an injected preinstalled command catalog derived from descriptor modules. Each entry carries command metadata and either a package module specifier or a descriptor-native lazy loader for the owning command module. The kernel treats these entries as ordinary catalog candidates at the preinstalled precedence level:

- top-level help and completion can list them from metadata;
- `ns.toml` descriptor entries can override them;
- selected-command help, JSON schema, and execution import only the selected command module;
- the owning package remains responsible for domain behavior, prompts, gateways, and presentation policy.

This keeps the kernel generic while allowing an installed CLI to bundle a reusable catalog.

## Loading behavior

Discovery is side-effect-light. `ns --version`, `ns --runtime`, unselected command lookup, and completion use built-in definitions, injected preinstalled metadata, and declared descriptor metadata without importing unrelated command implementation modules.

Top-level help (`ns`, `ns --help`, and `ns -h`) lists descriptor and preinstalled commands from metadata. Malformed discovery entries and help-time import failures that do not affect the selected command are printed as stderr warnings while the invocation continues and stdout remains reserved for primary output.

When a command is selected, the kernel imports and validates exactly that command contribution, including selected-command help and `--json-schema`. Diagnostics that affect the selected command are fatal, including higher-precedence broken overrides that would otherwise fall back to a lower-precedence command.

## Shell completion

`ns` ships first-party shell completion built on the Clinkr completion engine. Completion is a Clinkr primitive: Clinkr owns the static command/option/value planner over its own surface metadata, and the kernel wires that planner to the dynamic command catalog.

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

Start with the extension-author guide, [Writing an ns extension](./docs/writing-an-ns-extension.md). Descriptor modules default-export a descriptor object created with `defineExtension()` from `@nseng-ai/sdk/sdk`. Command modules default-export a command object, usually created with `defineCommand()`:

```ts
import { defineCommand, ok, z } from "@nseng-ai/sdk/sdk";

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

`@nseng-ai/sdk/sdk` is the public author API for extensions. `@nseng-ai/sdk` is the host/kernel container that loads extensions. The authoritative SDK export reference lives in [`docs/sdk-reference.md`](./docs/sdk-reference.md). Extension authors should import SDK vocabulary from `@nseng-ai/sdk/sdk` rather than kernel implementation modules or lower packages unless another package explicitly documents a public API for that dependency.

Descriptor modules are leaf authoring surfaces, not shared libraries. If reusable behavior proves out inside one descriptor or command module, move or copy the contract into an owning package and expose it deliberately through `@nseng-ai/sdk/sdk` or another documented package export.

## Boundary checklist

Use these cut lines when deciding where code belongs:

- **Kernel service:** discovery, loading, precedence, command presentation, completion, execution/context primitives, shell integration, and small author helpers with proven reuse or explicit necessity.
- **Extension or capability package:** workflow policy, prompts, external command choreography, gateway construction, domain behavior, command-specific rendering, and command names that should travel with the owning package rather than every kernel installation.
- **Preinstalled catalog entry:** distribution metadata for a reusable extension command, not proof that the kernel owns the command's behavior.
- **Internal workspace export:** package-to-package sharing for kernel-owned implementation seams, not an author API and not a reason for extension files to import kernel internals.

Future command slices should add tests at the layer that owns the behavior: kernel tests for generic discovery/loading/precedence/SDK contracts, owning-package tests for capability command behavior, and host tests for any explicit host mirror.
