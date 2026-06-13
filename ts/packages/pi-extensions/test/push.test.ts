import { describe, expect, test } from "vitest";

import pushExtension, {
	PUSH_OUTPUT_MESSAGE_TYPE,
	renderPushOutputMessage,
	type CommandContext,
	type ExecResult,
	type ExtensionAPI,
} from "../src/push.ts";
import { stripTerminalEscapes } from "../src/terminal-presentation.ts";

const ROOT = "/repo";
const PUSH_TIMEOUT_MS = 120_000;

type RegisteredCommand = Parameters<ExtensionAPI["registerCommand"]>[1];
type ExecOptions = Parameters<ExtensionAPI["exec"]>[2];
type CustomMessage = Parameters<NonNullable<ExtensionAPI["sendMessage"]>>[0];
type MessageRenderer = Parameters<NonNullable<ExtensionAPI["registerMessageRenderer"]>>[1];

interface ExecCall {
	command: string;
	args: string[];
	options: ExecOptions;
}

interface ScriptedExec {
	command: string;
	args: string[];
	result: Partial<ExecResult> | undefined;
}

interface Notification {
	message: string;
	level: "info" | "warning" | "error" | undefined;
}

class FakePi implements ExtensionAPI {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly calls: ExecCall[] = [];
	readonly errors: string[] = [];
	readonly messageRenderers = new Map<string, MessageRenderer>();
	readonly sentMessages: CustomMessage[] = [];
	readonly events: string[];
	readonly registerMessageRenderer?: (customType: string, renderer: MessageRenderer) => void;
	readonly sendMessage?: (message: CustomMessage) => void;
	private readonly script: ScriptedExec[];

	constructor(script: ScriptedExec[] = [], options: { sendMessage?: boolean; registerMessageRenderer?: boolean; events?: string[] } = {}) {
		this.script = [...script];
		this.events = options.events ?? [];
		if (options.registerMessageRenderer ?? true) {
			this.registerMessageRenderer = (customType, renderer) => {
				this.messageRenderers.set(customType, renderer);
			};
		}
		if (options.sendMessage ?? true) {
			this.sendMessage = (message) => {
				this.sentMessages.push(message);
			};
		}
	}

	registerCommand(name: string, command: RegisteredCommand): void {
		this.commands.set(name, command);
	}

	async exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult> {
		this.events.push(`exec:${command} ${args.join(" ")}`);
		this.calls.push({ command, args: [...args], options });
		const expected = this.script.shift();
		if (expected === undefined) {
			const message = `unexpected exec: ${command} ${args.join(" ")}`;
			this.errors.push(message);
			return execResult({ code: 99, stderr: message });
		}
		if (expected.command !== command || !sameArgs(expected.args, args)) {
			const message = `expected ${expected.command} ${expected.args.join(" ")}, got ${command} ${args.join(" ")}`;
			this.errors.push(message);
			return execResult({ code: 99, stderr: message });
		}
		return execResult(expected.result);
	}

	assertDone(): void {
		expect(this.errors).toEqual([]);
		expect(this.script).toEqual([]);
	}
}

function createContext(events: string[] = []): {
	ctx: CommandContext;
	notifications: Notification[];
	waitForIdleCalls: () => number;
} {
	const notifications: Notification[] = [];
	let waits = 0;
	const ctx: CommandContext = {
		cwd: ROOT,
		ui: {
			notify(message, level): void {
				notifications.push({ message, level });
			},
		},
		async waitForIdle(): Promise<void> {
			waits += 1;
			events.push("waitForIdle");
		},
	};
	return { ctx, notifications, waitForIdleCalls: () => waits };
}

function execResult(overrides: Partial<ExecResult> = {}): ExecResult {
	return {
		stdout: overrides.stdout ?? "",
		stderr: overrides.stderr ?? "",
		code: overrides.code ?? 0,
		killed: overrides.killed ?? false,
	};
}

function step(command: string, args: string[], result?: Partial<ExecResult>): ScriptedExec {
	return { command, args, result };
}

