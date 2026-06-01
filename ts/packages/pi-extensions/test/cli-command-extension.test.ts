import { describe, expect, test } from "bun:test";

import {
	CLI_COMMAND_OUTPUT_MESSAGE_TYPE,
	parseCliCommandArgs,
	registerCliCommandExtension,
	type CliCommandRunDeps,
	type CommandContext,
	type ExtensionAPI,
} from "../src/cli-command-extension.ts";

type RegisteredCommand = Parameters<ExtensionAPI["registerCommand"]>[1];
type CustomMessage = Parameters<NonNullable<ExtensionAPI["sendMessage"]>>[0];
type NotifyLevel = "info" | "warning" | "error";

type Notification = {
	message: string;
	level: NotifyLevel | undefined;
};

type RunCall = {
	args: string[];
	cwd: string;
	env: Record<string, string | undefined>;
};

class FakePi implements ExtensionAPI {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly sentMessages: CustomMessage[] = [];
	readonly sendMessage?: (message: CustomMessage) => void;

	constructor(options: { sendMessage?: boolean } = {}) {
		if (options.sendMessage ?? true) {
			this.sendMessage = (message: CustomMessage): void => {
				this.sentMessages.push(message);
			};
		}
	}

	registerCommand(name: string, command: RegisteredCommand): void {
		this.commands.set(name, command);
	}
}

function createContext(order: string[] = []): { ctx: CommandContext; notifications: Notification[] } {
	const notifications: Notification[] = [];
	return {
		notifications,
		ctx: {
			cwd: "/repo",
			hasUI: true,
			ui: {
				notify(message, level) {
					notifications.push({ message, level });
				},
			},
			async waitForIdle(): Promise<void> {
				order.push("wait");
			},
		},
	};
}

function commandFor(pi: FakePi, name: string): RegisteredCommand {
	const command = pi.commands.get(name);
	if (command === undefined) {
		throw new Error(`Expected command to be registered: ${name}`);
	}
	return command;
}

function registerFakeCli(
	pi: FakePi,
	options: {
		runCli?: (args: readonly string[], deps: CliCommandRunDeps) => Promise<number> | number;
		env?: Record<string, string | undefined>;
		commands?: Array<{ name: string; description: string }>;
	} = {},
): void {
	registerCliCommandExtension(pi, {
		cliName: "fake-dev",
		piNamespace: "dev",
		commands: options.commands ?? [{ name: "preview-url", description: "Print a preview URL." }],
		runCli: options.runCli ?? (() => 0),
		...(options.env === undefined ? {} : { env: options.env }),
	});
}

describe("cli command extension helper", () => {
	test("registers each command under the configured Pi namespace only", () => {
		const pi = new FakePi();

		registerFakeCli(pi, {
			commands: [
				{ name: "one", description: "First command." },
				{ name: "two", description: "Second command." },
			],
		});

		expect([...pi.commands.keys()]).toEqual(["dev:one", "dev:two"]);
		expect(pi.commands.has("fake-dev:one")).toBe(false);
		expect(pi.commands.get("dev:one")?.description).toBe("fake-dev one: First command.");
	});

	test("invokes the CLI runner after idle with parsed args, cwd, env, and captured output", async () => {
		const pi = new FakePi();
		const order: string[] = [];
		const calls: RunCall[] = [];
		registerFakeCli(pi, {
			env: { VERCEL_PROJECT: "env-project" },
			runCli: async (args, deps) => {
				order.push("run");
				calls.push({ args: [...args], cwd: deps.cwd, env: deps.env });
				deps.stdout("https://preview.example\n");
				deps.stderr("warning from cli\n");
				return 0;
			},
		});
		const { ctx } = createContext(order);

		await commandFor(pi, "dev:preview-url").handler("--branch feature/x --json", ctx);

		expect(order).toEqual(["wait", "run"]);
		expect(calls).toEqual([
			{
				args: ["preview-url", "--branch", "feature/x", "--json"],
				cwd: "/repo",
				env: { VERCEL_PROJECT: "env-project" },
			},
		]);
		expect(pi.sentMessages).toHaveLength(1);
		expect(pi.sentMessages[0]).toEqual({
			customType: CLI_COMMAND_OUTPUT_MESSAGE_TYPE,
			content: "stdout:\nhttps://preview.example\n\nstderr:\nwarning from cli\n",
			display: true,
			details: {
				cliName: "fake-dev",
				commandName: "preview-url",
				piCommandName: "dev:preview-url",
				rawArgs: "--branch feature/x --json",
				args: ["--branch", "feature/x", "--json"],
				argv: ["preview-url", "--branch", "feature/x", "--json"],
				cwd: "/repo",
				exitCode: 0,
				stdout: "https://preview.example\n",
				stderr: "warning from cli\n",
				level: "info",
			},
		});
	});

	test("presents nonzero exit codes as error output", async () => {
		const pi = new FakePi();
		registerFakeCli(pi, {
			runCli: (_args, deps) => {
				deps.stderr("not found\n");
				return 17;
			},
		});
		const { ctx } = createContext();

		await commandFor(pi, "dev:preview-url").handler("--json", ctx);

		expect(pi.sentMessages[0]?.content).toBe("fake-dev preview-url exited with code 17.\n\nstderr:\nnot found\n");
		expect(pi.sentMessages[0]?.details).toMatchObject({ exitCode: 17, level: "error", stderr: "not found\n" });
	});

	test("reports argument tokenization errors without invoking the runner", async () => {
		const pi = new FakePi();
		let runnerCalled = false;
		registerFakeCli(pi, {
			runCli: () => {
				runnerCalled = true;
				return 0;
			},
		});
		const { ctx } = createContext();

		await commandFor(pi, "dev:preview-url").handler('--branch "unterminated', ctx);

		expect(runnerCalled).toBe(false);
		expect(pi.sentMessages[0]?.details).toMatchObject({
			exitCode: 2,
			stderr: "Error: Unterminated double quote.\n",
			level: "error",
		});
	});

	test("falls back to notifications when custom messages are unavailable", async () => {
		const pi = new FakePi({ sendMessage: false });
		registerFakeCli(pi, {
			runCli: (_args, deps) => {
				deps.stdout("ok\n");
				return 0;
			},
		});
		const { ctx, notifications } = createContext();

		await commandFor(pi, "dev:preview-url").handler("", ctx);

		expect(pi.sentMessages).toEqual([]);
		expect(notifications).toEqual([{ message: "ok\n", level: "info" }]);
	});

	test("parses shell-like whitespace quotes and escapes", () => {
		expect(parseCliCommandArgs("--branch feature/x --json")).toEqual({
			ok: true,
			args: ["--branch", "feature/x", "--json"],
		});
		expect(parseCliCommandArgs("--branch 'feature with spaces' --project asdl\\ tools --label \"say \\\"hi\\\"\"")).toEqual({
			ok: true,
			args: ["--branch", "feature with spaces", "--project", "asdl tools", "--label", 'say "hi"'],
		});
		expect(parseCliCommandArgs('--branch "unterminated')).toEqual({ ok: false, error: "Unterminated double quote." });
		expect(parseCliCommandArgs("--branch dangling\\")).toEqual({ ok: false, error: "Trailing backslash escape." });
	});

	test("rejects duplicate command names before registering suffix-prone collisions", () => {
		const pi = new FakePi();

		expect(() => {
			registerFakeCli(pi, {
				commands: [
					{ name: "preview-url", description: "First." },
					{ name: "preview-url", description: "Second." },
				],
			});
		}).toThrow("Duplicate fake-dev command name: preview-url");
		expect(pi.commands.size).toBe(0);
	});
});
