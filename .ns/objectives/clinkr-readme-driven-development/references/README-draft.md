# @nseng-ai/clinkr

Build schema-driven TypeScript command-line interfaces with one typed definition for parsing, help, completion, machine output, and JSON Schema introspection.

Clinkr provides the neutral CLI mechanics used by ns packages. You define a command tree with Zod request schemas and handlers that return explicit outcomes; Clinkr derives the command surface, validates input, renders human or machine output, and returns a process exit code without exiting the process itself.

> **Status:** This is a provisional contract under active review. Examples and behavior claims must be verified before this document is promoted to the package README.

## Requirements

- Node.js 24 or newer
- TypeScript with ESM
- Zod schemas for command requests and, when needed, successful results

## Define and run a CLI

Create a root `ClinkrGroup`, register commands, and pass the application's context when running it:

```ts
import { ClinkrGroup, ok } from "@nseng-ai/clinkr";
import { z } from "zod";

interface AppContext {
	readonly greeting: string;
}

const cli = new ClinkrGroup<AppContext>({
	name: "hello",
	description: "Print a greeting.",
	version: "1.0.0",
});

cli.command({
	name: "greet",
	description: "Greet a person.",
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
	handler: async (context, request) =>
		ok({
			message: `${context.greeting}, ${request.name}${request.enthusiastic ? "!" : "."}`,
		}),
	renderHuman: (result) => result.message,
});

const exitCode = await cli.run(process.argv.slice(2), {
	context: { greeting: "Hello" },
});

process.exitCode = exitCode;
```

The request schema is the source for parsing and validation. Schema keys use camel case in TypeScript and become kebab-case CLI options. Mark positional fields explicitly with `positionals`; use `options` to add option-specific help and surface metadata.

## Return explicit outcomes

Rendered command handlers return a `ClinkrExit` rather than writing output or terminating the process:

| Outcome         | Constructor       | Exit code | Meaning                                         |
| --------------- | ----------------- | --------- | ----------------------------------------------- |
| Success         | `ok(data)`        | `0`       | The operation completed.                        |
| Negative result | `negative(...)`   | `1`       | The operation completed with a negative result. |
| Failure         | `failure(...)`    | `2`       | The operation failed.                           |
| Usage error     | `usageError(...)` | `2`       | The invocation was invalid.                     |

For human output, successful results render to stdout while negative results and errors render to stderr. JSON output emits a discriminated machine envelope to stdout for every outcome. `run()` resolves to the corresponding exit code and never calls `process.exit()`.

Unexpected exceptions are not converted into expected failure outcomes. They propagate to the caller so the application can apply its own crash policy.

## Human, Markdown, and JSON output

A rendered command may provide separate success renderers:

```ts
cli.command({
	name: "status",
	schema: z.object({}),
	handler: async () => ok({ state: "ready" }),
	renderHuman: (result) => `State: ${result.state}`,
	renderMarkdown: (result) => `**State:** ${result.state}`,
});
```

Clinkr selects the output format from its framework options. If a Markdown renderer is absent, Markdown output falls back to the human renderer. If a human renderer is absent, successful data is formatted as indented JSON.

Add `resultSchema` when consumers need the successful data contract to appear in `--json-schema` output. Schema introspection does not invoke the command handler.

## Compose command groups

Use child groups to organize related commands:

```ts
const admin = new ClinkrGroup<AppContext>({
	name: "admin",
	description: "Administrative commands.",
});

// admin.command(...)
cli.group(admin);
```

Invoking a group without a leaf command prints that group's help. Groups intended only for agents or internal dispatch can set `isHidden: true`; hidden groups remain invocable but do not appear in their parent's help.

A group can also define a default command with `defaultCommand(...)`. Root groups may expose `-V, --version` and `--runtime` through their constructor options.

## Completion

Clinkr can derive static completion candidates from the same command tree used for dispatch:

```ts
const result = cli.complete({
	words: ["greet", "--"],
	cursor: 2,
});
```

Use `completeAsync(...)` and a command's `completionProvider` when candidates depend on application context. Provider failures fall back to static candidates. `renderClinkrCompletionScript` from `@nseng-ai/clinkr/completion` produces shell integration for Bash, Zsh, and Fish.

## Interactive confirmation

Use `createClinkrInteraction` and the confirmation helpers when a command may prompt. The interaction object keeps confirmation policy injectable for tests and non-interactive hosts. Commands that require a prompt should fail with a usage error when interaction is unavailable rather than hanging or silently assuming consent.

## Escape hatches

### Raw commands

`@nseng-ai/clinkr/raw` provides `rawCommand()` for commands that must own their bytes and numeric exit code directly. Raw commands do not use Clinkr's rendered outcome contract. Use them only when exact passthrough behavior is part of the command's job.

### Streaming output

`@nseng-ai/clinkr/stream` provides live-region sinks for progressive terminal output. TTY sinks may animate and manage cursor state; non-TTY sinks avoid cursor control and settle to ordinary output suitable for logs and automation.

## Testing

`@nseng-ai/clinkr/testing` provides captured I/O, test invocation helpers, fake confirmation, machine-envelope parsing, ANSI stripping, and import-boundary scanners. Inject I/O and interaction seams so command tests can assert observable behavior without mutating process-global state.

## Public entrypoints

| Entrypoint                    | Purpose                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------- |
| `@nseng-ai/clinkr`            | Command groups, outcomes, rendering, I/O, interaction, and core completion APIs |
| `@nseng-ai/clinkr/completion` | Completion planning and shell-script rendering                                  |
| `@nseng-ai/clinkr/raw`        | Raw command construction                                                        |
| `@nseng-ai/clinkr/stream`     | Progressive terminal and settled-output sinks                                   |
| `@nseng-ai/clinkr/testing`    | Public command-testing utilities                                                |
