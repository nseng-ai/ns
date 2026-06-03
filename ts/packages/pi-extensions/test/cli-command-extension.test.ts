import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

import { describe, expect, test } from "bun:test";

import {
	CLI_COMMAND_OUTPUT_MESSAGE_TYPE,
	cliCommandTracePath,
	parseCliCommandArgs,
	registerCliCommandExtension,
	renderCliCommandOutputMessage,
	type CliCommandInfo,
	type CliCommandRunDeps,
	type CommandContext,
	type ExtensionAPI,
} from "../src/cli-command-extension.ts";

type RegisteredCommand = Parameters<ExtensionAPI["registerCommand"]>[1];
type MessageRenderer = Parameters<NonNullable<ExtensionAPI["registerMessageRenderer"]>>[1];
type CustomMessage = Parameters<NonNullable<ExtensionAPI["sendMessage"]>>[0];
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
	readonly sentMessages: CustomMessage[] = [];
	readonly messageRenderers = new Map<string, MessageRenderer>();
	readonly registerMessageRenderer?: (customType: string, renderer: MessageRenderer) => void;
	readonly sendMessage?: (message: CustomMessage) => void;

	constructor(options: { registerMessageRenderer?: boolean; sendMessage?: boolean } = {}) {
		if (options.registerMessageRenderer ?? true) {
			this.registerMessageRenderer = (customType: string, renderer: MessageRenderer): void => {
				this.messageRenderers.set(customType, renderer);
			};
		}
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

function commandFor(pi: { commands: ReadonlyMap<string, RegisteredCommand> }, name: string): RegisteredCommand {
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

function expectSingleCliOutputMessage(pi: FakePi, content: string, level: "info" | "error" = "info"): CustomMessage {
	expect(pi.sentMessages).toHaveLength(1);
	const message = pi.sentMessages[0];
	if (message === undefined) {
		throw new Error("Expected one CLI output message.");
	}
	expect(message).toMatchObject({
		customType: CLI_COMMAND_OUTPUT_MESSAGE_TYPE,
		content,
		display: true,
		details: { level },
	});
	return message;
}

function taggedTheme(): { fg(color: string, text: string): string; bold(text: string): string } {
	return {
		fg(color, text) {
			return `<${color}>${text}</${color}>`;
		},
		bold(text) {
			return `<bold>${text}</bold>`;
		},
	};
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
		expect(pi.messageRenderers.has(CLI_COMMAND_OUTPUT_MESSAGE_TYPE)).toBe(true);
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
		expect(notifications).toEqual([]);
		expectSingleCliOutputMessage(pi, "stdout:\nhttps://preview.example\n\nstderr:\nwarning from cli\n");
	});

	test("writes metadata trace events and sends final output as a custom message", async () => {
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
				bridgeMode: "custom-rendered-message-with-above-editor-live-stream",
				messageRendererAvailable: true,
				piNamespace: "dev",
				sendMessageAvailable: true,
				version: "above-editor-live-stream-trace-v3",
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
				sendMessageCalled: true,
				target: "custom_message",
			});
			expectSingleCliOutputMessage(pi, "ok\n");
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

		expect(notifications).toEqual([]);
		expectSingleCliOutputMessage(pi, "fake-dev preview-url exited with code 17.\n\nstderr:\nnot found\n", "error");
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
		expectSingleCliOutputMessage(pi, "fake-dev preview-url exited with code 2.\n\nstderr:\nError: Unterminated double quote.\n", "error");
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

		expectSingleCliOutputMessage(pi, "fake-dev preview-url exited with code 2.\n\nstderr:\nError: Unexpected argument: words\n", "error");
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
		expectSingleCliOutputMessage(pi, "ok\n");
	});

	test("sends UI command output as a custom message", async () => {
		const pi = new FakePi();
		registerFakeCli(pi, {
			runCli: (_args, deps) => {
				deps.stdout("ok\n");
				return 0;
			},
		});
		const { ctx, notifications } = createContext();

		await commandFor(pi, "dev:preview-url").handler("", ctx);

		expect(notifications).toEqual([]);
		expectSingleCliOutputMessage(pi, "ok\n");
	});

	test("falls back to UI notifications when custom rendering is unavailable", async () => {
		const cases = [new FakePi({ registerMessageRenderer: false }), new FakePi({ sendMessage: false })];
		for (const pi of cases) {
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
		}
	});

	test("renders successful checkpoint output as normal text rather than dim status styling", () => {
		const component = renderCliCommandOutputMessage(
			{
				customType: CLI_COMMAND_OUTPUT_MESSAGE_TYPE,
				content:
					"15bd4fc4 [cp] Update submit command description\n[cp] Update submit command description\n\n- Adjust code extension test for new submit wording\n- Describe checkpointing outstanding changes before submit\n",
				display: true,
				details: { level: "info" },
			},
			{ expanded: false },
			taggedTheme(),
		);

		const rendered = component.render(120).join("\n");
		expect(rendered).toContain("<text>15bd4fc4 [cp] Update submit command description</text>");
		expect(rendered).toContain("<text>- Adjust code extension test for new submit wording</text>");
		expect(rendered).toContain("<text>- Describe checkpointing outstanding changes before submit</text>");
		expect(rendered).not.toContain("<dim>");
		expect(rendered).not.toContain("<muted>");
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
		expect(widgets.at(-1)?.placement).toBe("aboveEditor");
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
		expect(notifications).toEqual([]);
		expectSingleCliOutputMessage(pi, "stdout:\nstarted\n\nstderr:\nfinished\n");
	});

	test("streams live CLI output separately from final captured output", async () => {
		let markLiveOutputObserved: (() => void) | undefined;
		const liveOutputObserved = new Promise<void>((resolve) => {
			markLiveOutputObserved = resolve;
		});
		let finishRun: (() => void) | undefined;
		const runFinished = new Promise<void>((resolve) => {
			finishRun = resolve;
		});
		const pi = new FakePi();
		registerFakeCli(pi, {
			runCli: async (_args, deps) => {
				deps.onOutput?.("stdout", "live stdout\n");
				deps.onOutput?.("stderr", "live stderr");
				markLiveOutputObserved?.();
				await runFinished;
				deps.stdout("final stdout\n");
				return 0;
			},
		});
		const { ctx, notifications, widgets } = createContext();

		const commandPromise = commandFor(pi, "dev:preview-url").handler("", ctx);
		await liveOutputObserved;

		const liveWidgetText = widgets.at(-1)?.lines?.join("\n") ?? "";
		expect(liveWidgetText).toContain("stdout: live stdout");
		expect(liveWidgetText).toContain("stderr: live stderr");
		expect(liveWidgetText).not.toContain("final stdout");

		if (finishRun === undefined) throw new Error("Expected run resolver to be initialized.");
		finishRun();
		await commandPromise;

		expect(notifications).toEqual([]);
		expectSingleCliOutputMessage(pi, "final stdout\n");
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
