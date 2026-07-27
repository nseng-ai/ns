# @nseng-ai/clinkr

**Clinkr: CLIs for clankers.**

Clinkr is a TypeScript toolkit for building CLIs that work for people and coding agents. It builds on [Commander](https://github.com/tj/commander.js) and adds several capabilities:

- Commands and groups are laid out declaratively in the filesystem, keeping applications organized for people and agents while remaining lazy and fast by default.
- Each command accepts a schema-validated request object and returns a schema-validated result. JSON input, output, and schema introspection come out of the box.
- You can declaratively overlay a human-friendly CLI experience customized for your application.
- Shell autocomplete is derived from the same lazy command tree.

## Why Clinkr exists

Commander parses commands, options, and arguments well. We needed consistency in everything around parsing—especially when a coding agent, not a person at a terminal, calls the CLI.

Without a shared layer, each CLI invents its own way to describe inputs, emit JSON, represent errors, and expose schemas. Those differences make commands hard to discover and hard to call reliably. Clinkr centralizes the choices: a command's Zod schemas define its typed inputs and outputs, and Clinkr uses them to validate requests, publish JSON Schema, and produce a standard JSON response envelope.

Norms for agent-facing CLIs are still evolving. Keeping the mechanics in one package gives one point of leverage: as norms change, we improve Clinkr instead of redesigning every command.

## Organized and fast by default

In Clinkr, the directory tree is the command tree. Commands and groups have predictable locations, and their metadata, definitions, and implementations stay local. People and agents can discover the application surface by listing directories and open only the files relevant to a command—without tracing registration calls or maintaining a central manifest. As the CLI grows, new commands remain isolated rather than accumulating in shared initialization code.

Clinkr discovers this structure without constructing the entire command tree. Help and command-name completion import only cheap `metadata.ts` files and each group's cheap, complete `group.ts`. A command's `command.ts` and its domain logic are imported only when that command is selected for execution, help, schema introspection, or option-value completion. Only execution invokes the handler.

## Install

```sh
npm install @nseng-ai/clinkr zod
```

Zod is listed explicitly because your command definitions import it directly.

## Requirements

- Node.js 24 or newer
- An ESM TypeScript project
- Zod schemas for command requests and any structured outcome data

Clinkr suits applications that want structured commands and explicit output contracts. It does not wrap an existing executable; commands run as TypeScript handlers in the host application.

## Define and run one command

The recommended structure is a `src/cli/` directory governed by Clinkr's filesystem conventions. A single-command CLI has this shape:

```text
src/
  cli/
    app.ts
    metadata.ts
    command.ts
```

Treat `src/cli/` as owned by Clinkr's filesystem layout. Keep only the CLI entrypoint and Clinkr route files and directories there: `app.ts`, default-command `metadata.ts`/`command.ts`, named command directories, and group directories.

The `src/cli/metadata.ts` + `src/cli/command.ts` pair defines the app's optional default command. Metadata is cheap and always imported; the command is imported only when selected.

```ts
// src/cli/metadata.ts
import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr";

export function metadata(): ClinkrCommandMetadata {
  return { description: "Greet a person." };
}

// src/cli/command.ts
import { cliOption, cliPositional, defineCommand, ok } from "@nseng-ai/clinkr";
import { z } from "zod";

export async function command() {
  return defineCommand({
    schema: z.object({
      name: cliPositional(z.string(), {
        position: 0,
        description: "Person to greet.",
      }),
      enthusiastic: cliOption(z.boolean().default(false), {
        short: "-e",
        description: "Add emphasis.",
      }),
    }),
    resultSchema: z.object({ message: z.string() }),
    handler: async (request) =>
      ok({
        message: `Hello, ${request.name}${request.enthusiastic ? "!" : "."}`,
      }),
    renderHuman: (result) => result.message,
  });
}
```

The directory structure supplies each command or group name. A command's explicitly typed `metadata.ts` supplies its description or summary, explicit aliases, hidden state, and help grouping, while its selected-only `command.ts` returns `defineCommand({...})`. The generic helper lets `schema` and `resultSchema` drive handler and renderer inference. `metadata.ts` must stay cheap. `command.ts` may use ordinary top-level implementation imports because Clinkr does not import it for top-level or group help or for command-name completion.

`src/cli/app.ts` exports a function that constructs the app without doing work at import time. The executable path runs it only when the module is invoked directly:

```ts
// src/cli/app.ts
import { createClinkrApp } from "@nseng-ai/clinkr";

export async function app() {
  return createClinkrApp({
    name: "greet",
    commandDirectory: import.meta.dirname,
  });
}

if (import.meta.main) {
  const clinkr = await app();
  process.exitCode = await clinkr.run(process.argv.slice(2));
}
```

`import.meta.dirname` is the absolute `src/cli/` directory containing `app.ts` in Node 24+. This direct, self-rooted layout is the recommended shape.

This creates a command callable as `greet Ada --enthusiastic` or `greet Ada -e`. Clinkr adds `--format <human|json|markdown>` and `--json-schema` to every rendered command; `md` is an alias for `markdown`.

Every top-level field in the request's Zod object is part of the CLI input surface. By default, Clinkr projects a plain, unannotated field into a kebab-case long option: `planStoreRoot: z.string()` becomes required `--plan-store-root <value>`, and `verbose: z.boolean().default(false)` becomes optional `--verbose`. This projection is independent of output format: human, Markdown, and JSON invocations all use the same schema-derived argv parser.

Clinkr provides APIs for customizing that projection so you can fine-tune the developer and agent experience. Wrap Zod field declarations with these Clinkr functions:

- `cliPositional(...)` replaces the default option projection with a positional argument. It requires an explicit zero-based `position`; Clinkr never infers public argument order from object-field order.
- `cliOption(...)` keeps the field as an option while adding human-readable help, a short flag, or other customization. It decorates the default projection rather than opting the field into the CLI:

```ts
schema: z.object({
  repository: cliPositional(z.string(), {
    position: 0,
    description: "Repository to inspect.",
  }),
  limit: cliOption(z.number().int().positive().default(20), {
    short: "-n",
    description: "Maximum results.",
  }),
  verbose: z.boolean().default(false), // automatically --verbose
}),
```

Clinkr rejects request-schema fields it cannot project rather than silently making them unavailable. `cliPositional(...)` and `cliOption(...)` annotate the final Zod field through Clinkr's private typed metadata registry, so validation and the customized human CLI contract stay together.

### Customize the human CLI surface

Schemas own typed request data, but an application still owns the words people type and the help they read. Metadata in the hierarchy configures command and group aliases, summaries, help sections, and visibility. Clinkr's field helpers colocate descriptions, positional placement, and optional short flags with each Zod field:

```ts
// src/cli/contacts/find/metadata.ts
import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr";

export function metadata(): ClinkrCommandMetadata {
  return {
    description: "Find a contact by name.",
    summary: "Find a contact",
    aliases: ["lookup"],
    helpGroup: "Contacts",
  };
}

// src/cli/contacts/find/command.ts
import { cliOption, cliPositional, defineCommand } from "@nseng-ai/clinkr";
import { z } from "zod";

export async function command() {
  return defineCommand({
    schema: z.object({
      name: cliPositional(z.string(), {
        position: 0,
        description: "Contact name.",
      }),
      includeArchived: cliOption(z.boolean().default(false), {
        short: "-a",
        description: "Include archived contacts.",
      }),
      limit: cliOption(z.number().int().positive().default(20), {
        short: "-n",
        description: "Maximum matches.",
      }),
    }),
    // result schema, handler, and renderers...
  });
}
```

The same typed request is available through `contacts find Ada --include-archived --limit 5`, `contacts find Ada -a -n 5`, or the explicit alias `contacts lookup Ada`. Long flags derive from schema keys, while `cliOption(...)` adds presentation details such as help text and short flags. `cliPositional(...)` instead projects a field to an explicitly ordered argument. Aliases are always declared explicitly because they become supported public CLI surface.

Apply `cliOption(...)` or `cliPositional(...)` after Zod modifiers such as `.optional()` and `.default()`. Their CLI-only annotations do not appear in generated JSON Schema.

## Human, Markdown, and JSON output

A rendered command may provide separate command-level renderers for successful results:

```ts
import { defineCommand, ok } from "@nseng-ai/clinkr";
import { z } from "zod";

export async function command() {
  return defineCommand({
    schema: z.object({}),
    resultSchema: z.object({ state: z.string() }),
    handler: async () => ok({ state: "ready" }),
    renderHuman: (result) => `State: ${result.state}`,
    renderMarkdown: (result) => `**State:** ${result.state}`,
  });
}
```

Clinkr selects the output format from its standard `--format` option. The default is `human`; choose `markdown` or `json` for the other rendering modes.

The canonical operation always returns a structured object. Human and Markdown modes pass that same result to `renderHuman` or `renderMarkdown`, keeping every presentation derived from the structured result.

Every structured outcome has a corresponding command schema. Clinkr validates outcome data at runtime and publishes the composed discriminated schema through `--json-schema`.

## One command, two audiences

The same command serves a person at a terminal and an agent parsing JSON. Clinkr's output contract keeps the two from interfering:

- **stdout carries the answer.** Human mode: the rendered success or negative result. JSON mode: the machine envelope, and nothing else.
- **stderr carries trouble and progress.** Failures, usage errors, and any mid-command chatter.

Renderers receive the data and the resolved sink's `RenderCapabilities`, so one renderer can serve both a rich terminal and a plain pipe:

```ts
renderHuman: (result, caps) =>
	caps.canEmitAnsi ? styled(result) : plain(result),
```

Even without the check, styling is safe: when the sink cannot display ANSI (a pipe, a redirect, a test), Clinkr strips escape codes from the rendered output. Write for the terminal; machines get plain text.

### Mid-command progress

By convention in basic CLI applications—`git`, `curl`—progress and logging go to **stderr**; **stdout** carries the machine-parseable output. Clinkr's contract leans on that convention: the JSON envelope owns stdout, so anything written to stderr mid-command is automatically safe for machine consumers—no format check needed.

Beyond that, you are free to define your own policy. Clinkr's context objects are a natural place to inject environment-specific I/O or support hosting in other environments, such as agent harnesses or web applications.

## Build a CLI with subcommands

Filesystem paths are command paths:

```text
cli/
  app.ts
  metadata.ts             # optional app-default metadata
  command.ts              # optional app-default definition
  issues/
    group.ts              # `issues` is a named group
    metadata.ts           # optional `issues` default metadata
    command.ts            # optional `issues` default definition
    list/
      metadata.ts         # `issues list` metadata
      command.ts          # `issues list` definition
    labels/
      group.ts            # `issues labels` group
      add/
        metadata.ts       # `issues labels add` metadata
        command.ts        # `issues labels add` definition
```

The conventions are mechanical:

- a directory with `group.ts` is a named group;
- a required `metadata.ts` + `command.ts` pair without a peer `group.ts` is the named command represented by its directory;
- that required pair beside `group.ts` is the group's default command;
- the required pair at root is the app default;
- either command file without the other is invalid.

A group uses one eager `group.ts`; a command uses exactly the two-file metadata/definition seam. There is no optional sidecar, generated manifest, generated runtime module, compatibility shape, or production codegen step.

```ts
// cli/issues/group.ts
import type { ClinkrGroupDefinition } from "@nseng-ai/clinkr";

export function group(): ClinkrGroupDefinition {
  return {
    description: "Work with issues.",
    summary: "Issue workflows",
    aliases: ["issue"],
    hidden: false,
    helpGroup: "Work",
  };
}
```

A leaf remains concrete as one required metadata/definition pair:

```ts
// cli/issues/list/metadata.ts
import type { ClinkrCommandMetadata } from "@nseng-ai/clinkr";

export function metadata(): ClinkrCommandMetadata {
  return { description: "List open issues." };
}

// cli/issues/list/command.ts
import { defineCommand, ok } from "@nseng-ai/clinkr";
import { z } from "zod";

export async function command() {
  return defineCommand({
    schema: z.object({}),
    resultSchema: z.object({ issues: z.array(z.string()) }),
    handler: async () => ok({ issues: ["Fix login"] }),
    renderHuman: (result) => result.issues.join("\n"),
  });
}
```

## Shell completion

Shell completion is an opt-in `ClinkrApp` feature. When enabled, it covers everything Clinkr already knows: command and subgroup names, aliases, options, and fixed values such as Zod enum choices. Candidates come from the same command tree and schemas as parsing and help—no separate completion definition to maintain.

An app that enables completion exposes a `completion` command for Bash, Zsh, and Fish. It prints a small shell script that calls back into the app's hidden completion resolver on Tab. To enable completion in the current shell:

```sh
# Bash
source <(your_app completion bash)

# Zsh
source <(your_app completion zsh)

# Fish
your_app completion fish | source
```

For persistent installation, write the same script into the shell's completion directory and restart the shell: `~/.local/share/bash-completion/completions/your_app` (Bash, requires the `bash-completion` framework), `~/.zfunc/_your_app` (Zsh, with `~/.zfunc` in `fpath` before `compinit`), or `~/.config/fish/completions/your_app.fish` (Fish).

The lower-level `renderClinkrCompletionScript` API in `@nseng-ai/clinkr/completion` lets an application choose its own visible setup command or hidden resolver path.

### Dynamic completion

Use a command's `completionProvider` for values known only at runtime. The provider receives the invocation context and the token being completed; it never runs the command handler.

For example, a checkout command can complete branch names from Git. This tree declares a context (`YourAppContext`), so the handler and provider take `(context, request)` instead of the one-argument `handler(request)` form used earlier. This rule is covered in [Context and testability](#context-and-testability):

```ts
import { defineCommand, ok } from "@nseng-ai/clinkr";
import { z } from "zod";

interface YourAppContext {
  readonly git: GitRepo;
}

export async function command() {
  return defineCommand<YourAppContext>({
		schema: z.object({ branch: z.string() }),
		resultSchema: z.object({ branch: z.string() }),
		completionProvider: async (context: YourAppContext, request) =>
			(await context.git.listBranches())
				.filter((branch) => branch.startsWith(request.current))
				.map((branch) => ({ value: branch, type: "positional-value" as const })),
		handler: async (context: YourAppContext, request) => {
			await context.git.checkout(request.branch);
			return ok({ branch: request.branch });
		},
  });
}
```

## Context and testability

Most real commands depend on something external: a filesystem, API client, repository, clock, or configuration. Pass those dependencies as **context** instead of constructing them inside handlers or reading globals. This lets you write full end-to-end tests of CLI commands with injected dependencies. CLIs are only getting more ambitious and complex. Testability must be a first-class concern.

A contextful app explicitly selects a typed context mode for its whole command tree. Context-free is the default when no mode is specified. Commands share the selected context type through the discovered tree. The app receives one context value per run and passes it to the selected handler, including handlers in subgroups. Context construction and narrower adaptation stay above Clinkr.

```ts
interface ContactsContext {
  readonly contacts: Contacts;
}

if (import.meta.main) {
  const clinkr = await app();
  const context: ContactsContext = { contacts: new RealContacts() };
  process.exitCode = await clinkr.run(process.argv.slice(2), { context });
}
```

The context type also applies to every subgroup beneath `contacts`; groups do not create, merge, or override context. There is no global context object—the value belongs to one `clinkr.run(...)` invocation. Use it for explicit runtime dependencies, not miscellaneous mutable state.

This homogeneous tree context is the current contract. First-class per-command context derivation may come later; applications that need narrower domain contexts can build the adaptation outside Clinkr today.

Context-free command trees keep the simpler `handler(request)` and `clinkr.run(args)` forms shown above.

The run boundary makes behavior easy to test. `runForTest` from `@nseng-ai/clinkr/testing` runs the app in-process and captures the observable CLI result; supply the same command tree with an in-memory fake context:

```ts
import { runForTest } from "@nseng-ai/clinkr/testing";

// Same as running "contacts list" from the CLI, but with injected dependencies.
const clinkr = await app();
const run = await runForTest(clinkr, ["list"], {
	context: {
		contacts: {
			list: async () => ["Ada", "Grace"],
			add: async () => {},
		},
	},
});

expect(run).toMatchObject({
	exitCode: 0,
	stdout: "Ada\nGrace\n",
	stderr: "",
});
```

`@nseng-ai/clinkr/testing` provides captured I/O, test invocation helpers, fake confirmation, machine-envelope parsing, ANSI stripping, and import-boundary scanners. Tests exercise parsing, handlers, rendering, and exit codes together without touching process-global state or real external dependencies.

## Advanced: explicit outcomes

Rendered command handlers return a `ClinkrExit` rather than writing output or terminating the process:

| Outcome         | Constructor       | Exit code | Human stream | Meaning                                       |
| --------------- | ----------------- | --------- | ------------ | --------------------------------------------- |
| Success         | `ok()`/`ok(data)` | `0`       | stdout       | The command completed.                        |
| Negative result | `negative(...)`   | `1`       | stdout       | The command completed with a negative result. |
| Failure         | `failure(...)`    | `2`       | stderr       | The command failed.                           |
| Usage error     | `usageError(...)` | `2`       | stderr       | The invocation was invalid.                   |

A **negative result** means the command worked but the answer was no: a lookup found nothing, a check did not pass, there was nothing to change. A **failure** means the command could not complete—a dependency was unavailable, or an unexpected condition occurred. A handler picks the outcome directly:

```ts
import { failure, negative, ok } from "@nseng-ai/clinkr";

handler: async (request) => {
	const record = await lookupContact(request.name);
	if (record === undefined) return negative(`No contact named ${request.name}.`);
	if (record.isCorrupt) return failure("corrupt-record", `Contact ${request.name} cannot be read.`);
	return ok(record);
},
```

(`usageError(...)` is for invalid invocations a handler detects beyond schema validation, such as mutually exclusive flags.)

The distinction gives scripts more than success-or-error. Exit code `1` drives an expected alternate branch; exit code `2` says report, retry, or stop. JSON consumers make the same decision from the envelope's `status` discriminant instead of parsing prose:

```console
$ contacts find Bob --format json
{
  "status": "negative",
  "exitCode": 1,
  "message": "No contact named Bob."
}
$ echo $?
1
```

Failure and usage-error envelopes have the same shape plus an `errorType` string; success envelopes carry configured result data under `data` (shown in the first example above). Any outcome can carry structured `data` when the command declares its corresponding schema:

```ts
import { defineCommand } from "@nseng-ai/clinkr";

export async function command() {
  return defineCommand({
    schema: z.object({ name: z.string() }),
    resultSchema: contactSchema,
    negativeSchema: z.object({ searchedName: z.string() }),
    failureSchema: z.object({ service: z.string() }),
    usageErrorSchema: z.object({ conflictingFlags: z.array(z.string()) }),
    // handler and renderers...
  });
}
```

Clinkr validates each outcome against its corresponding schema and includes the complete outcome contract in `--json-schema`. An outcome without structured data does not need a schema.

## Interactive confirmation

Use `createClinkrInteraction` and the confirmation helpers when a command may prompt. Put the interaction in application context so the same command can receive a real terminal adapter, a deliberately unavailable interaction in non-interactive hosts, or a strict fake in tests.

```ts
handler: async (context, request) => {
	const confirmation = await confirmInteractiveOrUsageError(context.interaction, {
		message: `Delete ${request.name}?`,
	});
	if (confirmation.type !== "confirmed") return confirmation;
	await context.records.delete(request.name);
	return ok();
},
```

A command that requires a prompt must return a usage error when interaction is unavailable—never hang or silently assume consent. `@nseng-ai/clinkr/testing` supplies strict interaction fakes for confirming expected prompts and answers without process-global terminal state. The exported interaction and testing types cover the lower-level policy and adapter options.

## Escape hatches

### Raw execution

`@nseng-ai/clinkr/raw` provides `defineRawCommand(...)`, a narrow, framework-neutral escape hatch for a selected command that must receive its raw argv tail and own its output bytes and exit status. A raw filesystem module keeps the standard `command()` export and returns this raw definition. Clinkr still owns application routing and command metadata; it does not parse the selected command's argv tail or wrap its output in the rendered-command contract.

Use this only for genuine passthrough or byte-owning commands, such as adapting an embedded parser or a process-like runner. Prefer an ordinary `ClinkrCommand` whenever Clinkr can model the command's schema, outcomes, and rendering. Mounting an opaque Commander subtree is not part of this contract; add a framework-specific adapter only when a concrete application requires one.

## Advanced: programmatic builders

Filesystem-defined command structures are the common authoring path. A narrow, scoped callback builder is the advanced escape hatch for programmatic topology, extension mounting, custom loading, framework integration, and packaging environments that cannot preserve command directories. It mounts lazy topology sources that use the same selected-only loading and command-dispatch runtime as filesystem discovery; immutable nodes, provenance, and publication remain private. Mounted sources must own disjoint subtrees: duplicate command paths and shared group paths are errors. A separate advanced guide will document the callback API; this README intentionally does not teach it.

## Public entrypoints

| Entrypoint                    | Purpose                                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `@nseng-ai/clinkr`            | Apps, structured commands, command groups, outcomes, rendering, interaction, and app completion configuration |
| `@nseng-ai/clinkr/completion` | Completion planning and shell-script rendering                                                                |
| `@nseng-ai/clinkr/raw`        | Framework-neutral raw command construction and argv/output/exit ownership                                     |
| `@nseng-ai/clinkr/stream`     | Progressive terminal and settled-output sinks                                                                 |
| `@nseng-ai/clinkr/testing`    | Public command-testing utilities                                                                              |

Specialized APIs are available only from their named subpaths; the package root does not re-export raw construction, completion planning, stream sinks, or testing helpers. Every entrypoint ships full TypeScript types; those types are the detailed API reference until a separate docs surface exists. The README teaches adopter workflows rather than cataloging every low-level capability, I/O, envelope, format, emission, completion-planning, or testing utility.

## License

TBD before first public release.
