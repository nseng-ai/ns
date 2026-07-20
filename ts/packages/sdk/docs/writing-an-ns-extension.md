# Writing an ns extension

An ns extension is an npm package that contributes commands, points, activation metadata, and bundled
artifacts to the `ns` CLI. An extension declares everything about itself in **one typed descriptor module** that
`ns` discovers through a standard package export. There are no JSON manifests, no registration
files, and no generated artifacts — the descriptor is ordinary TypeScript that you typecheck with
the rest of your code.

## Quick start

An extension is a package with three things: a `package.json` with an `./ns-extension` export, a
descriptor module, and one module per command.

```text
my-extension/
  package.json
  src/
    extension.ts        # the descriptor
    commands/
      hello.ts          # one command
```

Layout is yours to choose — the export map is the only contract. A package that does other things
besides being an ns extension can nest its ns integration wherever it likes (for example under
`src/ns/`) as long as the `./ns-extension` export points at the descriptor.

**package.json** — only standard npm fields:

```jsonc
{
  "name": "@acme/my-extension",
  "version": "0.1.0",
  "type": "module",
  "files": ["src"],
  "exports": {
    "./ns-extension": "./src/extension.ts"
  }
}
```

**src/extension.ts** — the descriptor:

```ts
import { defineExtension } from "@nseng-ai/sdk";

export default defineExtension({
	group: "hello",
	description: "Example ns extension.",
	entries: [
		{
			kind: "ns-command",
			name: "world",
			load: () => import("./commands/hello.ts"),
		},
	],
});
```

**src/commands/hello.ts** — the command implementation:

```ts
import { ok, z } from "@nseng-ai/sdk";
import { defineCommand } from "@nseng-ai/sdk/command";

export default defineCommand({
	name: "world",
	summary: "Print a greeting.",
	description: "Print a greeting to prove the extension works.",
	schema: z.object({
		name: z.string().describe("Who to greet."),
		shout: z.boolean().default(false).describe("Uppercase the greeting."),
	}),
	positionals: { name: { position: 0 } },
	resultSchema: z.object({ greeting: z.string() }),
	handler: (_ctx, request) => {
		const greeting = `hello ${request.name}`;
		return ok({ greeting: request.shout ? greeting.toUpperCase() : greeting });
	},
	renderHuman: (data) => `${data.greeting}\n`,
});
```

The Zod `schema` is the single source of CLI inputs: each field becomes a `--flag` by default,
and `positionals` promotes chosen fields to positional arguments. Parsing, validation, defaults,
and help text all derive from the schema.

Initialize a project, install the extension from its local directory, and run it:

```bash
cd /path/to/your/project
npx ns init --harness pi
npx ns extension install /path/to/my-extension
npx ns hello world ns              # → hello ns
npx ns hello world ns --shout      # → HELLO NS
npx ns hello world ns --format json
```

`ns init` must run first because extension installation reconciles activation against the
project's persisted harness selection. Use repeatable `--harness` flags to select the harnesses
for your project.

## The descriptor module

The descriptor is the single source of truth for what your extension provides. `ns` executes it
on every invocation to build the command catalog, so it must stay **cheap**:

- It may import only `@nseng-ai/sdk` (type-only imports are fine).
- It contains metadata and lazy `load` thunks — never command implementations, schemas built
  from heavy modules, gateways, or I/O.

Descriptor fields:

| Field              | Required | Meaning                                                                        |
| ------------------ | -------- | ------------------------------------------------------------------------------ |
| `group`            | no       | Top-level command group (`ns <group> <command>`). Omit for top-level commands. |
| `description`      | yes      | One-line group/extension description shown in `ns --help`.                     |
| `entries`          | no       | Command and subgroup entries (below).                                          |
| `points`           | no       | Extension point definitions (below).                                           |
| `activation`       | no       | Agent instructions and consumer-directory declarations (below).                |
| `bundledArtifacts` | no       | Bundled artifact declarations (below).                                         |

### Entries

`entries` is one recursive array holding two kinds of entry — command entries and group entries.
The same field name appears at the descriptor root and inside group entries.

Command entries are a strict discriminated union:

