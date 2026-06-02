import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

import { describe, expect, test } from "bun:test";

import { cliCommandTracePath, parseCliCommandArgs, registerCliCommandExtension, type CliCommandInfo, type CliCommandRunDeps, type CommandContext, type ExtensionAPI } from "../src/cli-command-extension.ts";

type RegisteredCommand = Parameters<ExtensionAPI["registerCommand"]>[1];
type NotifyLevel = "info" | "warning" | "error";
interface Notification {
	message: string;
	level: NotifyLevel | undefined;
}

interface StatusUpdate {
	key: string;
	value: string | undefined;
}

interface WidgetUpdate {
	key: string;
	lines: string[] | undefined;
	placement: string | undefined;
}

interface RunCall {
	args: string[];
	cwd: string;
	env: Record<string, string | undefined>;
}

class FakePi implements ExtensionAPI {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly sentMessages: unknown[] = [];

	registerCommand(name: string, command: RegisteredCommand): void {
		this.commands.set(name, command);
	}

	sendMessage(message: unknown): void {
		this.sentMessages.push(message);
	}
}

function createContext(order: string[] = []): { ctx: CommandContext; notifications: Notification[]; editorTexts: string[]; statuses: StatusUpdate[]; widgets: WidgetUpdate[] } {
	const notifications: Notification[] = [];
	const editorTexts: string[] = [];
	const statuses: StatusUpdate[] = [];
	const widgets: WidgetUpdate[] = [];
	return {
		notifications,
		editorTexts,
		statuses,
		widgets,
		ctx: {
			cwd: "/repo",
			hasUI: true,
			ui: {
				notify(message, level) {
					notifications.push({ message, level });
				},
				setEditorText(text) {
					editorTexts.push(text);
				},
				setStatus(key, value) {
					statuses.push({ key, value });
				},
				setWidget(key, lines, options) {
					widgets.push({ key, lines: lines === undefined ? undefined : [...lines], placement: options?.placement });
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
		commands?: CliCommandInfo[];
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

function restoreEnv(name: string, value: string | undefined): void {
	if (value === undefined) {
		delete process.env[name];
		return;
	}
	process.env[name] = value;
}

function readTraceEvents(path: string): Array<Record<string, unknown>> {
	const text = readFileSync(path, "utf8").trim();
	if (text === "") return [];
	return text.split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
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
		const { ctx, notifications } = createContext(order);

		await commandFor(pi, "dev:preview-url").handler("--branch feature/x --json", ctx);

		expect(order).toEqual(["wait", "run"]);
		expect(calls).toEqual([
			{
				args: ["preview-url", "--branch", "feature/x", "--json"],
				cwd: "/repo",
				env: { VERCEL_PROJECT: "env-project" },
			},
		]);
		expect(notifications).toEqual([{ message: "stdout:\nhttps://preview.example\n\nstderr:\nwarning from cli\n", level: "info" }]);
		expect(pi.sentMessages).toEqual([]);
	});

	test("writes metadata trace events without sending transcript messages", async () => {
		const directory = mkdtempSync(join(tmpdir(), "pi-cli-trace-test-"));
		const tracePath = join(directory, "trace.jsonl");
		const oldTrace = process.env.ASDL_PI_CLI_TRACE;
		const oldTracePath = process.env.ASDL_PI_CLI_TRACE_PATH;
		process.env.ASDL_PI_CLI_TRACE = "1";
		process.env.ASDL_PI_CLI_TRACE_PATH = tracePath;
		try {
			const pi = new FakePi();
			registerFakeCli(pi, {
				runCli: (_args, deps) => {
					deps.stdout("ok\n");
					return 0;
				},
			});
			const { ctx } = createContext();

			await commandFor(pi, "dev:preview-url").handler("--json", ctx);

			const events = readTraceEvents(cliCommandTracePath(process.env));
			expect(events.map((event) => event.event)).toEqual([
				"register",
				"command_start",
				"live_progress_start",
				"wait_for_idle_start",
				"wait_for_idle_done",
				"runner_start",
				"live_progress_output",
				"runner_done",
				"live_progress_stop",
				"emit_output",
			]);
			expect(events.find((event) => event.event === "register")).toMatchObject({
				bridgeMode: "notify-with-live-progress-no-custom-message",
				piNamespace: "dev",
				sendMessageAvailable: true,
				version: "live-progress-trace-v2",
			});
			expect(events.find((event) => event.event === "live_progress_start")).toMatchObject({
				sendMessageCalled: false,
				target: "status_widget",
			});
			expect(events.find((event) => event.event === "runner_done")).toMatchObject({
				exitCode: 0,
				stderrChars: 0,
				stdoutChars: 3,
			});
			expect(events.find((event) => event.event === "emit_output")).toMatchObject({
				sendMessageCalled: false,
				target: "notify",
			});
			expect(pi.sentMessages).toEqual([]);
		} finally {
			restoreEnv("ASDL_PI_CLI_TRACE", oldTrace);
			restoreEnv("ASDL_PI_CLI_TRACE_PATH", oldTracePath);
			rmSync(directory, { recursive: true, force: true });
		}
	});

	test("presents nonzero exit codes as error output", async () => {
		const pi = new FakePi();
		registerFakeCli(pi, {
			runCli: (_args, deps) => {
				deps.stderr("not found\n");
				return 17;
			},
		});
		const { ctx, notifications } = createContext();

		await commandFor(pi, "dev:preview-url").handler("--json", ctx);

		expect(notifications).toEqual([{ message: "fake-dev preview-url exited with code 17.\n\nstderr:\nnot found\n", level: "error" }]);
		expect(pi.sentMessages).toEqual([]);
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
		expect(pi.sentMessages).toEqual([]);
	});

	test("restores prose-looking command tails without waiting or invoking the CLI", async () => {
		const pi = new FakePi();
		const order: string[] = [];
		let runnerCalled = false;
		registerFakeCli(pi, {
			runCli: () => {
				runnerCalled = true;
				return 0;
			},
		});
		const { ctx, editorTexts, notifications } = createContext(order);

		await commandFor(pi, "dev:preview-url").handler("broke in this pr", ctx);

		expect(runnerCalled).toBe(false);
		expect(order).toEqual([]);
		expect(editorTexts).toEqual(["/dev:preview-url broke in this pr"]);
		expect(notifications).toEqual([
			{
				message:
					"Not running /dev:preview-url: text after the command looks like prose, not options. The text was restored to the editor.",
				level: "warning",
			},
		]);
		expect(pi.sentMessages).toEqual([]);
	});

	test("restores command text after CLI usage errors", async () => {
		const pi = new FakePi();
		registerFakeCli(pi, {
			runCli: (_args, deps) => {
				deps.stderr("Error: Unexpected argument: words\n");
				return 2;
			},
		});
		const { ctx, editorTexts } = createContext();

		await commandFor(pi, "dev:preview-url").handler("--json words", ctx);

		expect(pi.sentMessages).toEqual([]);
		expect(editorTexts).toEqual(["/dev:preview-url --json words"]);
	});

	test("allows positional arguments for commands that opt in", async () => {
		const pi = new FakePi();
		const calls: RunCall[] = [];
		registerFakeCli(pi, {
			env: { SAMPLE: "1" },
			commands: [{ name: "echo", description: "Echo text.", canAcceptPositionalArgs: true }],
			runCli: (args, deps) => {
				calls.push({ args: [...args], cwd: deps.cwd, env: deps.env });
				deps.stdout("ok\n");
				return 0;
			},
		});
		const { ctx, editorTexts } = createContext();

		await commandFor(pi, "dev:echo").handler("hello world", ctx);

		expect(calls).toEqual([{ args: ["echo", "hello", "world"], cwd: "/repo", env: { SAMPLE: "1" } }]);
		expect(editorTexts).toEqual([]);
		expect(pi.sentMessages).toEqual([]);
	});

	test("notifies the UI with command output", async () => {
		const pi = new FakePi();
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

	test("updates live status and widget while the CLI command is running", async () => {
		let markRunStarted: (() => void) | undefined;
		const runStarted = new Promise<void>((resolve) => {
			markRunStarted = resolve;
		});
		let finishRun: (() => void) | undefined;
		const runFinished = new Promise<void>((resolve) => {
			finishRun = resolve;
		});
		const pi = new FakePi();
		registerFakeCli(pi, {
			runCli: async (_args, deps) => {
				deps.stdout("started\n");
				markRunStarted?.();
				await runFinished;
				deps.stderr("finished\n");
				return 0;
			},
		});
		const { ctx, notifications, statuses, widgets } = createContext();

		const commandPromise = commandFor(pi, "dev:preview-url").handler("", ctx);
		await runStarted;

		const liveWidgetText = widgets.at(-1)?.lines?.join("\n") ?? "";
		expect(statuses.at(-1)?.key).toBe("asdl-cli-command");
		expect(statuses.at(-1)?.value).toContain("/dev:preview-url running CLI command");
		expect(liveWidgetText).toContain("Running /dev:preview-url");
		expect(liveWidgetText).toContain("stdout: started");
		expect(pi.sentMessages).toEqual([]);

		if (finishRun === undefined) throw new Error("Expected run resolver to be initialized.");
		finishRun();
		await commandPromise;

		expect(statuses.at(-1)).toEqual({ key: "asdl-cli-command", value: undefined });
		expect(widgets.at(-1)).toEqual({ key: "asdl-cli-command-output", lines: undefined, placement: undefined });
		expect(notifications).toEqual([{ message: "stdout:\nstarted\n\nstderr:\nfinished\n", level: "info" }]);
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
