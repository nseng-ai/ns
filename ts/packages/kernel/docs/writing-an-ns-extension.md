# Writing an ns extension

An ns extension is an npm package that contributes commands, points, and bundled artifacts to the
`ns` CLI. An extension declares everything about itself in **one typed descriptor module** that
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
import { defineExtension } from "@nseng-ai/kernel/sdk";

export default defineExtension({
	group: "hello",
	description: "Example ns extension.",
	entries: [
		{
			name: "world",
			load: () => import("./commands/hello.ts"),
		},
	],
});
```

**src/commands/hello.ts** — the command implementation:

```ts
import { defineCommand, ok, z } from "@nseng-ai/kernel/sdk";

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

Install it into a project and run it:

```bash
cd /path/to/your/project
npx ns install /path/to/my-extension
npx ns hello world ns              # → hello ns
npx ns hello world ns --shout      # → HELLO NS
npx ns hello world ns --format json
```

## The descriptor module

The descriptor is the single source of truth for what your extension provides. `ns` executes it
on every invocation to build the command catalog, so it must stay **cheap**:

- It may import only `@nseng-ai/kernel/sdk` (type-only imports are fine).
- It contains metadata and lazy `load` thunks — never command implementations, schemas built
  from heavy modules, gateways, or I/O.

Descriptor fields:

| Field              | Required | Meaning                                                                        |
| ------------------ | -------- | ------------------------------------------------------------------------------ |
| `group`            | no       | Top-level command group (`ns <group> <command>`). Omit for top-level commands. |
| `description`      | yes      | One-line group/extension description shown in `ns --help`.                     |
| `entries`          | no       | Command and subgroup entries (below).                                          |
| `points`           | no       | Extension point definitions (below).                                           |
| `bundledArtifacts` | no       | Bundled artifact declarations (below).                                         |

### Entries

`entries` is one recursive array holding two kinds of entry — command entries and group entries.
The same field name appears at the descriptor root and inside group entries.

Command entries:

