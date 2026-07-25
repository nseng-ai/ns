# @nseng-ai/clinkr

**Clinkr: CLIs for clankers.**

Clinkr is a TypeScript toolkit for building command-line interfaces that work well for people and coding agents. It is built on [Commander](https://github.com/tj/commander.js), with a consistent machine-facing layer built from Zod schemas:

- one schema-backed model for command input, JSON Schema, and help;
- standardized JSON output for success, negative results, and errors;

The agentic era has only made CLIs more important, and it's important to think about the human as well. Therefore Clinkr also supports:

- ordinary human-readable output from the same handlers; nad
- shell autocomplete derived from the command tree

You author commands accept a schematized object as input and output a schematized output. They accept and output json in a uniform manner, while letting you customize the more traditional flag-based and output ergonomics to suit your application.

## Why Clinkr exists

Commander is a good foundation for parsing commands, options, and arguments. We needed more consistency around everything that surrounds parsing—especially when a CLI is called by a coding agent instead of a person at a terminal.

Without a shared layer, each CLI makes its own choices about how to describe inputs, emit JSON, represent errors, and expose schemas. Those differences make commands harder to discover and harder to call reliably. Clinkr centralizes those choices. A command's Zod schemas define its typed inputs and outputs; Clinkr uses them to validate requests, publish JSON Schema, and produce a standard JSON response envelope.

The norms for agent-facing CLIs are still evolving. Keeping these mechanics in one package gives us a single point of leverage: as those norms change, we can improve Clinkr instead of redesigning every command separately.

> **Status:** This is a provisional contract under active review. Examples and behavior claims must be verified before this document is promoted to the package README.

## Requirements

- Node.js 24 or newer
- An ESM TypeScript project
- Zod schemas for command requests and, when needed, successful results

Clinkr is most useful for applications that want structured commands and explicit output contracts. It is not a wrapper around an existing executable; commands run as TypeScript handlers in the host application.

## Define and run one command

A CLI does not need subcommands, a command group, or application context. Start with one top-level command and give it to a `ClinkrApp`, the executable wrapper that runs every Clinkr command tree:

```ts
import { ClinkrApp, ClinkrCommand, ok } from "@nseng-ai/clinkr";
import { z } from "zod";

const cli = new ClinkrCommand({
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
	handler: async (request) =>
		ok({
			message: `Hello, ${request.name}${request.enthusiastic ? "!" : "."}`,
		}),
	renderHuman: (result) => result.message,
});

const app = new ClinkrApp({ root: cli });

process.exitCode = await app.run(process.argv.slice(2));
```

This creates a command that can be called directly:

```console
$ greet Ada --enthusiastic
Hello, Ada!
```

The request schema is the source for parsing and validation. Schema keys use camel case in TypeScript and become kebab-case CLI options. Mark positional fields explicitly with `positionals`; use `options` to add option-specific help and surface metadata.

This is the minimum Clinkr path: define a top-level command, describe its request with Zod, give it to an app, and assign the returned exit code. `ClinkrCommand` describes one operation; `ClinkrApp` owns execution. Add application context or command groups only when the CLI actually needs them.

## Return explicit outcomes

Rendered command handlers return a `ClinkrExit` rather than writing output or terminating the process:

| Outcome         | Constructor       | Exit code | Meaning                                         |
| --------------- | ----------------- | --------- | ----------------------------------------------- |
| Success         | `ok(data)`        | `0`       | The operation completed.                        |
| Negative result | `negative(...)`   | `1`       | The operation completed with a negative result. |
| Failure         | `failure(...)`    | `2`       | The operation failed.                           |
| Usage error     | `usageError(...)` | `2`       | The invocation was invalid.                     |

A **negative result** means the command worked but the answer was no: a lookup found nothing, a check did not pass, or there was nothing to change. A **failure** means the operation itself could not complete, for example because a dependency was unavailable or an unexpected operational condition occurred.

That distinction gives scripts more information than success or error alone. Exit code `1` can drive an expected alternate branch, while exit code `2` tells the script to report, retry, or stop because the command could not produce a normal answer. JSON consumers can make the same decision from the envelope's discriminant instead of parsing human-readable text.

Clinkr follows the familiar [`grep` exit-status convention](https://www.gnu.org/software/grep/manual/html_node/Exit-Status.html): `0` for a positive result, `1` for an expected negative result, and `2` for an error. This is Clinkr's standard outcome convention, not a universal rule followed by every CLI.

For human output, successful results render to stdout while negative results and errors render to stderr. JSON output emits a discriminated machine envelope to stdout for every outcome. `ClinkrApp.run()` resolves to the corresponding exit code and never calls `process.exit()`.

Unexpected exceptions are not converted into expected failure outcomes. They propagate to the caller so the application can apply its own crash policy.

## Human, Markdown, and JSON output

A rendered command may provide separate success renderers:

```ts
const status = new ClinkrCommand({
	name: "status",
	schema: z.object({}),
	handler: async () => ok({ state: "ready" }),
	renderHuman: (result) => `State: ${result.state}`,
	renderMarkdown: (result) => `**State:** ${result.state}`,
});
```

Clinkr selects the output format from its framework options. If a Markdown renderer is absent, Markdown output falls back to the human renderer. If a human renderer is absent, successful data is formatted as indented JSON.

Add `resultSchema` when consumers need the successful data contract to appear in `--json-schema` output. Schema introspection does not invoke the command handler.

## Build a CLI with subcommands

Use one `ClinkrGroup` when a CLI has several top-level commands:

```ts
const cli = new ClinkrGroup({
	name: "contacts",
	description: "Manage contacts.",
});

cli.command({
	name: "list",
	description: "List contacts.",
	schema: z.object({}),
	handler: async () => ok({ contacts: ["Ada", "Grace"] }),
	renderHuman: (result) => result.contacts.join("\n"),
});

cli.command({
	name: "add",
	description: "Add a contact.",
	schema: z.object({ name: z.string() }),
	positionals: {
		name: { index: 0, description: "Contact name." },
	},
	handler: async (request) => ok({ name: request.name }),
	renderHuman: (result) => `Added ${result.name}`,
});

const app = new ClinkrApp({ root: cli });

process.exitCode = await app.run(process.argv.slice(2));
```

This produces one level of subcommands such as `contacts list` and `contacts add Ada`. Invoking the group without a command prints its help.

## Organize commands into subgroups

When a CLI has several related command families, add one level of subgroups:

```ts
const cli = new ClinkrGroup({
	name: "forge",
	description: "Work with a code forge.",
});

const issues = new ClinkrGroup({
	name: "issues",
	description: "Work with issues.",
});

issues.command({
	name: "list",
	description: "List open issues.",
	schema: z.object({}),
	handler: async () => ok({ issues: ["Fix login", "Improve help"] }),
	renderHuman: (result) => result.issues.join("\n"),
});

const pulls = new ClinkrGroup({
	name: "pulls",
	description: "Work with pull requests.",
});

pulls.command({
	name: "list",
	description: "List open pull requests.",
	schema: z.object({}),
	handler: async () => ok({ pulls: ["Add completion"] }),
	renderHuman: (result) => result.pulls.join("\n"),
});

cli.group(issues);
cli.group(pulls);

const app = new ClinkrApp({
	root: cli,
	version: "1.0.0",
});

process.exitCode = await app.run(process.argv.slice(2));
```

This produces commands such as `forge issues list` and `forge pulls list`. Invoking `forge`, `forge issues`, or `forge pulls` without a leaf command prints help for that level.

Keep the hierarchy this shallow unless another level expresses a real user-facing distinction. Groups intended only for agents or internal dispatch can set `isHidden: true`; hidden groups remain invocable but do not appear in their parent's help. Executable-level features such as `-V, --version` and `--runtime` belong to `ClinkrApp`, not to commands or groups.

## Shell completion

Once completion is installed, Clinkr completes everything it already knows about for free: command and subgroup names, aliases, options, and fixed values such as Zod enum choices. These candidates come from the same command tree and schemas used for parsing and help, so applications do not maintain a separate completion definition.

`ClinkrApp` exposes a `completion` command for Bash, Zsh, and Fish. It prints a small shell script that calls back into the app's hidden completion resolver whenever the user presses Tab. To enable completion in the current shell:

```sh
# Bash
source <(forge completion bash)

# Zsh
source <(forge completion zsh)

# Fish
forge completion fish | source
```

To install it persistently, generate the script into the shell's completion directory:

```sh
# Bash
mkdir -p ~/.local/share/bash-completion/completions
forge completion bash > ~/.local/share/bash-completion/completions/forge

# Zsh — ~/.zfunc must be in fpath before compinit runs
mkdir -p ~/.zfunc
forge completion zsh > ~/.zfunc/_forge

# Fish
mkdir -p ~/.config/fish/completions
forge completion fish > ~/.config/fish/completions/forge.fish
```

For Zsh, add `fpath=(~/.zfunc $fpath)` before `autoload -Uz compinit && compinit` in `.zshrc`. Bash requires the `bash-completion` framework to load user completion files. Restart the shell after persistent installation, or source the generated file immediately.

The lower-level `renderClinkrCompletionScript` API from `@nseng-ai/clinkr/completion` is available when an application needs to choose its own visible setup command or hidden resolver path.

### Dynamic completion

Use a command's `completionProvider` for values that are known only at runtime. The provider receives the current invocation context and details about the token being completed; it does not run the command handler.

For example, a checkout command can complete branch names from an injected Git gateway:

```ts
interface GitContext {
	readonly git: GitGateway;
}

const forge = new ClinkrGroup<GitContext>({ name: "forge" });

forge.command({
	name: "checkout",
	description: "Check out a branch.",
	schema: z.object({ branch: z.string() }),
	positionals: {
		branch: { index: 0, description: "Branch name." },
	},
	completionProvider: async (context, request) =>
		(await context.git.listBranches())
			.filter((branch) => branch.startsWith(request.current))
			.map((branch) => ({
				value: branch,
				type: "positional-value" as const,
			})),
	handler: async (context, request) => {
		await context.git.checkout(request.branch);
		return ok({ branch: request.branch });
	},
});
```

Clinkr combines dynamic candidates with its statically derived candidates and removes duplicates. If the provider fails, Clinkr falls back to static completion so a transient dependency failure does not break ordinary Tab completion.

## Context and testability

Most useful commands depend on something outside the command itself: a filesystem, API client, repository, clock, or configuration. Pass those dependencies as **context** instead of constructing them inside handlers or reading them from globals.

With this you an write full end-to-end tests of CLI commands with injected dependencies.

A group declares one context type for its whole command tree. Commands do not repeat that type: handlers infer it from the group where they are registered. The app receives one context value for each run and passes that value to the selected handler, including handlers in subgroups.

```ts
interface ContactsContext {
	readonly contacts: {
		list(): Promise<readonly string[]>;
		add(name: string): Promise<void>;
	};
}

const contacts = new ClinkrGroup<ContactsContext>({ name: "contacts" });

contacts.command({
	name: "list",
	schema: z.object({}),
	handler: async (context) => ok({ contacts: await context.contacts.list() }),
	renderHuman: (result) => result.contacts.join("\n"),
});

contacts.command({
	name: "add",
	schema: z.object({ name: z.string() }),
	positionals: { name: { index: 0 } },
	handler: async (context, request) => {
		await context.contacts.add(request.name);
		return ok({ name: request.name });
	},
});

const app = new ClinkrApp({ root: contacts });

process.exitCode = await app.run(process.argv.slice(2), {
	context: {
		contacts: new RealContactsGateway(),
	},
});
```

The context type also applies to every subgroup beneath `contacts`; groups do not create, merge, or override context. There is no global context object—the value belongs to one `app.run(...)` invocation. Use it for explicit runtime dependencies, not miscellaneous mutable state.

This homogeneous tree context is the current Clinkr contract. A future enhancement may add first-class per-command context derivation, but applications can build that adaptation outside Clinkr when they need narrower domain contexts today.

Context-free command trees keep the simpler `handler(request)` and `app.run(args)` forms shown above.

The run boundary makes behavior easy to test. Supply the same command tree with an in-memory fake context and let Clinkr capture the observable CLI result:

```ts
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

`@nseng-ai/clinkr/testing` provides captured I/O, test invocation helpers, fake confirmation, machine-envelope parsing, ANSI stripping, and import-boundary scanners. Tests can exercise parsing, handlers, rendering, and exit codes together without mutating process-global state or invoking the real external dependency.

## Advanced: Testable plugin systems

A plugin may need dependencies the host does not know about. Do not grow the host context with every plugin's gateways. Give the whole Clinkr tree a small, stable host context, then let each plugin own a factory that derives or constructs its narrower domain context.

```ts
interface ToolHost {
	readonly cwd: string;
	readonly env: NodeJS.ProcessEnv;
}

interface PublishContext {
	readonly cwd: string;
	readonly registry: PackageRegistry;
}

function createPublishContext(host: ToolHost): PublishContext {
	return {
		cwd: host.cwd,
		registry: new RealPackageRegistry({
			token: host.env["REGISTRY_TOKEN"],
		}),
	};
}
```

The plugin adapts the host-facing command to its domain handler. `defineDomainCommand` below is an application helper built on Clinkr, not a special kind of group:

```ts
function createPublishCommand(
	createContext: (host: ToolHost) => PublishContext = createPublishContext,
) {
	return defineDomainCommand({
		name: "publish",
		schema: z.object({ packageName: z.string() }),
		positionals: {
			packageName: { index: 0 },
		},
		createContext,
		handler: runPublish,
		renderHuman: (result) => `Published ${result.packageName}`,
	});
}
```

Internally, that helper registers a `ClinkrCommand<ToolHost>` whose handler creates the plugin context before calling `runPublish`:

```ts
handler: async (host, request) => {
	const context = await createContext(host);
	return await runPublish(context, request);
},
```

Clinkr still sees one homogeneous `ToolHost` context across the command tree. The plugin owns `PublishContext`, `RealPackageRegistry`, and their construction. Another plugin in the same tree can derive a completely different context without the group knowing about either domain type.

Test the mounted plugin by replacing its context factory with one that supplies plugin-owned fakes:

```ts
test("publishes through the plugin command", async () => {
	const registry = new FakePackageRegistry();
	const publish = createPublishCommand(() => ({
		cwd: "/workspace",
		registry,
	}));

	const root = new ClinkrGroup<ToolHost>({ name: "tool" });
	root.command(publish);

	const app = new ClinkrApp({ root });
	const run = await runForTest(app, ["publish", "widget"], {
		context: {
			cwd: "/workspace",
			env: {},
		},
	});

	expect(run).toEqual({
		exitCode: 0,
		stdout: "Published widget\n",
		stderr: "",
	});
	expect(registry.publishedPackages).toEqual(["widget"]);
});
```

This scenario exercises plugin registration, dispatch, argument parsing, host-to-domain adaptation, domain behavior, rendering, and exit status without calling a real registry. The domain handler can also be tested directly with a `PublishContext`; the mounted scenario proves the integration boundary.

First-class per-command context factories may become a future Clinkr feature. Until then, a small adapter such as `defineDomainCommand` keeps plugin contexts independently owned without changing Clinkr's homogeneous group-context model.

## Interactive confirmation

Use `createClinkrInteraction` and the confirmation helpers when a command may prompt. The interaction object keeps confirmation policy injectable for tests and non-interactive hosts. Commands that require a prompt should fail with a usage error when interaction is unavailable rather than hanging or silently assuming consent.

## Escape hatches

### Raw commands

`@nseng-ai/clinkr/raw` provides `rawCommand()` for commands that must own their bytes and numeric exit code directly. Raw commands do not use Clinkr's rendered outcome contract. Use them only when exact passthrough behavior is part of the command's job.

### Streaming output

`@nseng-ai/clinkr/stream` provides live-region sinks for progressive terminal output. TTY sinks may animate and manage cursor state; non-TTY sinks avoid cursor control and settle to ordinary output suitable for logs and automation.

## Public entrypoints

| Entrypoint                    | Purpose                                                                                         |
| ----------------------------- | ----------------------------------------------------------------------------------------------- |
| `@nseng-ai/clinkr`            | Apps, commands, command groups, outcomes, rendering, I/O, interaction, and core completion APIs |
| `@nseng-ai/clinkr/completion` | Completion planning and shell-script rendering                                                  |
| `@nseng-ai/clinkr/raw`        | Raw command construction                                                                        |
| `@nseng-ai/clinkr/stream`     | Progressive terminal and settled-output sinks                                                   |
| `@nseng-ai/clinkr/testing`    | Public command-testing utilities                                                                |
