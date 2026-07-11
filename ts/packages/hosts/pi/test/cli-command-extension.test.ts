import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

import { describe, expect, test, vi } from "vitest";

import { createManualTimerScheduler } from "@nseng-ai/foundation/time/testing";
import type { TimerScheduler } from "@nseng-ai/foundation/timers";

import {
	CLI_COMMAND_OUTPUT_MESSAGE_TYPE,
	cliCommandTracePath,
	parseCliCommandArgs,
	registerCliCommandExtension,
	renderCliCommandOutputMessage,
	type CliCommandInfo,
	type CliCommandOutputDetails,
	type CliCommandRunDeps,
	type CommandContext,
	type CliCommandExtensionAPI,
} from "../src/commands/cli-extension.ts";
import {
	PI_EXTENSION_COMMAND_FINISHED_EVENT,
	type PiExtensionCommandFinishedEvent,
} from "../src/commands/events.ts";

type RegisteredCommand = Parameters<CliCommandExtensionAPI["registerCommand"]>[1];
type MessageRenderer = Parameters<
	NonNullable<CliCommandExtensionAPI["registerMessageRenderer"]>
>[1];
type CustomMessage = Parameters<NonNullable<CliCommandExtensionAPI["sendMessage"]>>[0];
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

interface ConfirmationPrompt {
	title: string;
	message: string;
}

interface CreateContextOptions {
	confirm?: (title: string, message: string) => Promise<boolean> | boolean;
	hasUI?: boolean;
	setEditorText?: boolean;
	setStatus?: boolean;
	setWidget?: boolean;
}

interface RunCall {
	args: string[];
	cwd: string;
	env: Record<string, string | undefined>;
}

class FakePi implements CliCommandExtensionAPI {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly sentMessages: CustomMessage[] = [];
	readonly ackMessages: CustomMessage[] = [];
	readonly progressMessages: CustomMessage[] = [];
	readonly commandFinishedEvents: PiExtensionCommandFinishedEvent[] = [];
	readonly messageRenderers = new Map<string, MessageRenderer>();
	readonly events = {
		emit: (
			event: typeof PI_EXTENSION_COMMAND_FINISHED_EVENT,
			payload: PiExtensionCommandFinishedEvent,
		): void => {
			if (event === PI_EXTENSION_COMMAND_FINISHED_EVENT) this.commandFinishedEvents.push(payload);
		},
	};
	readonly registerMessageRenderer?: (customType: string, renderer: MessageRenderer) => void;
	readonly sendMessage?: (message: CustomMessage) => void;

	constructor(
		options: {
			registerMessageRenderer?: boolean;
			sendMessage?: boolean;
			shouldMakeSendMessageStale?: boolean;
		} = {},
	) {
		if (options.registerMessageRenderer ?? true) {
			this.registerMessageRenderer = (customType: string, renderer: MessageRenderer): void => {
				if (customType === "ns-command-ack") return;
				this.messageRenderers.set(customType, renderer);
			};
		}
		if (options.sendMessage ?? true) {
			this.sendMessage = (message: CustomMessage): void => {
				if (options.shouldMakeSendMessageStale === true) {
					throw new Error(
						"This extension ctx is stale after session replacement or reload. Do not use a captured pi or command ctx after ctx.newSession().",
					);
				}
				if (message.customType === "ns-command-ack") {
					this.ackMessages.push(message);
					return;
				}
				if (message.customType === "ns-command-progress") {
					this.progressMessages.push(message);
					return;
				}
				this.sentMessages.push(message);
			};
		}
	}

	registerCommand(name: string, command: RegisteredCommand): void {
		this.commands.set(name, command);
	}
}

function createContext(
	order: string[] = [],
	options: CreateContextOptions = {},
): {
	ctx: CommandContext;
	notifications: Notification[];
	editorTexts: string[];
	statuses: StatusUpdate[];
	widgets: WidgetUpdate[];
	confirmations: ConfirmationPrompt[];
} {
	const notifications: Notification[] = [];
	const editorTexts: string[] = [];
	const statuses: StatusUpdate[] = [];
	const widgets: WidgetUpdate[] = [];
	const confirmations: ConfirmationPrompt[] = [];
	const ui: CommandContext["ui"] = {
		notify(message, level) {
			notifications.push({ message, level });
		},
	};
	if (options.setEditorText ?? true) {
		ui.setEditorText = (text): void => {
			editorTexts.push(text);
		};
	}
	if (options.setStatus ?? true) {
		ui.setStatus = (key, value): void => {
			statuses.push({ key, value });
		};
	}
	if (options.setWidget ?? true) {
		ui.setWidget = (key, content, widgetOptions): void => {
			const lines =
				content === undefined
					? undefined
					: typeof content === "function"
						? content().render(100)
						: [...content];
			widgets.push({
				key,
				lines,
				placement: widgetOptions?.placement,
			});
		};
	}
	if (options.confirm !== undefined) {
		const confirm = options.confirm;
		ui.confirm = async (title: string, message: string): Promise<boolean> => {
			confirmations.push({ title, message });
			return confirm(title, message);
		};
	}
	return {
		notifications,
		editorTexts,
		statuses,
		widgets,
		confirmations,
		ctx: {
			cwd: "/repo",
			hasUI: options.hasUI ?? true,
			ui,
			async waitForIdle(): Promise<void> {
				order.push("wait");
			},
		},
	};
}

