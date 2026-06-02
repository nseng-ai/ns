import { describe, expect, test } from "bun:test";

import roastExtension, { buildRoasterArgs } from "../src/roast.ts";
import type { ExecResult, ExtensionAPI, ExtensionCommandContext } from "../src/roast.ts";

const ROOT = "/repo";
const ROASTER_TIMEOUT_MS = 30 * 60 * 1000;

type RegisteredCommand = Parameters<ExtensionAPI["registerCommand"]>[1];

type Notification = {
	message: string;
	level: "info" | "warning" | "error" | undefined;
};

type StatusUpdate = {
	key: string;
	value: string | undefined;
};

interface ExecCall {
	command: string;
	args: string[];
	options: { cwd?: string; timeout?: number } | undefined;
}

class FakePi implements ExtensionAPI {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly execCalls: ExecCall[] = [];
	readonly messages: Array<{ customType: string; content: string; display: boolean; details?: unknown }> = [];
	private readonly execResult: ExecResult;

	constructor(execResult: ExecResult = { stdout: "", stderr: "", code: 0 }) {
		this.execResult = execResult;
	}

	registerCommand(name: string, options: RegisteredCommand): void {
		this.commands.set(name, options);
	}

	async exec(command: string, args: string[], options?: { cwd?: string; timeout?: number }): Promise<ExecResult> {
		this.execCalls.push({ command, args: [...args], options });
		return this.execResult;
	}

	sendMessage(message: { customType: string; content: string; display: boolean; details?: unknown }): void {
		this.messages.push(message);
	}
}

function createContext(): {
	ctx: ExtensionCommandContext;
	notifications: Notification[];
	statuses: StatusUpdate[];
	waitForIdleCalls: () => number;
	editorText: () => string | undefined;
} {
	const notifications: Notification[] = [];
	const statuses: StatusUpdate[] = [];
	let waits = 0;
	let restoredEditorText: string | undefined;
	const ctx: ExtensionCommandContext = {
		cwd: ROOT,
		hasUI: true,
		ui: {
			notify(message, level): void {
				notifications.push({ message, level });
			},
			setStatus(key, value): void {
				statuses.push({ key, value });
			},
			setEditorText(text): void {
				restoredEditorText = text;
			},
		},
		async waitForIdle(): Promise<void> {
			waits += 1;
		},
	};

	return { ctx, notifications, statuses, waitForIdleCalls: () => waits, editorText: () => restoredEditorText };
}

describe("roast extension", () => {
	test("registers /roast and runs matching roaster reviews through uv", async () => {
		const pi = new FakePi({ stdout: "Selected reviews: 1\n", stderr: "▶ Running matching reviews\n", code: 0 });
		roastExtension(pi);

		const command = pi.commands.get("roast");
		expect(command?.description).toContain("when_changed");
		if (!command) throw new Error("roast command was not registered");

		const context = createContext();
		await command.handler("", context.ctx);

		expect(context.waitForIdleCalls()).toBe(1);
		expect(pi.execCalls).toEqual([
			{
				command: "uv",
				args: ["run", "roaster", "review", "run-matching", "--review-format", "findings"],
				options: { cwd: ROOT, timeout: ROASTER_TIMEOUT_MS },
			},
		]);
		expect(context.statuses).toEqual([
			{ key: "roast", value: "running roaster…" },
			{ key: "roast", value: undefined },
		]);
		expect(context.notifications).toContainEqual({ message: "Running matching roaster reviews…", level: "info" });
		expect(pi.messages[0]?.content).toContain("Selected reviews: 1");
		expect(pi.messages[0]?.content).toContain("stderr:");
	});

	test("threads user flags and does not duplicate explicit review format", async () => {
		const pi = new FakePi({ stdout: "ok\n", stderr: "", code: 0 });
		roastExtension(pi);
		const command = pi.commands.get("roast");
		if (!command) throw new Error("roast command was not registered");

		const context = createContext();
		await command.handler("--review-format text --model sonnet", context.ctx);

		expect(pi.execCalls[0]?.args).toEqual([
			"run",
			"roaster",
			"review",
			"run-matching",
			"--review-format",
			"text",
			"--model",
			"sonnet",
		]);
	});

	test("restores the command on parse errors without running uv", async () => {
		const pi = new FakePi();
		roastExtension(pi);
		const command = pi.commands.get("roast");
		if (!command) throw new Error("roast command was not registered");

		const context = createContext();
		await command.handler("--model 'unterminated", context.ctx);

		expect(context.waitForIdleCalls()).toBe(0);
		expect(pi.execCalls).toEqual([]);
		expect(context.editorText()).toBe("/roast --model 'unterminated");
		expect(context.notifications[0]?.level).toBe("warning");
		expect(pi.messages[0]?.content).toContain("Error: Unterminated single quote.");
	});
});

describe("buildRoasterArgs", () => {
	test("defaults to findings review format", () => {
		expect(buildRoasterArgs([])).toEqual(["review", "run-matching", "--review-format", "findings"]);
	});

	test("preserves help args without adding defaults", () => {
		expect(buildRoasterArgs(["--help"])).toEqual(["review", "run-matching", "--help"]);
	});
});