| Field  | Required | Meaning                                                                                                                                 |
| ------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `name` | yes      | Command name (`kebab-case`), exactly what the user types. Must match the loaded command's `name`; a mismatch is a load-time diagnostic. |
| `load` | yes      | Lazy thunk `() => import("./commands/<file>.ts")` returning the command module. Nothing is imported until needed.                       |

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
	{ name: "list", load: () => import("./commands/list.ts") },
	{
		group: "exec",
		hidden: true,
		description: "Agent-only operations.",
		entries: [
			{ name: "tracking-gate", load: () => import("./commands/exec/tracking-gate.ts") },
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

A command module default-exports exactly one command object satisfying the **kernel command
contract**: a neutral interface carrying the command's `name`, help metadata (`summary`,
`description`), an optional completion hook, and a run function that returns the standard ns
command exit / machine-envelope shape (`ok` / `negative` / `failure` / `usageError`). The kernel
knows only this interface; how you build the object is up to you.

The convenient way — and the one this guide teaches — is `defineCommand({...})`, which adapts a
[Clinkr](../../infra/clinkr) command spec into the kernel contract: `name`, `summary` (one-line
help text), `description` (full help text), a Zod `schema` for arguments, optional
`positionals`/`options` (short flags), a `resultSchema` for the stable machine envelope,
`handler`, optional `renderHuman`/`renderMarkdown`, and optional `completionProvider`. Handlers
return the SDK's command-exit constructors (`ok`, `negative`, `failure`, `usageError`); argument
parsing, help rendering, `--format json`, and `--json-schema` come for free.

Clinkr is convenient, not required. The adaptation happens inside `defineCommand`, at authoring
time — the kernel never sees clinkr. For full control, construct the kernel command object
directly (below).

Command modules run in the target project via ns's TypeScript loader — you ship `src/` directly
(`files: ["src"]`); no build step is required. `@nseng-ai/kernel/sdk` is provided by the host at
load time, so command and schema types share identity with the running `ns`.

## The command contract (low-level)

The kernel's actual per-command contract is a small neutral object, constructed directly with
`defineRawCommand` when `defineCommand`'s clinkr conveniences don't fit — for example, when
adopting an existing CLI with its own argument parser:

| Field         | Required | Meaning                                                                                                                                                               |
| ------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`        | yes      | Command name; must match the descriptor entry.                                                                                                                        |
| `summary`     | yes      | One-line help text for group listings.                                                                                                                                |
| `description` | yes      | Full help text.                                                                                                                                                       |
| `run`         | yes      | `(ctx, invocation) => machine envelope`. `invocation.argv` is the raw argument tail after the command path — parse it however you like.                               |
| `complete`    | no       | Optional dynamic completion hook for the selected command. `defineCommand` builds this from `completionProvider`; raw commands may provide the neutral hook directly. |

You take on argument handling, help for your own flags, completion behavior, and rendering
yourself. One obligation is not negotiable: **every ns command answers `--format json` with the
standard machine envelope** (`ok` / `negative` / `failure` / `usage-error`). Return envelope exits
from `run`; the constructors are in the SDK.

This is how you bring an existing CLI into ns wholesale — mount it as one passthrough command
and let its own parser handle everything after the command name:

```ts
import { defineRawCommand, failure, ok } from "@nseng-ai/kernel/sdk";
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

`defineCommand` is this same contract with clinkr layered on top: it consumes
`invocation.argv` with your Zod schema and hands you parsed, typed values instead. Prefer it
unless you have a reason not to.

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

Bundled artifacts declare files shipped with the extension (currently skills) that
`ns update --extensions` provisions into harness roots (Claude Code, Pi, Codex):

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

## Installing an extension into a project

```bash
npx ns install <source>
```

`ns install` takes a **source spec**. Local package directories are supported today; the same
command will grow the familiar spec variants over time (as `pi install` already has):

```bash
npx ns install ./local/path
npx ns install npm:@acme/my-extension        # future
npx ns install git:github.com/user/repo     # future
npx ns install https://github.com/user/repo # future
```

For a local directory, `ns install`:

1. validates the directory (a `package.json` with `name`/`version` and an `./ns-extension`
   export);
2. installs it into the project's managed store,
   `.ns/managed-extensions/npm/node_modules/<package-name>` (local directories are linked, so
   source edits are picked up immediately — rerun `ns install` only when the declaration surface
   itself needs re-resolution);
3. records the directory you gave (the **source spec**) in the project's `ns.toml`:

```toml
extensions = ["/path/to/my-extension"]
```

The command is idempotent; re-running it refreshes the managed install and leaves `ns.toml`
unchanged. `.ns/managed-extensions/` belongs in your project's `.gitignore`; `ns.toml` is the
durable record.

Registry (`npm:pkg@version`) specs remain available directly in `ns.toml`; `.tgz` and bare
package-name installs are not yet supported.

## How loading works

- On each invocation, `ns` reads `ns.toml`, resolves each declared extension's `./ns-extension`
  export, and executes the descriptor to build the command catalog. Descriptors are small and
  transpile-cached, so this is fast.
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
- **`ns install` fails** — the error envelope names the failing precondition (missing
  package.json, missing `./ns-extension` export, npm install failure with command output).
- **Descriptor rejected** — the diagnostic names the field; descriptors are Zod-validated with
  the same rules as this document.
- **Name mismatch** — a loaded command whose `name` differs from its descriptor entry is a
  load-time diagnostic naming both values.

For the complete SDK surface behind these examples, see the
[`@nseng-ai/kernel/sdk` reference](./sdk-reference.md).

> Provenance: this guide was promoted from the extension-descriptor-contract Objective's
> README-driven draft. Its contract decisions were settled by structured grilling on 2026-07-07
> and then reconciled with the shipped SDK during implementation.