| Field               | Required | Meaning                                                                                                                                                                 |
| ------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kind`              | yes      | `"ns-command"` for a flat `NsCommandDefinition`, or `"raw-command"` for a process-shaped `RawArgvCommand`. The descriptor owns routing; the host never infers the kind. |
| `name`              | yes      | Command name (`kebab-case`), exactly what the user types. Must match the loaded command's `name`; a mismatch is a load-time diagnostic.                                 |
| `requiresExtension` | no       | Omit this command when the named extension package is absent from the effective registry.                                                                               |
| `load`              | yes      | Lazy thunk returning a module whose default export matches `kind`. Nothing is imported until needed.                                                                    |

Choose `ns-command` for a command that wants ns-hosted schema parsing, typed requests/results, rendering, completion, semantic events, and interactions. Choose `raw-command` for an existing CLI or process-shaped program that owns its argv parsing and process behavior. A malformed module is rejected according to the declared kind; ns does not fall back to the other route.

Group entries:

| Field         | Required | Meaning                                                                |
| ------------- | -------- | ---------------------------------------------------------------------- |
| `group`       | yes      | Subgroup name (`kebab-case`), mounted under the parent group.          |
| `description` | yes      | One-line subgroup description.                                         |
| `hidden`      | no       | `hidden: true` omits the subgroup from help listings; it still routes. |
| `entries`     | yes      | Nested entries — same recursive shape.                                 |

For example, the established ns convention of mounting skill/agent-only commands under
`ns <group> exec <name>` is expressed as an ordinary hidden subgroup:

```ts
entries: [
	{ kind: "raw-command", name: "list", load: () => import("./commands/list.ts") },
	{
		group: "exec",
		hidden: true,
		description: "Agent-only operations.",
		entries: [
			{
				kind: "raw-command",
				name: "tracking-gate",
				load: () => import("./commands/exec/tracking-gate.ts"),
			},
		],
	},
]
```

### Why a thunk?

`load` is always a thunk — a plain dynamic import the descriptor hands to `ns` to invoke later.
It is ordinary import syntax, so what happens is legible at the call site; it is typechecked
against the command-module shape (a wrong path or missing default export is a compile error, not
a runtime surprise); and it is statically visible to bundlers, which matters because ns's own
first-party descriptors are esbuild-bundled into the `ns` CLI. String paths are not accepted.

Bundler visibility is lexical, not clever: bundlers collect every `import("literal")` expression
at parse time, regardless of how deeply it nests inside callbacks — the thunk is never invoked
during bundling. This is the same `() => import(...)` idiom every lazy-loaded router route uses.
The one rule it imposes: keep the specifier a literal string. `import(somePath)` or a template
literal is opaque to bundlers and will not survive bundling.

## Command modules

A command module default-exports exactly one object matching the descriptor entry's declared kind.

For `kind: "ns-command"`, export a flat `NsCommandDefinition`, normally created by `defineCommand({...})` from `@nseng-ai/sdk/command`. Its fields are `name`, `summary`, optional `description`, optional Zod `schema`, `resultSchema`, optional `positionals`/`options`, optional renderers and completion provider, and `handler`. There is no nested `run`, runtime command brand, or loaded-value classification. `defineCommand` defaults `description` to `summary`.

The host adapts this known definition into Clinkr. Clinkr remains generic parser and presentation mechanics; it is not an extension-visible runtime type or brand. Handlers return the SDK's command-exit constructors (`ok`, `negative`, `failure`, `usageError`), while the host supplies argument parsing, help, `--format json`, and `--json-schema`.

A no-input ns command should omit `schema`. At registration, ns substitutes `z.strictObject({})`, so the request is an empty object and unknown keys are rejected. Commands with inputs place `schema`, `positionals`, and option metadata directly on the same flat definition.

Command modules run in the target project via ns's TypeScript loader — you ship `src/` directly
(`files: ["src"]`); no build step is required. `@nseng-ai/sdk` is provided by the host at
load time, so command and schema types share identity with the running `ns`.

Keep command-module import evaluation cheap too. A simple context-free command may default-export a
command object directly, as above. When a command needs composed runtime collaborators, default-export
a command factory and have the descriptor's lazy `load` thunk call it after importing the module. Build
Zod schemas and the dependency-bound command object inside that factory rather than at module scope.
Module scope should contain only inert constants, types, and function declarations; it should not
construct schemas, gateways, clients, or other runtime object graphs merely because the selected
command module was imported for help, completion, or JSON Schema inspection.

```ts
export function createHelloCommand(context: HelloCommandContext) {
	const requestSchema = z.object({
		name: z.string().default("world"),
	});
	return defineCommand({
		name: "hello",
		summary: "Say hello.",
		schema: requestSchema,
		resultSchema: z.string(),
		handler: (_invocation, request) => context.greet(request.name),
	});
}