function sameArgs(left: string[], right: string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

function registeredPushCommand(pi: FakePi): RegisteredCommand {
	pushExtension(pi);
	const command = pi.commands.get("code:push");
	if (command === undefined) throw new Error("expected code:push command");
	return command;
}

function messageText(message: CustomMessage | undefined): string {
	if (message === undefined) throw new Error("expected sent message");
	return String(message.content);
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

function noopTheme(): { fg(_color: string, text: string): string; bold(text: string): string } {
	return {
		fg(_color, text) {
			return text;
		},
		bold(text) {
			return text;
		},
	};
}

describe("push extension registration", () => {
	test("registers code:push with an appropriate description and renderer", () => {
		const pi = new FakePi();

		pushExtension(pi);

		expect([...pi.commands.keys()]).toEqual(["code:push"]);
		expect(pi.commands.get("code:push")?.description).toContain("git push");
		expect(pi.commands.get("code:push")?.description).toContain("already-committed");
		expect(pi.messageRenderers.has(PUSH_OUTPUT_MESSAGE_TYPE)).toBe(true);
	});
});

describe("code:push", () => {
	test("rejects non-empty args before waiting or executing git", async () => {
		const pi = new FakePi();
		const command = registeredPushCommand(pi);
		const { ctx, notifications, waitForIdleCalls } = createContext();

		await command.handler(" --force", ctx);

		pi.assertDone();
		expect(pi.calls).toEqual([]);
		expect(waitForIdleCalls()).toBe(0);
		expect(notifications).toEqual([{ message: "`/code:push` does not accept arguments.", level: "error" }]);
		expect(messageText(pi.sentMessages[0])).toContain("does not accept arguments");
	});

	test("calls waitForIdle before git commands", async () => {
		const events: string[] = [];
		const pi = new FakePi([step("git", ["status", "--porcelain"]), step("git", ["push"])], { events });
		const command = registeredPushCommand(pi);
		const { ctx } = createContext(events);

		await command.handler("", ctx);

		pi.assertDone();
		expect(events).toEqual(["waitForIdle", "exec:git status --porcelain", "exec:git push"]);
	});

	test("dirty status blocks push after git status", async () => {
		const pi = new FakePi([step("git", ["status", "--porcelain"], { stdout: " M src/file.ts\n?? new-file.ts\n" })]);
		const command = registeredPushCommand(pi);
		const { ctx, notifications } = createContext();

		await command.handler("", ctx);

		pi.assertDone();
		expect(pi.calls).toHaveLength(1);
		expect(pi.calls[0]).toEqual({ command: "git", args: ["status", "--porcelain"], options: { cwd: ROOT } });
		expect(notifications).toEqual([{ message: "`/code:push` requires a clean worktree.", level: "warning" }]);
		const content = messageText(pi.sentMessages[0]);
		expect(content).toContain("did not run `git push`");
		expect(content).toContain(" M src/file.ts");
		expect(content).toContain("?? new-file.ts");
	});

	test("clean status runs git push with a two-minute timeout", async () => {
		const pi = new FakePi([step("git", ["status", "--porcelain"]), step("git", ["push"], { stdout: "Everything up-to-date\n" })]);
		const command = registeredPushCommand(pi);
		const { ctx } = createContext();

		await command.handler("", ctx);

		pi.assertDone();
		expect(pi.calls).toEqual([
			{ command: "git", args: ["status", "--porcelain"], options: { cwd: ROOT } },
			{ command: "git", args: ["push"], options: { cwd: ROOT, timeout: PUSH_TIMEOUT_MS } },
		]);
	});

	test("successful push emits a success notification and evidence message", async () => {
		const pi = new FakePi([step("git", ["status", "--porcelain"]), step("git", ["push"], { stdout: "To github.com:repo/project.git\n" })]);
		const command = registeredPushCommand(pi);
		const { ctx, notifications } = createContext();

		await command.handler("", ctx);

		pi.assertDone();
		expect(notifications).toEqual([{ message: "`git push` completed successfully.", level: "info" }]);
		const content = messageText(pi.sentMessages[0]);
		expect(content).toContain("`git push` completed successfully.");
		expect(content).toContain("Command: git push");
		expect(content).toContain(`Cwd: ${ROOT}`);
		expect(content).toContain("Exit: 0");
		expect(content).toContain("Killed: false");
		expect(content).toContain("To github.com:repo/project.git");
	});

	test("nonzero push emits generic code:submit guidance and includes stdout/stderr", async () => {
		const pi = new FakePi([
			step("git", ["status", "--porcelain"]),
			step("git", ["push"], { code: 1, stdout: "rejected update\n", stderr: "non-fast-forward\n" }),
		]);
		const command = registeredPushCommand(pi);
		const { ctx, notifications } = createContext();

		await command.handler("", ctx);

		pi.assertDone();
		expect(notifications).toEqual([{ message: "`git push` failed; use `/code:submit`.", level: "error" }]);
		const content = messageText(pi.sentMessages[0]);
		expect(content).toContain("The branch is likely out of sync or needs the Graphite submit flow. Use `/code:submit`.");
		expect(content).toContain("stdout:\nrejected update");
		expect(content).toContain("stderr:\nnon-fast-forward");
	});

	test("killed push is a failure even with exit code zero", async () => {
		const pi = new FakePi([step("git", ["status", "--porcelain"]), step("git", ["push"], { code: 0, killed: true, stderr: "timed out\n" })]);
		const command = registeredPushCommand(pi);
		const { ctx, notifications } = createContext();

		await command.handler("", ctx);

		pi.assertDone();
		expect(notifications).toEqual([{ message: "`git push` failed; use `/code:submit`.", level: "error" }]);
		expect(messageText(pi.sentMessages[0])).toContain("Killed: true");
	});

	test("status failure does not run push", async () => {
		const pi = new FakePi([step("git", ["status", "--porcelain"], { code: 128, stderr: "not a git repository\n" })]);
		const command = registeredPushCommand(pi);
		const { ctx, notifications } = createContext();

		await command.handler("", ctx);

		pi.assertDone();
		expect(pi.calls).toHaveLength(1);
		expect(notifications).toEqual([{ message: "Could not inspect worktree status for `/code:push`.", level: "error" }]);
		expect(messageText(pi.sentMessages[0])).toContain("Could not inspect the worktree status");
		expect(messageText(pi.sentMessages[0])).toContain("not a git repository");
	});

	test("falls back to a useful notification when sendMessage is unavailable", async () => {
		const pi = new FakePi([step("git", ["status", "--porcelain"]), step("git", ["push"], { stdout: "Everything up-to-date\n" })], {
			sendMessage: false,
		});
		const command = registeredPushCommand(pi);
		const { ctx, notifications } = createContext();

		await command.handler("", ctx);

		pi.assertDone();
		expect(pi.sentMessages).toEqual([]);
		expect(notifications).toHaveLength(1);
		expect(notifications[0]?.level).toBe("info");
		expect(notifications[0]?.message).toContain("`git push` completed successfully.");
		expect(notifications[0]?.message).toContain("Command: git push");
		expect(notifications[0]?.message).toContain("Everything up-to-date");
	});
});

describe("push output renderer", () => {
	test("styles headline and output labels by message level", () => {
		const info = renderPushOutputMessage(
			{ customType: PUSH_OUTPUT_MESSAGE_TYPE, content: "ok\nstdout:\nvalue", display: true, details: { level: "info" } },
			{ expanded: false },
			taggedTheme(),
		);
		const warning = renderPushOutputMessage(
			{ customType: PUSH_OUTPUT_MESSAGE_TYPE, content: "dirty", display: true, details: { level: "warning" } },
			{ expanded: false },
			taggedTheme(),
		);
		const error = renderPushOutputMessage(
			{ customType: PUSH_OUTPUT_MESSAGE_TYPE, content: "failed", display: true, details: { level: "error" } },
			{ expanded: false },
			taggedTheme(),
		);

		expect(info.render(120)).toEqual(["<accent><bold>ok</bold></accent>", "<muted>stdout:</muted>", "value"]);
		expect(warning.render(120)[0]).toBe("<warning>dirty</warning>");
		expect(error.render(120)[0]).toBe("<error>failed</error>");
	});

	test("truncates rendered lines to the available width", () => {
		const component = renderPushOutputMessage(
			{ customType: PUSH_OUTPUT_MESSAGE_TYPE, content: "A very long rendered line", display: true, details: { level: "info" } },
			{ expanded: false },
			noopTheme(),
		);

		const rendered = stripTerminalEscapes(component.render(12)[0] ?? "");
		expect(rendered.length).toBeLessThanOrEqual(12);
		expect(rendered).toContain("…");
	});
});
