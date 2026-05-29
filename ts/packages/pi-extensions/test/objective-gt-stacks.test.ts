import { describe, expect, test } from "bun:test";

import objectiveGtStacksExtension, {
	completeObjectiveGtStacksArgs,
	parseObjectiveGtStacksArgs,
	type CommandContext,
	type ExtensionAPI,
	type NotifyLevel,
} from "../src/objective-gt-stacks.ts";
import type { ExecResult } from "../src/command-runtime.ts";

const ROOT = "/repo";
const COMMAND_NAME = "objective-gt-stacks";
const MESSAGE_TYPE = "objective-gt-stacks-output";

type RegisteredCommand = Parameters<ExtensionAPI["registerCommand"]>[1];

type ExecCall = {
	command: string;
	args: string[];
	options: { cwd?: string; timeout?: number } | undefined;
};

type ScriptedExec = {
	result: Partial<ExecResult> | undefined;
	error?: unknown;
};

type Notification = {
	message: string;
	level: NotifyLevel | undefined;
};

class FakePi implements ExtensionAPI {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly execCalls: ExecCall[] = [];
	readonly sentMessages: Parameters<NonNullable<ExtensionAPI["sendMessage"]>>[0][] = [];
	private readonly script: ScriptedExec[];

	constructor(script: ScriptedExec[] = []) {
		this.script = [...script];
	}

	registerCommand(name: string, options: RegisteredCommand): void {
		this.commands.set(name, options);
	}

	async exec(command: string, args: string[], options?: { cwd?: string; timeout?: number }): Promise<ExecResult> {
		this.execCalls.push({ command, args: [...args], options });
		const expected = this.script.shift();
		if (!expected) {
			return execResult({ code: 99, stderr: `unexpected exec: ${command} ${args.join(" ")}` });
		}
		if (expected.error) {
			throw expected.error;
		}
		return execResult(expected.result);
	}

	sendMessage(message: Parameters<NonNullable<ExtensionAPI["sendMessage"]>>[0]): void {
		this.sentMessages.push(message);
	}
}

function execResult(overrides: Partial<ExecResult> = {}): ExecResult {
	return {
		stdout: overrides.stdout ?? "",
		stderr: overrides.stderr ?? "",
		code: overrides.code ?? 0,
		killed: overrides.killed ?? false,
	};
}

function createContext(): { ctx: CommandContext; notifications: Notification[]; waitForIdleCalls: () => number } {
	const notifications: Notification[] = [];
	let waits = 0;

	const ctx: CommandContext = {
		cwd: ROOT,
		hasUI: true,
		ui: {
			notify(message: string, level?: NotifyLevel): void {
				notifications.push({ message, level });
			},
			setStatus(): void {},
		},
		async waitForIdle(): Promise<void> {
			waits += 1;
		},
	};

	return { ctx, notifications, waitForIdleCalls: () => waits };
}

async function run(args: string, script: ScriptedExec[] = []): Promise<{
	pi: FakePi;
	notifications: Notification[];
	waitForIdleCalls: () => number;
}> {
	const pi = new FakePi(script);
	objectiveGtStacksExtension(pi);
	const command = pi.commands.get(COMMAND_NAME);
	expect(command).toBeDefined();
	if (!command) {
		throw new Error(`${COMMAND_NAME} was not registered`);
	}

	const context = createContext();
	await command.handler(args, context.ctx);
	return { pi, notifications: context.notifications, waitForIdleCalls: context.waitForIdleCalls };
}

function completionValues(prefix: string): string[] {
	return completeObjectiveGtStacksArgs(prefix)?.map((item) => item.value) ?? [];
}

describe("objective-gt-stacks registration", () => {
	test("registers the wrapper command", () => {
		const pi = new FakePi();

		objectiveGtStacksExtension(pi);

		expect(pi.commands.has(COMMAND_NAME)).toBe(true);
	});

	test("completions advertise only --help and -h", () => {
		expect(completionValues("")).toEqual(["--help", "-h"]);
		expect(completionValues("-")).toEqual(["--help", "-h"]);
		expect(completionValues("--h")).toEqual(["--help"]);
		expect(completionValues("--format")).toEqual([]);
		expect(completionValues("--json")).toEqual([]);
	});
});