export default createHelloCommand;
```

The descriptor keeps the composition root visible while preserving a literal import:

```ts
{
	kind: "ns-command",
	name: "hello",
	load: async () => ({
		default: (await import("./commands/hello.ts")).createHelloCommand(createRealContext()),
	}),
}
```

This keeps lazy loading honest: importing a selected command reveals its factory, while the descriptor chooses when and with which real or fake context to construct the executable command.

## The command contract (low-level)

A `kind: "raw-command"` entry loads a process-shaped `RawArgvCommand`. Use `defineRawCommand` when adopting an existing CLI or command with its own argument parser and process behavior:

| Field         | Required | Meaning                                                                                                                                 |
| ------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `name`        | yes      | Command name; must match the descriptor entry.                                                                                          |
| `summary`     | yes      | One-line help text for group listings.                                                                                                  |
| `description` | yes      | Full help text.                                                                                                                         |
| `run`         | yes      | `(ctx, invocation) => machine envelope`. `invocation.argv` is the raw argument tail after the command path — parse it however you like. |
| `complete`    | no       | Optional dynamic completion hook for the selected raw command.                                                                          |

You take on argument handling, help for your own flags, completion behavior, and rendering
yourself. One obligation is not negotiable: **every ns command answers `--format json` with the
standard machine envelope** (`ok` / `negative` / `failure` / `usage-error`). Return envelope exits
from `run`; the constructors are in the SDK.

This is how you bring an existing CLI into ns wholesale — mount it as one passthrough command
and let its own parser handle everything after the command name:

```ts
import { defineRawCommand, failure, ok } from "@nseng-ai/sdk";
import { runLegacyCli } from "../legacy/main.ts";

export default defineRawCommand({
	name: "legacy",
	summary: "The legacy CLI, wrapped.",
	description: "Passes all arguments through to the embedded legacy CLI.",
	run: async (_ctx, invocation) => {
		const exitCode = await runLegacyCli(invocation.argv);
		return exitCode === 0
			? ok({ exitCode })
			: failure("subcommand-failed", `legacy CLI exited ${exitCode}`, { exitCode });
	},
});
```

Raw commands remain process-shaped programs: they receive the argv tail and own parsing, help, completion, rendering, and output behavior. Prefer an `ns-command` when the ns host should own those mechanics; use `raw-command` when passthrough/process semantics are the honest contract. The descriptor's `kind` selects the route before loading, and no runtime brand is inspected.

## Extension points

Extension points declare named hook/prompt attachment sites that projects configure in `ns.toml`
`[points]`:

```ts
points: [
	{
		id: "submit.pre",
		accepts: "hook", // "hook" | "prompt"
		cardinality: "many", // "many" | "one"
		description: "Runs before submit.",
	},
	{
		id: "submit.pr-description",
		accepts: "prompt",
		cardinality: "one",
		default: "./prompts/pr-description.md",
	},
]
```

`cardinality` is the composition policy: `"many"` means any number of contributions may attach
(they compose); `"one"` means the point holds a single value and configuration wins. Richer
per-point constraints may arrive later; cardinality is deliberately the only constraint today.

Inspect them with `ns extension points` / `ns extension point <id>`.

## Bundled artifacts

Bundled artifacts declare files shipped with the extension (currently skills). Repository
lifecycle reconciliation provisions them into harness roots (Claude Code, Pi, Codex) when you run
`ns init` or `ns extension install`, `ns extension update`, or `ns extension uninstall`:

```ts
bundledArtifacts: [
	{
		kind: "skill",
		name: "my-skill",
		path: "./skills/my-skill",
		description: "What the skill does.",
	},
]
```

## Activation

`activation` is optional plain data describing how core lifecycle machinery should activate an
installed extension in a repository:

```ts
activation: {
	instructions: "## My extension\n\nUse `ns my-extension` to work with this extension.",
	consumerDirs: [".ns/my-extension"],
}
```

- `instructions` is an optional, non-empty Markdown section. It must begin on its first line with a
  non-empty level-2 heading (`## Title`) and may contain `###` or deeper subsections, but not a second
  level-2 section. ns preserves valid text verbatim.
- `consumerDirs` is an optional list of unique, canonical POSIX-style repository-relative directories
  strictly beneath `.ns/`, such as `.ns/my-extension/cache`. Absolute paths, `.ns` itself, trailing
  slashes, empty, `.` or `..` segments, backslashes, and duplicate entries are rejected rather than
  normalized.

There is deliberately no activation callback. Extensions declare what they need while ns lifecycle
orchestration owns all file writes, keeping activation bounded, auditable, and idempotent. `ns init`
and `ns extension install` render contributed instructions, create declared consumer directories, and
reconcile bundled artifacts. Consumer directories hold extension-owned durable data and are never
deleted automatically when an extension is uninstalled.

## Installing an extension into a project

First initialize the repository with at least one harness, then install a **source spec**:

