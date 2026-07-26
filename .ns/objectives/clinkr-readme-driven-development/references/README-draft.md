# @nseng-ai/clinkr

**Clinkr: CLIs for clankers.**

Clinkr is a TypeScript toolkit for building CLIs that work for people and coding agents. It builds on [Commander](https://github.com/tj/commander.js) and adds a machine-facing layer driven by Zod schemas:

- one schema-backed model for command input, JSON Schema, and help;
- standardized JSON output for success, negative results, and errors.

The agentic era makes CLIs more important, not less—and humans still matter. So Clinkr also provides:

- human-readable output from the same handlers;
- shell autocomplete derived from the command tree.

Commands take a schema-validated request object and return a schema-validated result. JSON in and out is uniform; flag spelling and human output stay customizable per application.

## Why Clinkr exists

Commander parses commands, options, and arguments well. We needed consistency in everything around parsing—especially when a coding agent, not a person at a terminal, calls the CLI.

Without a shared layer, each CLI invents its own way to describe inputs, emit JSON, represent errors, and expose schemas. Those differences make commands hard to discover and hard to call reliably. Clinkr centralizes the choices: a command's Zod schemas define its typed inputs and outputs, and Clinkr uses them to validate requests, publish JSON Schema, and produce a standard JSON response envelope.

Norms for agent-facing CLIs are still evolving. Keeping the mechanics in one package gives one point of leverage: as norms change, we improve Clinkr instead of redesigning every command.

> **Status:** This is a provisional contract under active review. Examples and behavior claims must be verified before this document is promoted to the package README.

## Requirements

- Node.js 24 or newer
- An ESM TypeScript project
- Zod schemas for command requests and, when needed, successful results

Clinkr suits applications that want structured commands and explicit output contracts. It does not wrap an existing executable; commands run as TypeScript handlers in the host application.

## Define and run one command

A CLI needs no subcommands, command group, or application context. Start with one top-level command and give it to a `ClinkrApp`, the executable wrapper that runs every Clinkr command tree:

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

The request schema drives parsing and validation. Schema keys are camelCase in TypeScript and become kebab-case CLI options. Mark positional fields with `positionals`; use `options` for option-specific help and surface metadata.

That is the minimum Clinkr path: define a command, describe its request with Zod, give it to an app, assign the returned exit code. `ClinkrCommand` describes one operation; `ClinkrApp` owns execution. Add context or groups only when the CLI needs them.

## Return explicit outcomes

Rendered command handlers return a `ClinkrExit` rather than writing output or terminating the process:

| Outcome         | Constructor       | Exit code | Human stream | Meaning                                         |
| --------------- | ----------------- | --------- | ------------ | ----------------------------------------------- |
| Success         | `ok(data)`        | `0`       | stdout       | The operation completed.                        |
| Negative result | `negative(...)`   | `1`       | stdout       | The operation completed with a negative result. |
| Failure         | `failure(...)`    | `2`       | stderr       | The operation failed.                           |
| Usage error     | `usageError(...)` | `2`       | stderr       | The invocation was invalid.                     |

A **negative result** means the command worked but the answer was no: a lookup found nothing, a check did not pass, there was nothing to change. A **failure** means the operation could not complete—a dependency was unavailable, or an unexpected operational condition occurred.

The distinction gives scripts more than success-or-error. Exit code `1` drives an expected alternate branch; exit code `2` says report, retry, or stop. JSON consumers make the same decision from the envelope's discriminant instead of parsing prose.

Clinkr follows the [`grep` exit-status convention](https://www.gnu.org/software/grep/manual/html_node/Exit-Status.html): `0` positive, `1` expected negative, `2` error. This is Clinkr's convention, not a universal CLI rule.

In human output, success and negative results both render to stdout: a negative result is an answer, not trouble—the same way `diff` prints differences to stdout with exit `1` and `grep -c` prints `0` with exit `1`. Failures and usage errors render to stderr. JSON output emits a discriminated machine envelope to stdout for every outcome. `ClinkrApp.run()` resolves to the exit code and never calls `process.exit()`.

Unexpected exceptions do not become expected failure outcomes. They propagate so the application can apply its own crash policy.

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

Clinkr selects the output format from its framework options. Without a Markdown renderer, Markdown output falls back to the human renderer. Without a human renderer, successful data prints as indented JSON.

Add `resultSchema` when consumers need the success contract in `--json-schema` output. Schema introspection never invokes the handler.

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

A handler can also override rendering per exit instead of declaring a command-level renderer:

```ts
return ok(report, {
	human: formatReport(report),
	markdown: formatReportMarkdown(report),
});
```

`negative(message, { human })` does the same for negative results.

### Mid-command progress

By convention in basic CLI applications—`git`, `curl`—progress and logging go to **stderr**; **stdout** carries the machine-parseable output. Clinkr's contract leans on that convention: the JSON envelope owns stdout, so anything written to stderr mid-command is automatically safe for machine consumers—no format check needed.

To do something different or more sophisticated—silence progress in tests, route it to a host status widget—use the context as the seam. Handlers receive only `(context, request)`, no output streams and no format flag, so a progress reporter injected through the context lets the application decide routing while the command just reports.

Two refinements when a command needs them:

- **Animation is TTY-gated.** Spinners and in-place redraws only when the output is a terminal; plain lines otherwise. The `@nseng-ai/clinkr/stream` sinks implement exactly this split.
- **Durable output to stdout mid-command is the one case that needs a format check.** A command that streams part of its answer before returning must know the selected format. Derive it from argv before `app.run()` and place it in the context; skip the stream entirely in JSON mode.

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

This gives one level of subcommands: `contacts list`, `contacts add Ada`. Invoking the group without a command prints its help.

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

Keep the hierarchy this shallow unless another level expresses a real user-facing distinction. Agent-only or internal groups can set `isHidden: true`: still invocable, hidden from the parent's help. Executable-level features such as `-V, --version` and `--runtime` belong to `ClinkrApp`, not to commands or groups.

## Shell completion

Once installed, completion covers everything Clinkr already knows: command and subgroup names, aliases, options, and fixed values such as Zod enum choices. Candidates come from the same command tree and schemas as parsing and help—no separate completion definition to maintain.

`ClinkrApp` exposes a `completion` command for Bash, Zsh, and Fish. It prints a small shell script that calls back into the app's hidden completion resolver on Tab. To enable completion in the current shell:

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

The lower-level `renderClinkrCompletionScript` API in `@nseng-ai/clinkr/completion` lets an application choose its own visible setup command or hidden resolver path.

### Dynamic completion

Use a command's `completionProvider` for values known only at runtime. The provider receives the invocation context and the token being completed; it never runs the command handler.

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

Clinkr merges dynamic candidates with static ones and removes duplicates. If the provider fails, Clinkr falls back to static completion—a transient dependency failure does not break Tab completion.

## Context and testability

Most real commands depend on something external: a filesystem, API client, repository, clock, or configuration. Pass those dependencies as **context** instead of constructing them inside handlers or reading globals. This lets you write full end-to-end tests of CLI commands with injected dependencies.

A group declares one context type for its whole command tree. Commands do not repeat it: handlers infer the type from the group where they are registered. The app receives one context value per run and passes it to the selected handler, including handlers in subgroups.

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

This homogeneous tree context is the current contract. First-class per-command context derivation may come later; applications that need narrower domain contexts can build the adaptation outside Clinkr today.

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

`@nseng-ai/clinkr/testing` provides captured I/O, test invocation helpers, fake confirmation, machine-envelope parsing, ANSI stripping, and import-boundary scanners. Tests exercise parsing, handlers, rendering, and exit codes together without touching process-global state or real external dependencies.

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

Clinkr still sees one homogeneous `ToolHost` context across the command tree. The plugin owns `PublishContext`, `RealPackageRegistry`, and their construction. Another plugin in the same tree can derive a different context without the group knowing about either domain type.

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

First-class per-command context factories may come later. Until then, a small adapter like `defineDomainCommand` keeps plugin contexts independently owned without changing the homogeneous group-context model.

## Interactive confirmation

Use `createClinkrInteraction` and the confirmation helpers when a command may prompt. The interaction object keeps confirmation policy injectable for tests and non-interactive hosts. When interaction is unavailable, a command that requires a prompt should fail with a usage error—never hang or silently assume consent.

## Escape hatches

### Raw commands

`@nseng-ai/clinkr/raw` provides `rawCommand()` for commands that must own their bytes and numeric exit code directly. Raw commands skip Clinkr's rendered outcome contract. Use them only when exact passthrough is the command's job.

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
