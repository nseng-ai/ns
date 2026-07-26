# @nseng-ai/clinkr

**Clinkr: CLIs for clankers.**

Clinkr is a TypeScript toolkit for building CLIs that work for people and coding agents. It builds on [Commander](https://github.com/tj/commander.js) and adds a machine-facing layer driven by Zod schemas:

- one schema-backed model for command input, JSON Schema, and help;
- standardized JSON output for success, negative results, and errors.

## Fast by default

A CLI should pay to construct only what the invocation needs. Named commands and groups are lazy routes at every level: top-level help and name completion use cheap route metadata, while execution, deep help, and option/argument completion load only the selected path. Schemas, handlers, renderers, completion providers, and child routes stay behind one shared loader. Successful loads are cached for that app; unrelated routes are never constructed.

The agentic era makes CLIs more important, not less—and humans still matter. So Clinkr also provides:

- human-readable output from the same handlers;
- shell autocomplete derived from the same lazy route tree.

Commands take a schema-validated request object and return a schema-validated result. JSON in and out is uniform; flag spelling and human output stay customizable per application.

## Why Clinkr exists

Commander parses commands, options, and arguments well. We needed consistency in everything around parsing—especially when a coding agent, not a person at a terminal, calls the CLI.

Without a shared layer, each CLI invents its own way to describe inputs, emit JSON, represent errors, and expose schemas. Those differences make commands hard to discover and hard to call reliably. Clinkr centralizes the choices: a command's Zod schemas define its typed inputs and outputs, and Clinkr uses them to validate requests, publish JSON Schema, and produce a standard JSON response envelope.

Norms for agent-facing CLIs are still evolving. Keeping the mechanics in one package gives one point of leverage: as norms change, we improve Clinkr instead of redesigning every command.

> **Status:** This is a provisional contract under active review. Examples and behavior claims must be verified before this document is promoted to the package README.

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

A CLI needs no subcommands, command group, or application context. Create it asynchronously with a framework-supplied builder. The app owns the executable name; its root scope is transparent, and its one nameless default command is built eagerly with that scope:

```ts
import { ClinkrApp, ok } from "@nseng-ai/clinkr";
import { z } from "zod";

const app = await ClinkrApp.create(
	{ name: "greet", moduleUrl: import.meta.url },
	async (appBuilder) => {
		appBuilder.defaultCommand(async (commandBuilder) =>
			commandBuilder.define({
				schema: z.object({
					name: z.string(),
					enthusiastic: z.boolean().default(false),
				}),
				positionals: {
					name: { index: 0, description: "Person to greet." },
				},
				options: {
					enthusiastic: { description: "Add emphasis." },
				},
				resultSchema: z.object({ message: z.string() }),
				handler: async (request) =>
					ok({
						message: `Hello, ${request.name}${request.enthusiastic ? "!" : "."}`,
					}),
				renderHuman: (result) => result.message,
			}),
		);
		return await appBuilder.define();
	},
);

process.exitCode = await app.run(process.argv.slice(2));
```

The precise unimplemented method spellings in this draft are provisional; the settled contract is not: public authoring uses `ClinkrAppBuilder`, `ClinkrGroupBuilder`, and `ClinkrCommandBuilder`, callbacks are async and return the immutable object produced by the supplied builder, and runtime verifies that provenance. Every command builder defines exactly once; app/group `define()` finalizes its scope. Only `ClinkrApp` runs or computes completion.

This creates a command that can be called directly:

```console
$ greet Ada --enthusiastic
Hello, Ada!
```

Clinkr also adds two framework flags to every rendered command automatically: `--format <human|json|markdown>` selects the output format, and `--json-schema` prints the command's input/output schema without running it. The same invocation as JSON:

```console
$ greet Ada --enthusiastic --format json
{
  "status": "ok",
  "exitCode": 0,
  "data": {
    "message": "Hello, Ada!"
  }
}
```

The request schema drives parsing and validation. Schema keys are camelCase in TypeScript and become kebab-case CLI options. Mark positional fields with `positionals`; use `options` for option-specific help and surface metadata.

That is the minimum structured-result path: define a command through its builder, describe its request and result with Zod, finalize the app, and assign the returned exit code. Add context or named routes only when the CLI needs them.

A command that only performs an imperative action needs no `resultSchema`. Its builder handler may write application-owned stderr chatter and return `ok()` with no data.

Omitting all outcome data schemas is a bodyless-outcome contract, not an untyped result contract. Clinkr emits no result body for `ok()`. TypeScript rejects structured data on an outcome without a corresponding schema, and runtime validation rejects it at untyped boundaries. Any imperative writes are application-owned stderr chatter, which keeps JSON stdout clean. User-facing result output belongs in a structured result with command-level renderers.

`resultSchema` is the common-case schema for successful `ok(data)`. Optional `negativeSchema`, `failureSchema`, and `usageErrorSchema` enable structured `data` on those outcomes. Supplying a schema makes data required for that outcome; omitting it makes that outcome bodyless. Use `z.any()` explicitly when an outcome's data is intentionally untyped.

## Return explicit outcomes

Rendered command handlers return a `ClinkrExit` rather than writing output or terminating the process:

| Outcome         | Constructor       | Exit code | Human stream | Meaning                                         |
| --------------- | ----------------- | --------- | ------------ | ----------------------------------------------- |
| Success         | `ok()`/`ok(data)` | `0`       | stdout       | The operation completed.                        |
| Negative result | `negative(...)`   | `1`       | stdout       | The operation completed with a negative result. |
| Failure         | `failure(...)`    | `2`       | stderr       | The operation failed.                           |
| Usage error     | `usageError(...)` | `2`       | stderr       | The invocation was invalid.                     |

A **negative result** means the command worked but the answer was no: a lookup found nothing, a check did not pass, there was nothing to change. A **failure** means the operation could not complete—a dependency was unavailable, or an unexpected operational condition occurred. A handler picks the outcome directly:

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
appBuilder.command({ name: "find" }, async (commandBuilder) =>
	commandBuilder.define({
		schema: z.object({ name: z.string() }),
		resultSchema: contactSchema,
		negativeSchema: z.object({ searchedName: z.string() }),
		failureSchema: z.object({ service: z.string() }),
		usageErrorSchema: z.object({ conflictingFlags: z.array(z.string()) }),
		// handler and renderers...
	}),
);
```

Clinkr composes these command data schemas with its fixed fields into one top-level discriminated JSON Schema. Each `status` branch has predictable standard fields and either requires `data` matching its configured schema or omits `data` when no schema was configured. `--json-schema` publishes this complete input-and-outcome contract.

Clinkr follows the [`grep` exit-status convention](https://www.gnu.org/software/grep/manual/html_node/Exit-Status.html): `0` positive, `1` expected negative, `2` error. This is Clinkr's convention, not a universal CLI rule.

In human output, success and negative results both render to stdout: a negative result is an answer, not trouble—the same way `diff` prints differences to stdout with exit `1` and `grep -c` prints `0` with exit `1`. Failures and usage errors render to stderr. JSON output emits a discriminated machine envelope to stdout for every outcome. `ClinkrApp.run()` resolves to the exit code and never calls `process.exit()`.

Unexpected exceptions do not become expected failure outcomes. They propagate so the application can apply its own crash policy. This includes outcome data that does not satisfy the command's declared schema: request validation errors are usage errors, but invalid handler output is a programmer error, not an operational failure envelope.

## Human, Markdown, and JSON output

A rendered command may provide separate command-level success renderers:

```ts
appBuilder.command({ name: "status" }, async (commandBuilder) =>
	commandBuilder.define({
		schema: z.object({}),
		resultSchema: z.object({ state: z.string() }),
		handler: async () => ok({ state: "ready" }),
		renderHuman: (result) => `State: ${result.state}`,
		renderMarkdown: (result) => `**State:** ${result.state}`,
	}),
);
```

Clinkr selects the output format from its framework options. Without a Markdown renderer, Markdown output falls back to the human renderer. Without a human renderer, successful data prints as indented JSON. Outcomes do not carry per-exit human or Markdown overrides; rendering remains part of the command contract.

Every structured outcome has a corresponding command schema. Clinkr validates outcome data at runtime and publishes the composed discriminated schema through `--json-schema`; schema introspection never invokes the handler. Invalid outcome data throws as a programmer error for the app's crash policy. Omit a status schema only when that outcome has no data, or use `z.any()` to declare intentionally untyped data.

## One command, two audiences

The same command serves a person at a terminal and an agent parsing JSON. Clinkr's stream contract keeps them from interfering:

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

To do something different or more sophisticated—silence progress in tests, route it to a host status widget—use the context as the seam. Handlers receive only `(context, request)`, no output streams and no format flag, so a progress reporter injected through the context lets the application decide routing while the command just reports.

Two refinements when a command needs them:

- **Animation is TTY-gated.** Spinners and in-place redraws only when the output is a terminal; plain lines otherwise. The `@nseng-ai/clinkr/stream` sinks implement exactly this split.
- **Durable output to stdout mid-command is the one case that needs a format check.** A command that streams part of its answer before returning must know the selected format. Derive it from argv before `app.run()` and place it in the context; skip the stream entirely in JSON mode.

## Build a CLI with subcommands

Declare several lazy command routes directly in the app's transparent root scope:

```ts
const app = await ClinkrApp.create(
	{ name: "contacts", moduleUrl: import.meta.url },
	async (appBuilder) => {
		appBuilder.command(
			{ name: "list", description: "List contacts." },
			async (commandBuilder) =>
				commandBuilder.define({
					schema: z.object({}),
					resultSchema: z.object({ contacts: z.array(z.string()) }),
					handler: async () => ok({ contacts: ["Ada", "Grace"] }),
					renderHuman: (result) => result.contacts.join("\n"),
				}),
		);
		appBuilder.command(
			{ name: "add", description: "Add a contact." },
			async (commandBuilder) =>
				commandBuilder.define({
					schema: z.object({ name: z.string() }),
					resultSchema: z.object({ name: z.string() }),
					handler: async (request) => ok({ name: request.name }),
				}),
		);
		return await appBuilder.define();
	},
);
```

This gives one level of subcommands: `contacts list`, `contacts add Ada`. Invoking the group without a command prints its help.

Aliases are application-defined. Clinkr does not infer aliases from command or group names; configure each alias explicitly when the public CLI should expose one.

## Organize commands into subgroups

When a CLI has related command families, declare lazy group routes. Keep the app definition flat by putting each group's children in its own builder module:

```ts
const app = await ClinkrApp.create(
	{ name: "forge", version: "1.0.0", moduleUrl: import.meta.url },
	async (appBuilder) => {
		appBuilder.group(
			{ name: "issues", description: "Work with issues." },
			async (groupBuilder) => groupBuilder.import("./issues-group.ts"),
		);
		appBuilder.group(
			{ name: "pulls", description: "Work with pull requests." },
			async (groupBuilder) => groupBuilder.import("./pulls-group.ts"),
		);
		return await appBuilder.define();
	},
);
```

The imported module builds one group without nesting that work inside the app declaration:

```ts
// issues-group.ts
export async function build(
	groupBuilder: ClinkrGroupBuilder,
): Promise<ClinkrGroup> {
	groupBuilder.command(
		{ name: "list", description: "List open issues." },
		async (commandBuilder) =>
			commandBuilder.define({
				schema: z.object({}),
				resultSchema: z.object({ issues: z.array(z.string()) }),
				handler: async () => ok({ issues: ["Fix login"] }),
			}),
	);
	return await groupBuilder.define();
}
```

Builder imports are terminal: relative specifiers resolve from the module currently being built, whose standard named async `build(builder)` export returns the finalized immutable node. Named route callbacks load only when selected. `forge issues -h` constructs `issues` and its one default command, if present, but no named child or sibling. Route metadata—not loaded nodes—owns names, aliases, descriptions/help grouping, and hidden state.

This produces commands such as `forge issues list` and `forge pulls list`. Invoking `forge`, `forge issues`, or `forge pulls` without a leaf command prints help for that level.

Keep the hierarchy this shallow unless another level expresses a real user-facing distinction. Agent-only or internal groups can set `isHidden: true`: still invocable, hidden from the parent's help. Executable-level features such as `-V, --version` and `--runtime` belong to `ClinkrApp`, not to commands or groups. They are opt-in: an app exposes only the executable metadata surfaces it configures.

## Shell completion

Shell completion is an opt-in `ClinkrApp` feature. When enabled, it covers everything Clinkr already knows: command and subgroup names, aliases, options, and fixed values such as Zod enum choices. Candidates come from the same command tree and schemas as parsing and help—no separate completion definition to maintain.

An app that enables completion exposes a `completion` command for Bash, Zsh, and Fish. It prints a small shell script that calls back into the app's hidden completion resolver on Tab. To enable completion in the current shell:

```sh
# Bash
source <(forge completion bash)

# Zsh
source <(forge completion zsh)

# Fish
forge completion fish | source
```

For persistent installation, write the same script into the shell's completion directory and restart the shell: `~/.local/share/bash-completion/completions/forge` (Bash, requires the `bash-completion` framework), `~/.zfunc/_forge` (Zsh, with `~/.zfunc` in `fpath` before `compinit`), or `~/.config/fish/completions/forge.fish` (Fish).

The lower-level `renderClinkrCompletionScript` API in `@nseng-ai/clinkr/completion` lets an application choose its own visible setup command or hidden resolver path.

### Dynamic completion

Use a command's `completionProvider` for values known only at runtime. The provider receives the invocation context and the token being completed; it never runs the command handler.

For example, a checkout command can complete branch names from an injected Git gateway. This tree declares a context (`GitContext`), so the handler and provider take `(context, request)` instead of the one-argument `handler(request)` form used earlier—the rule is covered in [Context and testability](#context-and-testability):

```ts
interface GitContext {
	readonly git: GitGateway;
}

appBuilder.command({ name: "checkout" }, async (commandBuilder) =>
	commandBuilder.define({
		schema: z.object({ branch: z.string() }),
		resultSchema: z.object({ branch: z.string() }),
		completionProvider: async (context: GitContext, request) =>
			(await context.git.listBranches())
				.filter((branch) => branch.startsWith(request.current))
				.map((branch) => ({ value: branch, type: "positional-value" as const })),
		handler: async (context: GitContext, request) => {
			await context.git.checkout(request.branch);
			return ok({ branch: request.branch });
		},
	}),
);
```

Clinkr merges dynamic candidates with static ones and removes duplicates. If a provider throws, Clinkr invokes the app's optional completion-error callback with the thrown error and relevant command/completion context, then falls back to static candidates. The callback lets the application log or observe the failure without coupling providers to process stderr; a transient dependency failure still does not break Tab completion.

## Context and testability

Most real commands depend on something external: a filesystem, API client, repository, clock, or configuration. Pass those dependencies as **context** instead of constructing them inside handlers or reading globals. This lets you write full end-to-end tests of CLI commands with injected dependencies.

A contextful app declares one context type for its whole route tree. Commands infer it from their containing builder scope. The app receives one context value per run and passes it to the selected handler, including handlers in subgroups. Context construction and narrower adaptation stay above Clinkr.

```ts
interface ContactsContext {
	readonly contacts: ContactsGateway;
}

const context: ContactsContext = { contacts: new RealContactsGateway() };
process.exitCode = await app.run(process.argv.slice(2), { context });
```

The context type also applies to every subgroup beneath `contacts`; groups do not create, merge, or override context. There is no global context object—the value belongs to one `app.run(...)` invocation. Use it for explicit runtime dependencies, not miscellaneous mutable state.

This homogeneous tree context is the current contract. First-class per-command context derivation may come later; applications that need narrower domain contexts can build the adaptation outside Clinkr today.

Context-free command trees keep the simpler `handler(request)` and `app.run(args)` forms shown above.

The run boundary makes behavior easy to test. `runForTest` from `@nseng-ai/clinkr/testing` runs the app in-process and captures the observable CLI result; supply the same command tree with an in-memory fake context:

```ts
import { runForTest } from "@nseng-ai/clinkr/testing";

const run = await runForTest(app, ["list"], {
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

For plugin systems, keep the Clinkr tree's host context small and stable. Each plugin can own an application-level adapter that derives its narrower domain context before invoking its handler. This preserves Clinkr's homogeneous tree-context model without making every plugin dependency part of the host contract. Focused application-architecture examples should teach that pattern outside this primary package narrative.

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

### Raw Commander subtrees

`@nseng-ai/clinkr/raw` lets an application mount a Commander `Command` as an opaque subtree. The mounted command owns its complete surface and behavior: parsing, options, help, schemas if any, context, I/O, completion, output bytes, and exit policy. Clinkr does not inject framework flags or interpret anything inside the subtree.

Use this escape hatch when exact passthrough is the command's job, when an existing Commander tree must be reused, or when an application needs to work around a Clinkr limitation without abandoning Clinkr for the rest of its CLI.

The exact builder mounting shape remains to be settled during the raw-path reconciliation. See `@nseng-ai/clinkr/raw` and its exported types for the current mounting surface; the promoted README will show the reconciled builder form.

### Streaming output

`@nseng-ai/clinkr/stream` provides live-region sinks for progressive terminal output. TTY sinks may animate and manage cursor state; non-TTY sinks avoid cursor control and settle to ordinary output suitable for logs and automation.

```ts
const sink = createStreamSink(caps, deps);
await runStream(sink, async (stream) => {
	stream.update(["Fetching records…"]);
	await fetchRecords();
});
```

Progress belongs on stderr so JSON stdout stays clean. Durable answer streaming to stdout is exceptional and must be suppressed in JSON mode. See the stream entrypoint's exported types for sink, writer, clock, and rendering configuration.

## Public entrypoints

| Entrypoint                    | Purpose                                                                                         |
| ----------------------------- | ----------------------------------------------------------------------------------------------- |
| `@nseng-ai/clinkr`            | Apps, commands, command groups, outcomes, rendering, I/O, interaction, and core completion APIs |
| `@nseng-ai/clinkr/completion` | Completion planning and shell-script rendering                                                  |
| `@nseng-ai/clinkr/raw`        | Mounting opaque Commander command subtrees                                                      |
| `@nseng-ai/clinkr/stream`     | Progressive terminal and settled-output sinks                                                   |
| `@nseng-ai/clinkr/testing`    | Public command-testing utilities                                                                |

Every entrypoint ships full TypeScript types; those types are the detailed API reference until a separate docs surface exists. The README teaches adopter workflows rather than cataloging every low-level capability, I/O, envelope, format, emission, completion-planning, or testing utility.

## License

TBD before first public release.