```bash
npx ns init --harness pi
npx ns extension install ./local/path
npx ns extension install npm:@acme/my-extension
npx ns extension install npm:@acme/my-extension@1.2.3
```

The source grammar is explicit:

- `npm:<name>` and `npm:<name>@<version>` acquire registry packages. The unversioned form is a
  floating declaration; the versioned form is pinned.
- Every unprefixed value is a local package directory, resolved from the repository root. A bare
  package-looking value is still a local path, never an npm lookup.
- `git:` and URL sources are reserved but not supported yet.

Local packages resolve **in place** and are never copied or linked into managed storage, so source
edits are visible immediately. npm packages are acquired into a package-specific private project under
`.ns/managed-extensions/npm/<package-name>/`; `.ns/managed-extensions/` is ignored while `ns.toml`
is the committed durable declaration.

Before recording the exact requested spec, installation imports and fully validates the package's
`exports["./ns-extension"]` module, including the complete descriptor schema. It also rejects a
source whose canonical identity is already declared under a different spec: npm identity is the
package name, and local identity is the normalized absolute package path. Change the existing
`ns.toml` declaration deliberately rather than expecting install to replace a floating spec, pin,
or equivalent local spelling.

Re-running the **same exact spec** is idempotent. It restores a missing managed npm package, but it
does not refresh an already-present floating npm package; floating refresh belongs to the future
`ns extension update` command. After successful preflight, install records the spec and runs full
descriptor-driven activation for the harnesses persisted by `ns init`.

Activation writes use forward recovery rather than rollback. If a write fails after earlier duties
completed, the failure reports the phase and completed duties, preserves those writes, and a rerun
converges safely. Descriptor or activation-preflight failures write no durable declaration or
activation files, although acquired npm bytes may remain in ignored managed storage.

Lifecycle mutations (`ns init` and extension install, update, or uninstall) are observable in every
output mode. Human output streams deterministic chronological phase and resource decisions to stderr,
even when redirected, then writes the final result summary to stdout. JSON and Markdown suppress the
live trace and each emit one final document. Their additive `steps` array contains the same ordered,
typed lifecycle evidence, including completed effects before a traced failure; it intentionally has
no timestamps or durations. Update dry-runs explicitly record that no writes occurred and whether
exact prospective effects are available; uninstall records declaration removal or absence, managed
cleanup, and preservation of local sources and consumer data.

> **Trust warning:** npm acquisition uses `--ignore-scripts`, which disables npm lifecycle scripts;
> it does not sandbox extension code. Descriptor validation imports and executes the descriptor
> module, and selected commands execute extension code. Install only extensions you trust.

## How loading works

- On each invocation, `ns` reads `ns.toml` and passes declarations through one canonical loader.
  It validates the source spec, installed package identity, pinned npm version, `./ns-extension`
  export, descriptor file, and descriptor schema before producing a loaded descriptor record.
  Artifact activation consumes that same record rather than re-reading or independently
  interpreting the package. Descriptors are small and transpile-cached, so this is fast.
- Canonically duplicate declarations (including pinned/floating spellings of the same npm package
  and equivalent normalized local paths) produce one `extension_descriptor_duplicate_identity`
  diagnostic with `relatedSpecs`; every member of that duplicate group is excluded.
- Invoking a command loads only that command's module, via its `load` thunk.
- Rendering help for a selected group (`ns <group> --help`) loads that group's command modules
  eagerly to read module-owned summaries. Top-level help and completion stay catalog-driven and
  do not import unrelated command implementations; selected-command help, JSON schema, and
  execution import only the selected command module.
- A broken extension degrades, never breaks `ns`: descriptor load failures and
  descriptor/command mismatches surface as per-extension diagnostics on stderr while other
  extensions and built-ins keep working.

## Troubleshooting

- **Command missing from `ns --help`** — check the package has an `./ns-extension` export and the
  project's `ns.toml` lists the package; run `ns --help` and read stderr for per-extension
  diagnostics.
- **`ns extension install` fails** — the error envelope names the failing phase and structured
  diagnostics. If harnesses are missing or invalid, run
  `ns init --harness <claude-code|codex|pi>` first.
- **Descriptor rejected** — the diagnostic names the field; descriptors are Zod-validated with
  the same rules as this document.
- **Name mismatch** — a loaded command whose `name` differs from its descriptor entry is a
  load-time diagnostic naming both values.

For the complete SDK surface behind these examples, see the
[`@nseng-ai/sdk` reference](./sdk-reference.md).

> Provenance: this guide was promoted from the extension-descriptor-contract Objective's
> README-driven draft. Its contract decisions were settled by structured grilling on 2026-07-07
> and then reconciled with the shipped SDK during implementation.