function commandFor(
	pi: { commands: ReadonlyMap<string, RegisteredCommand> },
	name: string,
): RegisteredCommand {
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
		afterCommandComplete?: (details: CliCommandOutputDetails) => Promise<void> | void;
		env?: Record<string, string | undefined>;
		commands?: CliCommandInfo[];
		timers?: TimerScheduler;
	} = {},
): void {
	registerCliCommandExtension(pi, {
		cliName: "fake-cli",
		piNamespace: "dev",
		commands: options.commands ?? [
			{ name: "preview-status", description: "Print a preview status." },
		],
		runCli: options.runCli ?? (() => 0),
		...(options.afterCommandComplete === undefined
			? {}
			: { afterCommandComplete: options.afterCommandComplete }),
		...(options.env === undefined ? {} : { env: options.env }),
		...(options.timers === undefined ? {} : { timers: options.timers }),
	});
}

function readTraceEvents(path: string): Array<Record<string, unknown>> {
	const text = readFileSync(path, "utf8").trim();
	if (text === "") return [];
	return text.split("\n").map(parseTraceEvent);
}

function parseTraceEvent(line: string): Record<string, unknown> {
	const value: unknown = JSON.parse(line);
	if (!isRecord(value)) {
		throw new Error("Expected trace event JSON object.");
	}
	return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function expectSingleCliOutputMessage(
	pi: FakePi,
	content: string,
	level: "info" | "error" = "info",
): CustomMessage {
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

interface CapturedProcessWrites {
	stdout: string;
	stderr: string;
}

async function captureProcessWrites(callback: () => Promise<void>): Promise<CapturedProcessWrites> {
	const stdoutChunks: string[] = [];
	const stderrChunks: string[] = [];
	const originalStdoutWrite = process.stdout.write;
	const originalStderrWrite = process.stderr.write;
	process.stdout.write = createCapturingWrite(stdoutChunks);
	process.stderr.write = createCapturingWrite(stderrChunks);
	try {
		await callback();
	} finally {
		process.stdout.write = originalStdoutWrite;
		process.stderr.write = originalStderrWrite;
	}
	return { stdout: stdoutChunks.join(""), stderr: stderrChunks.join("") };
}

function createCapturingWrite(chunks: string[]): typeof process.stdout.write {
	// Node's write method is overloaded; the test capture only needs the string/Uint8Array path.
	return ((
		chunk: string | Uint8Array,
		encodingOrCallback?: BufferEncoding | ((error?: Error | null) => void),
		callback?: (error?: Error | null) => void,
	): boolean => {
		chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString());
		const writeCallback = typeof encodingOrCallback === "function" ? encodingOrCallback : callback;
		writeCallback?.();
		return true;
	}) as typeof process.stdout.write;
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
	test("cli command trace path uses XDG state fallback and normalized explicit overrides", () => {
		expect(cliCommandTracePath({ HOME: "/home/tester", XDG_STATE_HOME: "/state" })).toBe(
			"/state/ns/pi-cli-command-extension/ns-pi-cli-command-extension.jsonl",
		);
		expect(
			cliCommandTracePath({ HOME: "/home/tester", NS_PI_CLI_TRACE_PATH: "~/trace.jsonl" }),
		).toBe("/home/tester/trace.jsonl");
		expect(() =>
			cliCommandTracePath({
				HOME: "/home/tester",
				NS_PI_CLI_TRACE_PATH: "relative/trace.jsonl",
			}),
		).toThrow("NS_PI_CLI_TRACE_PATH must be an absolute path");
	});

	test("registers each command under the configured Pi namespace only", () => {
		const pi = new FakePi();

		registerFakeCli(pi, {
			commands: [
				{ name: "one", description: "First command." },
				{ name: "two", description: "Second command." },
			],
		});

		expect([...pi.commands.keys()]).toEqual(["dev:one", "dev:two"]);
		expect(pi.commands.has("fake-cli:one")).toBe(false);
		expect(pi.commands.get("dev:one")?.description).toBe("fake-cli one: First command.");
		expect(pi.messageRenderers.has(CLI_COMMAND_OUTPUT_MESSAGE_TYPE)).toBe(true);
	});

	test("passes command-specific argument hints and completions through registration", async () => {
		const pi = new FakePi();
		registerFakeCli(pi, {
			commands: [
				{
					name: "preview-status",
					description: "Print a preview status.",
					argumentHint: "[--json]",
					getArgumentCompletions: (prefix) =>
						prefix === "--" ? [{ value: "--json", label: "--json" }] : null,
				},
			],
		});

		const command = commandFor(pi, "dev:preview-status");

		expect(command.argumentHint).toBe("[--json]");
		expect(await command.getArgumentCompletions?.("--")).toEqual([
			{ value: "--json", label: "--json" },
		]);
	});

	test("maps parsed command arguments before invoking the CLI runner", async () => {
		const pi = new FakePi();
		const calls: RunCall[] = [];
		registerFakeCli(pi, {
			commands: [
				{
					name: "preview-status",
					description: "Print a preview status.",
					mapParsedArgs: (args) => ({ ok: true, args: [...args, "--format", "markdown"] }),
				},
			],
			runCli: (args, deps) => {
				calls.push({ args: [...args], cwd: deps.cwd, env: deps.env });
				deps.stdout("ok\n");
				return 0;
			},
		});
		const { ctx } = createContext();

		await commandFor(pi, "dev:preview-status").handler("--minimal", ctx);

		expect(calls).toEqual([
			{
				args: ["preview-status", "--minimal", "--format", "markdown"],
				cwd: "/repo",
				env: process.env,
			},
		]);
		expectSingleCliOutputMessage(pi, "ok\n");
	});

	test("reports argument mapper rejections without invoking the CLI runner", async () => {
		const pi = new FakePi();
		let runnerCalled = false;
		registerFakeCli(pi, {
			commands: [
				{
					name: "preview-status",
					description: "Print a preview status.",
					mapParsedArgs: () => ({ ok: false, error: "--format is controlled by Pi." }),
				},
			],
			runCli: () => {
				runnerCalled = true;
				return 0;
			},
		});
		const { ctx, editorTexts } = createContext();

		await commandFor(pi, "dev:preview-status").handler("--format json", ctx);

		expect(runnerCalled).toBe(false);
		expect(editorTexts).toEqual(["/dev:preview-status --format json"]);
		expectSingleCliOutputMessage(
			pi,
			"fake-cli preview-status exited with code 2.\n\nstderr:\nError: --format is controlled by Pi.\n",
			"error",
		);
	});

	test("registers an explicit Pi command alias while preserving the CLI argv command name", async () => {
		const pi = new FakePi();
		const calls: RunCall[] = [];
		registerCliCommandExtension(pi, {
			cliName: "fake-cli",
			piNamespace: "dev",
			commands: [{ name: "cp", description: "Create a checkpoint." }],
			env: { SAMPLE: "1" },
			piCommandAliases: { cp: "dev:checkpoint" },
			runCli: (args, deps) => {
				calls.push({ args: [...args], cwd: deps.cwd, env: deps.env });
				deps.stdout("ok\n");
				return 0;
			},
		});
		const { ctx } = createContext();

		await commandFor(pi, "dev:checkpoint").handler("--message test", ctx);

		expect([...pi.commands.keys()]).toEqual(["dev:checkpoint"]);
		expect(calls).toEqual([
			{ args: ["cp", "--message", "test"], cwd: "/repo", env: { SAMPLE: "1" } },
		]);
		expectSingleCliOutputMessage(pi, "ok\n");
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

		await commandFor(pi, "dev:preview-status").handler("--branch feature/x --json", ctx);

		expect(order).toEqual(["wait", "run"]);
		expect(calls).toEqual([
			{
				args: ["preview-status", "--branch", "feature/x", "--json"],
				cwd: "/repo",
				env: { VERCEL_PROJECT: "env-project" },
			},
		]);
		expect(notifications).toEqual([]);
		expectSingleCliOutputMessage(
			pi,
			"stdout:\nhttps://preview.example\n\nstderr:\nwarning from cli\n",
		);
	});

	test("emits command-finished event after the CLI runner completes", async () => {
		const pi = new FakePi();
		registerFakeCli(pi, {
			runCli: (_args, deps) => {
				deps.stdout("updated\n");
				return 0;
			},
		});
		const { ctx } = createContext();

		await commandFor(pi, "dev:preview-status").handler("--json", ctx);

		expect(pi.commandFinishedEvents).toEqual([
			{
				commandName: "dev:preview-status",
				cwd: "/repo",
				source: "fake-cli preview-status",
				status: "completed",
				exitCode: 0,
			},
		]);
	});

	test("invokes command completion hook with output details after output emission", async () => {
		const pi = new FakePi();
		const order: string[] = [];
		const hookDetails: CliCommandOutputDetails[] = [];
		registerFakeCli(pi, {
			env: { SAMPLE: "1" },
			afterCommandComplete: (details) => {
				order.push("hook");
				hookDetails.push(details);
				expect(pi.sentMessages).toHaveLength(1);
			},
			runCli: (args, deps) => {
				order.push("run");
				expect(args).toEqual(["preview-status", "--json"]);
				deps.stdout("status ok\n");
				deps.stderr("warning\n");
				return 0;
			},
		});
		const { ctx } = createContext(order);

		await commandFor(pi, "dev:preview-status").handler("--json", ctx);

		expect(order).toEqual(["wait", "run", "hook"]);
		expect(hookDetails).toEqual([
			{
				cliName: "fake-cli",
				commandName: "preview-status",
				piCommandName: "dev:preview-status",
				rawArgs: "--json",
				args: ["--json"],
				argv: ["preview-status", "--json"],
				cwd: "/repo",
				exitCode: 0,
				stdout: "status ok\n",
				stderr: "warning\n",
				level: "info",
			},
		]);
		expectSingleCliOutputMessage(pi, "stdout:\nstatus ok\n\nstderr:\nwarning\n");
	});

	test("emits configured start feedback before waiting for idle", async () => {
		const pi = new FakePi();
		let releaseWait: (() => void) | undefined;
		const waitStarted = new Promise<void>((resolve) => {
			releaseWait = resolve;
		});
		registerFakeCli(pi, {
			commands: [
				{
					name: "preview-status",
					description: "Print a preview status.",
					startMessage: "Starting preview status lookup.",
				},
			],
			runCli: (_args, deps) => {
				deps.stdout("done\n");
				return 0;
			},
		});
		const notifications: Notification[] = [];
		const ctx: CommandContext = {
			cwd: "/repo",
			hasUI: true,
			ui: {
				notify(message, level) {
					notifications.push({ message, level });
				},
			},
			async waitForIdle() {
				await waitStarted;
			},
		};

		const commandPromise = commandFor(pi, "dev:preview-status").handler("", ctx);

		expect(notifications).toEqual([{ message: "Starting preview status lookup.", level: "info" }]);

		if (releaseWait === undefined) throw new Error("Expected wait resolver to be initialized.");
		releaseWait();
		await commandPromise;
		expectSingleCliOutputMessage(pi, "done\n");
	});

	test("passes UI confirmation capability to the CLI runner", async () => {
		const pi = new FakePi();
		registerFakeCli(pi, {
			runCli: async (_args, deps) => {
				const confirmed = await deps.confirm?.("Confirm title", "Confirm body");
				deps.stdout(`confirmed=${String(confirmed)}\n`);
				return 0;
			},
		});
		const { ctx, confirmations } = createContext([], { confirm: () => true });

		await commandFor(pi, "dev:preview-status").handler("", ctx);

		expect(confirmations).toEqual([{ title: "Confirm title", message: "Confirm body" }]);
		expectSingleCliOutputMessage(pi, "confirmed=true\n");
	});

	test("shows waiting-for-confirmation live progress while the CLI runner awaits UI confirmation", async () => {
		let finishConfirm: (() => void) | undefined;
		const confirmFinished = new Promise<void>((resolve) => {
			finishConfirm = resolve;
		});
		const pi = new FakePi();
		registerFakeCli(pi, {
			runCli: async (_args, deps) => {
				const confirmed = await deps.confirm?.("Confirm title", "Confirm body");
				deps.stdout(`confirmed=${String(confirmed)}\n`);
				return 0;
			},
		});
		let markConfirmStarted: (() => void) | undefined;
		const confirmStarted = new Promise<void>((resolve) => {
			markConfirmStarted = resolve;
		});
		const { ctx, statuses, widgets } = createContext([], {
			confirm: async () => {
				markConfirmStarted?.();
				await confirmFinished;
				return true;
			},
		});

		const commandPromise = commandFor(pi, "dev:preview-status").handler("", ctx);
		await confirmStarted;

		// CLI-backed commands render their own live progress block, so they suppress
		// the generic footer ack to avoid duplicate above/below-fold progress.
		expect(statuses).toEqual([]);
		expect(pi.progressMessages).toEqual([]);
		expect(widgets.at(-1)?.lines?.join("\n")).toContain("waiting for confirmation");

		if (finishConfirm === undefined)
			throw new Error("Expected confirm resolver to be initialized.");
		finishConfirm();
		await commandPromise;

		expectSingleCliOutputMessage(pi, "confirmed=true\n");
	});

	test("writes metadata trace events and sends final output as a custom message", async () => {
		const directory = mkdtempSync(join(tmpdir(), "pi-cli-trace-test-"));
		const tracePath = join(directory, "trace.jsonl");
		vi.stubEnv("NS_PI_CLI_TRACE", "1");
		vi.stubEnv("NS_PI_CLI_TRACE_PATH", tracePath);
		try {
			const pi = new FakePi();
			registerFakeCli(pi, {
				runCli: (_args, deps) => {
					deps.stdout("ok\n");
					return 0;
				},
			});
			const { ctx } = createContext();

			await commandFor(pi, "dev:preview-status").handler("--json", ctx);

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
				target: "widget",
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

		await commandFor(pi, "dev:preview-status").handler("--json", ctx);

		expect(notifications).toEqual([]);
		expectSingleCliOutputMessage(
			pi,
			"fake-cli preview-status exited with code 17.\n\nstderr:\nnot found\n",
			"error",
		);
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

		await commandFor(pi, "dev:preview-status").handler('--branch "unterminated', ctx);

		expect(runnerCalled).toBe(false);
		expectSingleCliOutputMessage(
			pi,
			"fake-cli preview-status exited with code 2.\n\nstderr:\nError: Unterminated double quote.\n",
			"error",
		);
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

		await commandFor(pi, "dev:preview-status").handler("broke in this pr", ctx);

		expect(runnerCalled).toBe(false);
		expect(order).toEqual([]);
		expect(editorTexts).toEqual(["/dev:preview-status broke in this pr"]);
		expect(notifications).toEqual([
			{
				message:
					"Not running /dev:preview-status: text after the command looks like prose, not options. The text was restored to the editor.",
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

		await commandFor(pi, "dev:preview-status").handler("--json words", ctx);

		expectSingleCliOutputMessage(
			pi,
			"fake-cli preview-status exited with code 2.\n\nstderr:\nError: Unexpected argument: words\n",
			"error",
		);
		expect(editorTexts).toEqual(["/dev:preview-status --json words"]);
	});

	test("runs command completion hook after restoring CLI usage errors", async () => {
		const pi = new FakePi();
		let editorTexts: string[] = [];
		const editorTextsAtHook: string[][] = [];
		const hookDetails: CliCommandOutputDetails[] = [];
		registerFakeCli(pi, {
			afterCommandComplete: (details) => {
				hookDetails.push(details);
				editorTextsAtHook.push([...editorTexts]);
			},
			runCli: (_args, deps) => {
				deps.stderr("Error: Unexpected argument: words\n");
				return 2;
			},
		});
		const context = createContext();
		editorTexts = context.editorTexts;

		await commandFor(pi, "dev:preview-status").handler("--json words", context.ctx);

		expectSingleCliOutputMessage(
			pi,
			"fake-cli preview-status exited with code 2.\n\nstderr:\nError: Unexpected argument: words\n",
			"error",
		);
		expect(editorTexts).toEqual(["/dev:preview-status --json words"]);
		expect(editorTextsAtHook).toEqual([["/dev:preview-status --json words"]]);
		expect(hookDetails).toHaveLength(1);
		expect(hookDetails[0]).toMatchObject({
			exitCode: 2,
			level: "error",
			stderr: "Error: Unexpected argument: words\n",
		});
	});

	test("restores command text after clinkr lowercase error usage errors", async () => {
		const pi = new FakePi();
		registerFakeCli(pi, {
			runCli: (_args, deps) => {
				deps.stderr("error: unknown option '--bogus'\n");
				return 2;
			},
		});
		const { ctx, editorTexts } = createContext();

		await commandFor(pi, "dev:preview-status").handler("--bogus", ctx);

		expectSingleCliOutputMessage(
			pi,
			"fake-cli preview-status exited with code 2.\n\nstderr:\nerror: unknown option '--bogus'\n",
			"error",
		);
		expect(editorTexts).toEqual(["/dev:preview-status --bogus"]);
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

		expect(calls).toEqual([
			{ args: ["echo", "hello", "world"], cwd: "/repo", env: { SAMPLE: "1" } },
		]);
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

		await commandFor(pi, "dev:preview-status").handler("", ctx);

		expect(notifications).toEqual([]);
		expectSingleCliOutputMessage(pi, "ok\n");
	});

	test("falls back to stdout for successful headless command output", async () => {
		const pi = new FakePi();
		registerFakeCli(pi, {
			runCli: (_args, deps) => {
				deps.stdout("ok\n");
				return 0;
			},
		});
		const { ctx, notifications, editorTexts, statuses, widgets } = createContext([], {
			hasUI: false,
		});

		const writes = await captureProcessWrites(async () => {
			await commandFor(pi, "dev:preview-status").handler("", ctx);
		});

		expect(writes).toEqual({ stdout: "ok\n", stderr: "" });
		expect(pi.sentMessages).toEqual([]);
		expect(notifications).toEqual([]);
		expect(editorTexts).toEqual([]);
		expect(statuses).toEqual([]);
		expect(widgets).toEqual([]);
	});

	test("falls back to stderr for error-level headless command output", async () => {
		const pi = new FakePi();
		registerFakeCli(pi, {
			runCli: (_args, deps) => {
				deps.stderr("not found\n");
				return 17;
			},
		});
		const { ctx, notifications, editorTexts, statuses, widgets } = createContext([], {
			hasUI: false,
		});

		const writes = await captureProcessWrites(async () => {
			await commandFor(pi, "dev:preview-status").handler("--json", ctx);
		});

		expect(writes).toEqual({
			stdout: "",
			stderr: "fake-cli preview-status exited with code 17.\n\nstderr:\nnot found\n",
		});
		expect(pi.sentMessages).toEqual([]);
		expect(notifications).toEqual([]);
		expect(editorTexts).toEqual([]);
		expect(statuses).toEqual([]);
		expect(widgets).toEqual([]);
	});

	test("emits headless positional-argument rejections instead of restoring editor text", async () => {
		const pi = new FakePi();
		const order: string[] = [];
		let runnerCalled = false;
		registerFakeCli(pi, {
			runCli: () => {
				runnerCalled = true;
				return 0;
			},
		});
		const { ctx, notifications, editorTexts, statuses, widgets } = createContext(order, {
			hasUI: false,
		});

		const writes = await captureProcessWrites(async () => {
			await commandFor(pi, "dev:preview-status").handler("broke in this pr", ctx);
		});

		expect(runnerCalled).toBe(false);
		expect(order).toEqual([]);
		expect(writes).toEqual({
			stdout: "",
			stderr:
				"fake-cli preview-status exited with code 2.\n\nstderr:\nError: /dev:preview-status only accepts option-style arguments here. Use --help for usage.\n",
		});
		expect(pi.sentMessages).toEqual([]);
		expect(notifications).toEqual([]);
		expect(editorTexts).toEqual([]);
		expect(statuses).toEqual([]);
		expect(widgets).toEqual([]);
	});

	test("emits UI positional-argument rejections when editor restoration is unavailable", async () => {
		const pi = new FakePi();
		const order: string[] = [];
		let runnerCalled = false;
		registerFakeCli(pi, {
			runCli: () => {
				runnerCalled = true;
				return 0;
			},
		});
		const { ctx, notifications, editorTexts } = createContext(order, { setEditorText: false });

		await commandFor(pi, "dev:preview-status").handler("broke in this pr", ctx);

		expect(runnerCalled).toBe(false);
		expect(order).toEqual([]);
		expect(editorTexts).toEqual([]);
		expect(notifications).toEqual([]);
		expectSingleCliOutputMessage(
			pi,
			"fake-cli preview-status exited with code 2.\n\nstderr:\nError: /dev:preview-status only accepts option-style arguments here. Use --help for usage.\n",
			"error",
		);
	});

	test("does not restore UI usage errors when editor restoration is unavailable", async () => {
		const pi = new FakePi();
		registerFakeCli(pi, {
			runCli: (_args, deps) => {
				deps.stderr("Error: Unexpected argument: words\n");
				return 2;
			},
		});
		const { ctx, notifications, editorTexts } = createContext([], { setEditorText: false });

		await commandFor(pi, "dev:preview-status").handler("--json words", ctx);

		expect(editorTexts).toEqual([]);
		expect(notifications).toEqual([]);
		expectSingleCliOutputMessage(
			pi,
			"fake-cli preview-status exited with code 2.\n\nstderr:\nError: Unexpected argument: words\n",
			"error",
		);
	});

	test("falls back to UI notifications when custom rendering is unavailable", async () => {
		const cases = [
			new FakePi({ registerMessageRenderer: false }),
			new FakePi({ sendMessage: false }),
		];
		for (const pi of cases) {
			registerFakeCli(pi, {
				runCli: (_args, deps) => {
					deps.stdout("ok\n");
					return 0;
				},
			});
			const { ctx, notifications } = createContext();

			await commandFor(pi, "dev:preview-status").handler("", ctx);

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
		expect(rendered).toContain(
			"<text>- Describe checkpointing outstanding changes before submit</text>",
		);
		expect(rendered).not.toContain("<dim>");
		expect(rendered).not.toContain("<muted>");
	});

	test("updates the live widget without footer status while the CLI command is running", async () => {
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

		const commandPromise = commandFor(pi, "dev:preview-status").handler("", ctx);
		await runStarted;

		const liveWidgetText = widgets.at(-1)?.lines?.join("\n") ?? "";
		expect(widgets.at(-1)?.placement).toBe("aboveEditor");
		// CLI-backed commands render their own live progress block, so they suppress
		// the generic footer ack to avoid duplicate above/below-fold progress.
		expect(statuses).toEqual([]);
		expect(pi.progressMessages).toEqual([]);
		expect(liveWidgetText).toContain("/dev:preview-status running CLI command");
		expect(liveWidgetText).toContain("stdout: started");
		expect(pi.sentMessages).toEqual([]);

		if (finishRun === undefined) throw new Error("Expected run resolver to be initialized.");
		finishRun();
		await commandPromise;

		expect(statuses.at(-1)).toEqual({ key: "ns-cli-command", value: undefined });
		expect(widgets.at(-1)).toEqual({
			key: "ns-cli-command-output",
			lines: undefined,
			placement: undefined,
		});
		expect(notifications).toEqual([]);
		expectSingleCliOutputMessage(pi, "stdout:\nstarted\n\nstderr:\nfinished\n");
	});

	test("uses footer status as a fallback when live widgets are unavailable", async () => {
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
				return 0;
			},
		});
		const { ctx, statuses, widgets } = createContext([], { setWidget: false });

		const commandPromise = commandFor(pi, "dev:preview-status").handler("", ctx);
		await runStarted;

		expect(widgets).toEqual([]);
		expect(statuses.at(-1)?.value).toContain("/dev:preview-status running CLI command");

		if (finishRun === undefined) throw new Error("Expected run resolver to be initialized.");
		finishRun();
		await commandPromise;

		expect(statuses.at(-1)).toEqual({ key: "ns-cli-command", value: undefined });
	});

	test("keeps footer status stable while the live widget ticks", async () => {
		const timers = createManualTimerScheduler();
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
				deps.stderr("running elsewhere\n");
				markRunStarted?.();
				await runFinished;
				return 0;
			},
			timers: timers.timers,
		});
		const { ctx, statuses, widgets } = createContext();

		const commandPromise = commandFor(pi, "dev:preview-status").handler("", ctx);
		await runStarted;

		// Ignore the transient auto-clearing ack status; this test isolates whether the
		// live-widget ticks churn the footer status, not the one-shot ack lifecycle.
		const withoutAck = (entries: StatusUpdate[]): (string | undefined)[] =>
			entries.filter((status) => status.key !== "ns-command-ack").map((status) => status.value);
		const statusValuesBeforeTicks = withoutAck(statuses);
		const widgetCountBeforeTicks = widgets.length;
		timers.advanceMs(3_000);

		expect(withoutAck(statuses)).toEqual(statusValuesBeforeTicks);
		expect(widgets.length).toBeGreaterThan(widgetCountBeforeTicks);

		if (finishRun === undefined) throw new Error("Expected run resolver to be initialized.");
		finishRun();
		await commandPromise;
		expect(statuses.at(-1)).toEqual({ key: "ns-cli-command", value: undefined });
		expect(timers.pendingTimerCount()).toBe(0);
	});

	test("suppresses stale command-context errors after session replacement", async () => {
		let hasRunBeenCalled = false;
		const pi = new FakePi();
		registerFakeCli(pi, {
			runCli: () => {
				hasRunBeenCalled = true;
				return 0;
			},
		});
		const base = createContext();
		const ctx = {
			cwd: base.ctx.cwd,
			hasUI: true,
			ui: base.ctx.ui,
			async waitForIdle() {
				throw new Error(
					"This extension ctx is stale after session replacement or reload. Do not use a captured pi or command ctx after ctx.newSession().",
				);
			},
		} satisfies CommandContext;

		await expect(commandFor(pi, "dev:preview-status").handler("", ctx)).resolves.toBeUndefined();

		expect(hasRunBeenCalled).toBe(false);
		expect(pi.sentMessages).toEqual([]);
	});

	test("stops live progress when the Pi command context becomes stale", async () => {
		let isStale = false;
		const pi = new FakePi();
		registerFakeCli(pi, {
			runCli: (_args, deps) => {
				isStale = true;
				deps.onOutput?.("stdout", "still running after replacement\n");
				return 0;
			},
		});
		const base = createContext();
		const ctx = {
			cwd: base.ctx.cwd,
			hasUI: true,
			get ui() {
				if (isStale) {
					throw new Error(
						"This extension ctx is stale after session replacement or reload. Do not use a captured pi or command ctx after ctx.newSession().",
					);
				}
				return base.ctx.ui;
			},
			waitForIdle: base.ctx.waitForIdle,
		} satisfies CommandContext;

		await expect(commandFor(pi, "dev:preview-status").handler("", ctx)).resolves.toBeUndefined();

		expectSingleCliOutputMessage(
			pi,
			"fake-cli preview-status completed successfully with no output.",
		);
	});

	test("suppresses final output when the Pi message host becomes stale", async () => {
		const pi = new FakePi({ shouldMakeSendMessageStale: true });
		registerFakeCli(pi);
		const { ctx, notifications } = createContext();

		await expect(commandFor(pi, "dev:preview-status").handler("", ctx)).resolves.toBeUndefined();

		expect(pi.sentMessages).toEqual([]);
		expect(notifications).toEqual([]);
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

		const commandPromise = commandFor(pi, "dev:preview-status").handler("", ctx);
		await liveOutputObserved;

		const liveWidgetText = widgets.at(-1)?.lines?.join("\n") ?? "";
		expect(liveWidgetText).toContain("… 1 earlier recent CLI line hidden");
		expect(liveWidgetText).toContain("stderr: live stderr");
		expect(liveWidgetText).not.toContain("final stdout");

		if (finishRun === undefined) throw new Error("Expected run resolver to be initialized.");
		finishRun();
		await commandPromise;

		expect(notifications).toEqual([]);
		expectSingleCliOutputMessage(pi, "final stdout\n");
	});

	test("renders structured CLI phase progress as a checklist widget", async () => {
		let markPhasesObserved: (() => void) | undefined;
		const phasesObserved = new Promise<void>((resolve) => {
			markPhasesObserved = resolve;
		});
		let finishRun: (() => void) | undefined;
		const runFinished = new Promise<void>((resolve) => {
			finishRun = resolve;
		});
		const pi = new FakePi();
		registerCliCommandExtension(pi, {
			cliName: "ns",
			piNamespace: "ns:flow",
			commands: [
				{
					name: "submit",
					description: "Submit a stack.",
					argvPrefix: ["flow", "submit"],
					displayName: "flow submit",
				},
			],
			runCli: async (_args, deps) => {
				deps.onProgress?.({
					type: "phases-declared",
					title: "ns flow submit",
					phases: [
						{ key: "checkpoint", name: "Checkpoint" },
						{ key: "submit", name: "Submit" },
						{ key: "verify", name: "Verification" },
					],
				});
				deps.onProgress?.({ type: "phase-started", phaseKey: "checkpoint" });
				deps.onProgress?.({
					type: "phase-done",
					phaseKey: "checkpoint",
					detail: "checkpoint complete",
				});
				deps.onProgress?.({
					type: "phase-started",
					phaseKey: "submit",
					label: "running gt submit --no-edit…",
				});
				markPhasesObserved?.();
				await runFinished;
				return 0;
			},
		});
		const { ctx, widgets } = createContext();

		const commandPromise = commandFor(pi, "ns:flow:submit").handler("", ctx);
		await phasesObserved;

		expect(widgets.at(-1)?.lines).toEqual([
			"/ns:flow:submit (0s elapsed)",
			"✓ Checkpoint    checkpoint complete",
			"▸ Submit        running gt submit --no-edit…",
			"· Verification",
		]);

		if (finishRun === undefined) throw new Error("Expected run resolver to be initialized.");
		finishRun();
		await commandPromise;
	});

	test("keeps the raw live widget layout when no structured progress events arrive", async () => {
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
				deps.onOutput?.("stderr", "live stderr");
				markLiveOutputObserved?.();
				await runFinished;
				return 0;
			},
		});
		const { ctx, widgets } = createContext();

		const commandPromise = commandFor(pi, "dev:preview-status").handler("", ctx);
		await liveOutputObserved;

		expect(widgets.at(-1)?.lines).toEqual([
			"/dev:preview-status running CLI command (0s elapsed)",
			"$ fake-cli preview-status · stdout 0, stderr 11",
			"stderr: live stderr",
		]);

		if (finishRun === undefined) throw new Error("Expected run resolver to be initialized.");
		finishRun();
		await commandPromise;
	});

	test("appends unknown structured phase keys in arrival order", async () => {
		let markPhasesObserved: (() => void) | undefined;
		const phasesObserved = new Promise<void>((resolve) => {
			markPhasesObserved = resolve;
		});
		let finishRun: (() => void) | undefined;
		const runFinished = new Promise<void>((resolve) => {
			finishRun = resolve;
		});
		const pi = new FakePi();
		registerFakeCli(pi, {
			runCli: async (_args, deps) => {
				deps.onProgress?.({ type: "phase-progress", phaseKey: "discover", label: "finding work" });
				deps.onProgress?.({ type: "phase-started", phaseKey: "submit", label: "submitting" });
				markPhasesObserved?.();
				await runFinished;
				return 0;
			},
		});
		const { ctx, widgets } = createContext();

		const commandPromise = commandFor(pi, "dev:preview-status").handler("", ctx);
		await phasesObserved;

		expect(widgets.at(-1)?.lines).toEqual([
			"/dev:preview-status (0s elapsed)",
			"✓ discover  finding work",
			"▸ submit    submitting",
		]);

		if (finishRun === undefined) throw new Error("Expected run resolver to be initialized.");
		finishRun();
		await commandPromise;
	});

	test("shows the latest raw output line at the end of the structured phase widget", async () => {
		let markTailObserved: (() => void) | undefined;
		const tailObserved = new Promise<void>((resolve) => {
			markTailObserved = resolve;
		});
		let finishRun: (() => void) | undefined;
		const runFinished = new Promise<void>((resolve) => {
			finishRun = resolve;
		});
		const pi = new FakePi();
		registerFakeCli(pi, {
			runCli: async (_args, deps) => {
				deps.onProgress?.({
					type: "phases-declared",
					title: "fake-cli preview-status",
					phases: [{ key: "submit", name: "Submit" }],
				});
				deps.onProgress?.({ type: "phase-started", phaseKey: "submit", label: "running" });
				deps.onOutput?.("stderr", "Pushing branches to remote…");
				markTailObserved?.();
				await runFinished;
				return 0;
			},
		});
		const { ctx, widgets } = createContext();

		const commandPromise = commandFor(pi, "dev:preview-status").handler("", ctx);
		await tailObserved;

		expect(widgets.at(-1)?.lines).toEqual([
			"/dev:preview-status (0s elapsed)",
			"▸ Submit  running",
			"  stderr: Pushing branches to remote…",
		]);

		if (finishRun === undefined) throw new Error("Expected run resolver to be initialized.");
		finishRun();
		await commandPromise;
	});

	test("clears the structured live widget when the CLI command finishes", async () => {
		const pi = new FakePi();
		registerFakeCli(pi, {
			runCli: (_args, deps) => {
				deps.onProgress?.({
					type: "phases-declared",
					title: "fake-cli preview-status",
					phases: [{ key: "submit", name: "Submit" }],
				});
				deps.onProgress?.({ type: "phase-done", phaseKey: "submit", detail: "done" });
				return 0;
			},
		});
		const { ctx, widgets } = createContext();

		await commandFor(pi, "dev:preview-status").handler("", ctx);

		expect(widgets.at(-1)).toEqual({
			key: "ns-cli-command-output",
			lines: undefined,
			placement: undefined,
		});
	});

	test("parses shell-like whitespace quotes and escapes", () => {
		expect(parseCliCommandArgs("--branch feature/x --json")).toEqual({
			ok: true,
			args: ["--branch", "feature/x", "--json"],
		});
		expect(
			parseCliCommandArgs(
				'--branch \'feature with spaces\' --project sdl\\ tools --label "say \\"hi\\""',
			),
		).toEqual({
			ok: true,
			args: ["--branch", "feature with spaces", "--project", "sdl tools", "--label", 'say "hi"'],
		});
		expect(parseCliCommandArgs('--branch "unterminated')).toEqual({
			ok: false,
			error: "Unterminated double quote.",
		});
		expect(parseCliCommandArgs("--branch dangling\\")).toEqual({
			ok: false,
			error: "Trailing backslash escape.",
		});
	});

	test("rejects duplicate command names before registering suffix-prone collisions", () => {
		const pi = new FakePi();

		expect(() => {
			registerFakeCli(pi, {
				commands: [
					{ name: "preview-status", description: "First." },
					{ name: "preview-status", description: "Second." },
				],
			});
		}).toThrow("Duplicate fake-cli command name: preview-status");
		expect(pi.commands.size).toBe(0);
	});

	test("rejects stale Pi command alias keys before registering commands", () => {
		const pi = new FakePi();

		expect(() => {
			registerCliCommandExtension(pi, {
				cliName: "fake-cli",
				piNamespace: "dev",
				commands: [{ name: "current", description: "Current command." }],
				piCommandAliases: { stale: "dev:old" },
				runCli: () => 0,
			});
		}).toThrow(
			"CLI command extension for fake-cli includes a Pi command alias key stale that does not match any declared command name.",
		);
		expect(pi.commands.size).toBe(0);
	});

	test("rejects duplicate resolved Pi command aliases before registering collisions", () => {
		const pi = new FakePi();

		expect(() => {
			registerCliCommandExtension(pi, {
				cliName: "fake-cli",
				piNamespace: "dev",
				commands: [
					{ name: "one", description: "First." },
					{ name: "two", description: "Second." },
				],
				piCommandAliases: { one: "dev:same", two: "dev:same" },
				runCli: () => 0,
			});
		}).toThrow("Duplicate fake-cli Pi command name: dev:same");
		expect(pi.commands.size).toBe(0);
	});
});