describe("objective-gt-stacks argument policy", () => {
	test("accepts no arguments", () => {
		expect(parseObjectiveGtStacksArgs("")).toEqual({ help: false });
	});

	test("accepts --help and -h", () => {
		expect(parseObjectiveGtStacksArgs("--help")).toEqual({ help: true });
		expect(parseObjectiveGtStacksArgs("-h")).toEqual({ help: true });
	});

	test("rejects --format and --format=value", () => {
		expect(() => parseObjectiveGtStacksArgs("--format json")).toThrow(/--format is controlled/);
		expect(() => parseObjectiveGtStacksArgs("--format=json")).toThrow(/--format is controlled/);
	});

	test("rejects --json-schema and --json-schema=value", () => {
		expect(() => parseObjectiveGtStacksArgs("--json-schema")).toThrow(/--json-schema is not supported/);
		expect(() => parseObjectiveGtStacksArgs("--json-schema=true")).toThrow(/--json-schema is not supported/);
	});

	test("rejects unknown flags", () => {
		expect(() => parseObjectiveGtStacksArgs("--names")).toThrow(/Unsupported \/objective-gt-stacks argument/);
		expect(() => parseObjectiveGtStacksArgs("-x")).toThrow(/Unsupported \/objective-gt-stacks argument/);
	});

	test("rejects positional arguments", () => {
		expect(() => parseObjectiveGtStacksArgs("alpha")).toThrow(/takes no positional arguments/);
	});

	test("rejected invocation does not run objective gt stacks and reports status rejected", async () => {
		const result = await run("--format json");

		expect(result.pi.execCalls).toEqual([]);
		expect(result.pi.sentMessages).toHaveLength(1);
		const message = result.pi.sentMessages[0];
		expect(message?.customType).toBe(MESSAGE_TYPE);
		expect(message?.details).toMatchObject({ status: "rejected", command: COMMAND_NAME, cwd: ROOT });
		expect(String(message?.content)).toContain("--format is controlled");
		expect(String(message?.content)).toContain("Usage: /objective-gt-stacks [--help]");
	});

	test("positional rejection includes the usage banner and reports rejected", async () => {
		const result = await run("alpha extra");

		expect(result.pi.execCalls).toEqual([]);
		expect(result.pi.sentMessages[0]?.details).toMatchObject({ status: "rejected", args: ["alpha", "extra"] });
		expect(String(result.pi.sentMessages[0]?.content)).toContain("takes no positional arguments");
	});
});

describe("objective-gt-stacks execution", () => {
	test("default action runs objective gt stacks in markdown after waiting for idle", async () => {
		const result = await run("", [{ result: { stdout: "# Objective stacks\n" } }]);

		expect(result.waitForIdleCalls()).toBe(1);
		expect(result.pi.execCalls[0]).toEqual({
			command: "objective",
			args: ["gt", "stacks", "--format", "markdown"],
			options: { cwd: ROOT, timeout: 30_000 },
		});
		const message = result.pi.sentMessages[0];
		expect(message?.customType).toBe(MESSAGE_TYPE);
		expect(message?.content).toBe("# Objective stacks");
		expect(message?.details).toMatchObject({ status: "success", code: 0, killed: false });
	});

	test("--help runs objective gt stacks --help", async () => {
		const result = await run("--help", [{ result: { stdout: "Usage: objective gt stacks\n" } }]);

		expect(result.pi.execCalls[0]).toEqual({
			command: "objective",
			args: ["gt", "stacks", "--help"],
			options: { cwd: ROOT, timeout: 30_000 },
		});
		expect(result.pi.sentMessages[0]?.content).toBe("Usage: objective gt stacks");
	});

	test("success falls back to stderr when stdout is empty", async () => {
		const result = await run("", [{ result: { stdout: "", stderr: "note on stderr\n" } }]);

		expect(result.pi.sentMessages[0]?.content).toBe("note on stderr");
	});

	test("success shows (empty) when both streams are empty", async () => {
		const result = await run("", [{ result: { stdout: "", stderr: "" } }]);

		expect(result.pi.sentMessages[0]?.content).toBe("(empty)");
	});

	test("success details carry stream byte and char sizes", async () => {
		const result = await run("", [{ result: { stdout: "héllo", stderr: "x" } }]);

		expect(result.pi.sentMessages[0]?.details).toMatchObject({
			status: "success",
			stdoutChars: 5,
			stdoutBytes: 6,
			stderrChars: 1,
			stderrBytes: 1,
		});
	});

	test("nonzero exit produces a failure message with both streams", async () => {
		const result = await run("", [{ result: { code: 2, stdout: "out", stderr: "boom" } }]);

		const message = result.pi.sentMessages[0];
		expect(message?.details).toMatchObject({ status: "failure", code: 2, killed: false });
		expect(String(message?.content)).toContain("exit code 2");
		expect(String(message?.content)).toContain("out");
		expect(String(message?.content)).toContain("boom");
	});

	test("killed/timed-out result is treated as failure", async () => {
		const result = await run("", [{ result: { code: 1, killed: true, stderr: "timed out" } }]);

		const message = result.pi.sentMessages[0];
		expect(message?.details).toMatchObject({ status: "failure", killed: true });
		expect(String(message?.content)).toContain("process was killed or timed out");
	});

	test("startup failure reports a launch error", async () => {
		const result = await run("", [{ result: undefined, error: new Error("ENOENT: objective not found") }]);

		const message = result.pi.sentMessages[0];
		expect(message?.details).toMatchObject({ status: "failure", command: "objective gt stacks --format markdown" });
		expect(String(message?.content)).toContain("failed before completion");
		expect(String(message?.content)).toContain("ENOENT");
	});

	test("long failure output is truncated to the last 4000 characters", async () => {
		const longStderr = "Z".repeat(5_000);
		const result = await run("", [{ result: { code: 2, stderr: longStderr } }]);

		const content = String(result.pi.sentMessages[0]?.content);
		expect(content).toContain("[Output truncated to the last 4000 characters.]");
		expect(content.length).toBeLessThan(longStderr.length);
	});
});
