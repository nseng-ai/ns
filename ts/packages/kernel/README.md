# @ns/kernel

`@ns/kernel` owns the `ns` CLI host and the `@ns/kernel/sdk` author API for command-contributing extensions. It owns command discovery, precedence, selected-command loading, argument/schema parsing, rendering glue, completion plumbing, shell integration, and execution-context construction. It does not own concrete workflow policy or capability command surfaces; those belong to the extension or capability package that contributes them.

## Command catalog

The kernel builds a command catalog from lightweight metadata before it imports selected command code. Catalog entries can come from four source levels, in increasing precedence:
```text
built-in command table < preinstalled extension metadata < $XDG_DATA_HOME/ns/extensions < <cwd>/.ns/extensions
```

Built-in commands are kernel-owned host commands. Preinstalled extension metadata is injected by the installed CLI distribution so reusable first-party extensions can be available without every repository checking in matching manifests. Global and project roots provide user- or repository-local entries. Higher-precedence entries override lower-precedence entries with the same command key; overrides are recorded as diagnostics rather than compatibility aliases.

## Extension roots

Global and project extension roots support these one-level entry shapes:

```text
.ns/extensions/greet.ts
.ns/extensions/greet.js
.ns/extensions/greet/index.ts
.ns/extensions/greet/index.js
.ns/extensions/package-name/package.json
```

Direct files and directory indexes infer one command-entry name from the file or directory name. Package manifests provide command metadata without importing command modules:
```json
{
	"ns": {
		"commands": [
			{
				"name": "greet",
				"description": "Say hello.",
				"fullDescription": "Say hello with custom project policy.",
				"entry": "./src/greet.ts"
			}
		]
	}
}
```

Manifest command entries require `name`, `description`, and a relative POSIX-style `entry` path to a `.ts` or `.js` file. `fullDescription` is optional and defaults to `description`. A manifest can declare a `group` and command `path` segments for nested command surfaces. Command path segments must match `[a-z][a-z0-9-]*`; slashes, colons, spaces, and uppercase names are not supported.

Duplicate command names within one extension root are errors. Across roots, higher-precedence sources override lower-precedence sources. The legacy `.ns/commands/<command>.ts` path has been removed and is not a compatibility fallback.

## Preinstalled extension metadata

The kernel accepts an injected preinstalled command catalog. Each preinstalled catalog entry carries the same command metadata as a filesystem manifest plus a module specifier for the owning package's command module. The kernel treats these entries as ordinary catalog candidates at the preinstalled precedence level:

- top-level help and completion can list them from metadata;
- global and project entries can override them;
- selected-command help, JSON schema, and execution import only the selected module;
- the owning package remains responsible for domain behavior, prompts, gateways, and presentation policy.

This keeps the kernel generic while allowing an installed CLI to bundle a reusable catalog.

## Loading behavior

Discovery is side-effect-light. `ns --version`, `ns --runtime`, unselected command lookup, and completion use built-in definitions, injected preinstalled metadata, filesystem entries, and JSON manifests without importing unrelated external extension modules.

Top-level help (`ns`, `ns --help`, and `ns -h`) imports non-package direct-file and directory-index extension modules only so the command list can show their explicit summaries. Package manifest commands and preinstalled commands are listed from metadata. Malformed discovery entries and help-time import failures that do not affect the selected command are printed as stderr warnings while the invocation continues and stdout remains reserved for primary output.

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

Each `ns completion <shell>` command prints a setup script that registers a completion hook for `ns`. The script does not embed a snapshot of the command tree; it calls back into `ns completion exec resolve <words...>` so suggestions reflect the current built-in, preinstalled, global, and project-local catalog.

Resolution preserves lazy extension loading. Top-level completion is built from side-effect-light catalog metadata. Selected-command option and value completion imports only the selected command, matching selected-command help and JSON schema behavior. Extension commands can provide runtime value candidates through the optional `completionProvider` hook; provider failures are captured so static candidates remain available and resolver stdout stays candidate-only.

Limitations:

- bash, zsh, and fish only;
- no Carapace spec export backend;
- no rich file/directory completion helper API;
- candidate descriptions are omitted from resolver stdout.

## Extension authoring API

Extension modules default-export an extension object created with `defineExtension()` from `@ns/kernel/sdk`. Command contributions live in the extension's optional `commands` array:
```ts
import { defineExtension, ok, z } from "@ns/kernel/sdk";

export default defineExtension({
	commands: [
		{
			name: "greet",
			summary: "Say hello.",
			description: "Say hello with custom project policy.",
			schema: z.object({ name: z.string().default("world") }),
			run(_ctx, request) {
				return ok(`hello ${request.name}`);
			},
		},
	],
});
```

`@ns/kernel/sdk` is the public author API for extensions. `@ns/kernel` is the host/kernel container that loads extensions. The authoritative SDK export reference lives in [`docs/sdk-reference.md`](./docs/sdk-reference.md). Extension authors should import SDK vocabulary from `@ns/kernel/sdk` rather than kernel implementation modules or lower packages unless another package explicitly documents a public API for that dependency.

Single-file extension modules are leaf authoring surfaces, not shared libraries. Workspace packages must not import from `.ns/extensions/*.ts` files. If reusable behavior proves out inside one extension, move or copy the contract into an owning package and expose it deliberately through `@ns/kernel/sdk` or another documented package export.

## Boundary checklist
Use these cut lines when deciding where code belongs:

- **Kernel service:** discovery, loading, precedence, command presentation, completion, execution/context primitives, shell integration, and small author helpers with proven reuse or explicit necessity.
- **Extension or capability package:** workflow policy, prompts, external command choreography, gateway construction, domain behavior, command-specific rendering, and command names that should travel with the owning package rather than every kernel installation.
- **Preinstalled catalog entry:** distribution metadata for a reusable extension command, not proof that the kernel owns the command's behavior.
- **Internal workspace export:** package-to-package sharing for kernel-owned implementation seams, not an author API and not a reason for extension files to import kernel internals.

Future command slices should add tests at the layer that owns the behavior: kernel tests for generic discovery/loading/precedence/SDK contracts, owning-package tests for capability command behavior, and host tests for any explicit host mirror.