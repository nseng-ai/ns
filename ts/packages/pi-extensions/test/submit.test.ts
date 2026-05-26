import { describe, expect, test } from "bun:test";

import {
	submitExtensionWithDependencies,
	type BufferedSubmitCommandResult,
	type ExtensionAPI,
	type ExtensionCommandContext,
	type NotifyLevel,
	type StreamedSubmitCommandResult,
	type SubmitCommandRunner,
} from "../src/submit.ts";
import { stripTerminalEscapes } from "../src/terminal-presentation.ts";

const ROOT = "/repo";
const SUBMIT_ARGS = ["submit", "-nps", "--ai"];
const DRY_RUN_ARGS = ["submit", "-nps", "--ai", "--dry-run"];
const RESTACK_ARGS = ["restack", "--no-interactive"];
const CURRENT_PR_ARGS = ["pr"];
const GIT_UNMERGED_ARGS = ["diff", "--name-only", "--diff-filter=U"];
const GIT_STATUS_PORCELAIN_ARGS = ["status", "--porcelain"];

type RegisteredCommand = Parameters<ExtensionAPI["registerCommand"]>[1];
type WidgetContent = Parameters<ExtensionCommandContext["ui"]["setWidget"]>[1];
type WidgetOptions = Parameters<ExtensionCommandContext["ui"]["setWidget"]>[2];

type Notification = {
	message: string;
	level: NotifyLevel | undefined;
};

type Confirmation = {
	title: string;
	message: string;
};

type WidgetUpdate = {
	key: string;
	value: WidgetContent;
	options: WidgetOptions;
};

type BufferedStep = {
	kind: "buffered";
	command: string;
	args: string[];
	result: Partial<BufferedSubmitCommandResult> | undefined;
};

type StreamingStep = {
	kind: "streaming";
	command: string;
	args: string[];
	stdoutChunks: string[];
	stderrChunks: string[];
	result: Partial<StreamedSubmitCommandResult> | undefined;
};

type ScriptedStep = BufferedStep | StreamingStep;

type RunnerCall = {
	kind: "buffered" | "streaming";
	command: string;
	args: string[];
	options: { cwd: string; timeoutMs: number };
};

class FakePi implements ExtensionAPI {
	readonly commands = new Map<string, RegisteredCommand>();

	registerCommand(name: string, command: RegisteredCommand): void {
		this.commands.set(name, command);
	}
}

class ScriptedSubmitRunner implements SubmitCommandRunner {
	readonly calls: RunnerCall[] = [];
	readonly errors: string[] = [];
	private readonly script: ScriptedStep[];

	constructor(script: ScriptedStep[]) {
		this.script = [...script];
	}

	async runBuffered(
		command: string,
		args: readonly string[],
		options: { cwd: string; timeoutMs: number },
	): Promise<BufferedSubmitCommandResult> {
		this.calls.push({ kind: "buffered", command, args: [...args], options });
		const expected = this.script.shift();
		if (!expected) {
			return this.unexpectedBuffered(`unexpected buffered command: ${commandDisplay(command, args)}`);
		}
		if (expected.kind !== "buffered") {
			return this.unexpectedBuffered(`expected streaming ${commandDisplay(expected.command, expected.args)}, got buffered ${commandDisplay(command, args)}`);
		}
		if (expected.command !== command || !sameArgs(expected.args, args)) {
			return this.unexpectedBuffered(`expected ${commandDisplay(expected.command, expected.args)}, got ${commandDisplay(command, args)}`);
		}
		return bufferedResult(expected.result);
	}

	async runStreaming(
		command: string,
		args: readonly string[],
		options: {
			cwd: string;
			timeoutMs: number;
			onStdout(chunk: string): void;
			onStderr(chunk: string): void;
			onTimedOut?(): void;
		},
	): Promise<StreamedSubmitCommandResult> {
		this.calls.push({ kind: "streaming", command, args: [...args], options: { cwd: options.cwd, timeoutMs: options.timeoutMs } });
		const expected = this.script.shift();
		if (!expected) {
			return this.unexpectedStreaming(`unexpected streaming command: ${commandDisplay(command, args)}`);
		}
		if (expected.kind !== "streaming") {
			return this.unexpectedStreaming(`expected buffered ${commandDisplay(expected.command, expected.args)}, got streaming ${commandDisplay(command, args)}`);
		}
		if (expected.command !== command || !sameArgs(expected.args, args)) {
			return this.unexpectedStreaming(`expected ${commandDisplay(expected.command, expected.args)}, got ${commandDisplay(command, args)}`);
		}

		const result = streamedResult(expected.result);
		if (result.killed) {
			options.onTimedOut?.();
		}
		for (const chunk of expected.stdoutChunks) {
			options.onStdout(chunk);
		}
		for (const chunk of expected.stderrChunks) {
			options.onStderr(chunk);
		}
		return result;
	}

	assertDone(): void {
		expect(this.errors).toEqual([]);
		expect(this.script).toEqual([]);
	}

	private unexpectedBuffered(message: string): BufferedSubmitCommandResult {
		this.errors.push(message);
		return bufferedResult({ code: 99, stderr: message });
	}

	private unexpectedStreaming(message: string): StreamedSubmitCommandResult {
		this.errors.push(message);
		return streamedResult({ code: 99, startupError: message });
	}
}

function createContext(options: { cwd?: string; hasUI?: boolean; confirms?: boolean[] } = {}): {
	ctx: ExtensionCommandContext;
	notifications: Notification[];
	confirmations: Confirmation[];
	widgets: WidgetUpdate[];
	waitForIdleCalls: () => number;
} {
	const notifications: Notification[] = [];
	const confirmations: Confirmation[] = [];
	const widgets: WidgetUpdate[] = [];
	const confirmAnswers = [...(options.confirms ?? [true])];
	let waits = 0;

	const ctx: ExtensionCommandContext = {
		cwd: options.cwd ?? ROOT,
		hasUI: options.hasUI ?? true,
		ui: {
			notify(message: string, level?: NotifyLevel): void {
				notifications.push({ message, level });
			},
			async confirm(title: string, message: string): Promise<boolean> {
				confirmations.push({ title, message });
				return confirmAnswers.shift() ?? false;
			},
			setWidget(key: string, value: WidgetContent, widgetOptions?: WidgetOptions): void {
				widgets.push({ key, value, options: widgetOptions });
			},
		},
		async waitForIdle(): Promise<void> {
			waits += 1;
		},
	};

	return { ctx, notifications, confirmations, widgets, waitForIdleCalls: () => waits };
}

async function runSubmit(
	script: ScriptedStep[],
	contextOptions: { cwd?: string; hasUI?: boolean; confirms?: boolean[] } = {},
): Promise<{
	pi: FakePi;
	runner: ScriptedSubmitRunner;
	notifications: Notification[];
	confirmations: Confirmation[];
	widgets: WidgetUpdate[];
	waitForIdleCalls: () => number;
}> {
	const pi = new FakePi();
	const runner = new ScriptedSubmitRunner(script);
	submitExtensionWithDependencies(pi, { runner });
	const command = pi.commands.get("submit");
	expect(command).toBeDefined();
	const context = createContext(contextOptions);
	await command?.handler("", context.ctx);
	return { pi, runner, ...context };
}

function buffered(command: string, args: string[], result?: Partial<BufferedSubmitCommandResult>): BufferedStep {
	return { kind: "buffered", command, args, result };
}

function streaming(
	command: string,
	args: string[],
	options: { stdout?: string | string[]; stderr?: string | string[]; result?: Partial<StreamedSubmitCommandResult> } = {},
): StreamingStep {
	return {
		kind: "streaming",
		command,
		args,
		stdoutChunks: chunks(options.stdout),
		stderrChunks: chunks(options.stderr),
		result: options.result,
	};
}

function chunks(value: string | string[] | undefined): string[] {
	if (value === undefined) return [];
	return Array.isArray(value) ? value : [value];
}

function bufferedResult(overrides: Partial<BufferedSubmitCommandResult> = {}): BufferedSubmitCommandResult {
	return {
		stdout: overrides.stdout ?? "",
		stderr: overrides.stderr ?? "",
		code: overrides.code ?? 0,
		killed: overrides.killed ?? false,
		startupError: overrides.startupError,
	};
}

function streamedResult(overrides: Partial<StreamedSubmitCommandResult> = {}): StreamedSubmitCommandResult {
	return {
		code: overrides.code ?? 0,
		killed: overrides.killed ?? false,
		startupError: overrides.startupError,
	};
}

function sameArgs(left: readonly string[], right: readonly string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

function commandDisplay(command: string, args: readonly string[]): string {
	return [command, ...args].join(" ");
}

function callDisplays(calls: RunnerCall[]): string[] {
	return calls.map((call) => `${call.kind} ${commandDisplay(call.command, call.args)}`);
}

function arrayWidgetText(widgets: WidgetUpdate[]): string {
	return widgets
		.filter((widget): widget is WidgetUpdate & { value: string[] } => Array.isArray(widget.value))
		.flatMap((widget) => widget.value)
		.join("\n");
}

async function captureConsole<T>(run: () => Promise<T>): Promise<{ result: T; logs: string[]; errors: string[] }> {
	const originalLog = console.log;
	const originalError = console.error;
	const logs: string[] = [];
	const errors: string[] = [];
	console.log = (message?: unknown) => {
		logs.push(String(message ?? ""));
	};
	console.error = (message?: unknown) => {
		errors.push(String(message ?? ""));
	};
	try {
		return { result: await run(), logs, errors };
	} finally {
		console.log = originalLog;
		console.error = originalError;
	}
}

describe("submit extension registration", () => {
	test("registers /submit, waits for idle, and clears the output widget before work", async () => {
		const { pi, runner, widgets, waitForIdleCalls } = await runSubmit([
			buffered("gt", DRY_RUN_ARGS),
			streaming("gt", SUBMIT_ARGS, { stdout: "submitted\n" }),
			buffered("gt", CURRENT_PR_ARGS),
		]);

		runner.assertDone();
		expect(pi.commands.get("submit")?.description).toBe("Submit the current Graphite stack with gt submit -nps --ai");
		expect(waitForIdleCalls()).toBe(1);
		expect(widgets[0]).toEqual({ key: "submit-output", value: undefined, options: undefined });
		expect(widgets.some((widget) => typeof widget.value === "function" && widget.options?.placement === "aboveEditor")).toBe(true);
		expect(callDisplays(runner.calls)).toEqual([
			"buffered gt submit -nps --ai --dry-run",
			"streaming gt submit -nps --ai",
			"buffered gt pr",
		]);
	});
});

describe("submit command scenarios", () => {
	test("happy path reports compact PR labels from Graphite and GitHub URLs", async () => {
		const { runner, notifications } = await runSubmit([
			buffered("gt", DRY_RUN_ARGS),
			streaming("gt", SUBMIT_ARGS, {
				stdout: "Created https://app.graphite.com/github/pr/acme/widgets/123\n",
			}),
			buffered("gt", CURRENT_PR_ARGS, { stdout: "Current PR https://github.com/acme/widgets/pull/124.\n" }),
		]);

		runner.assertDone();
		expect(callDisplays(runner.calls)).toEqual([
			"buffered gt submit -nps --ai --dry-run",
			"streaming gt submit -nps --ai",
			"buffered gt pr",
		]);
		expect(notifications).toHaveLength(1);
		expect(notifications[0]?.level).toBe("info");
		expect(stripTerminalEscapes(notifications[0]?.message ?? "")).toBe("gt submit succeeded: #123, #124");
	});

	test("dry-run failure without restack requirement stops before submit", async () => {
		const { runner, notifications, widgets } = await runSubmit([
			buffered("gt", DRY_RUN_ARGS, { code: 1, stdout: "preflight stdout\n", stderr: "preflight stderr\n" }),
		]);

		runner.assertDone();
		expect(callDisplays(runner.calls)).toEqual(["buffered gt submit -nps --ai --dry-run"]);
		expect(notifications[0]?.level).toBe("error");
		expect(notifications[0]?.message).toContain("gt submit -nps --ai --dry-run failed with exit code 1");
		const widgetText = arrayWidgetText(widgets);
		expect(widgetText).toContain("$ gt submit -nps --ai --dry-run");
		expect(widgetText).toContain("preflight stdout");
		expect(widgetText).toContain("preflight stderr");
	});

	test("restack required with user decline cancels before restack or submit", async () => {
		const { runner, notifications, confirmations } = await runSubmit(
			[buffered("gt", DRY_RUN_ARGS, { code: 1, stderr: "This stack must be restacked before submitting.\n" })],
			{ confirms: [false] },
		);

		runner.assertDone();
		expect(callDisplays(runner.calls)).toEqual(["buffered gt submit -nps --ai --dry-run"]);
		expect(confirmations).toEqual([
			{
				title: "Restack required",
				message: "Graphite says this stack must be restacked before submission. Run `gt restack` now?",
			},
		]);
		expect(notifications).toEqual([
			{
				message: "Submission cancelled. Run `gt restack` when ready, then /submit again.",
				level: "warning",
			},
		]);
	});

	test("restack required with successful restack continues to submit", async () => {
		const { runner, notifications } = await runSubmit(
			[
				buffered("gt", DRY_RUN_ARGS, { code: 1, stderr: "Restack is required before submit.\n" }),
				buffered("gt", RESTACK_ARGS),
				streaming("gt", SUBMIT_ARGS, { stdout: "Submitted https://github.com/acme/widgets/pull/125\n" }),
				buffered("gt", CURRENT_PR_ARGS),
			],
			{ confirms: [true] },
		);

		runner.assertDone();
		expect(callDisplays(runner.calls)).toEqual([
			"buffered gt submit -nps --ai --dry-run",
			"buffered gt restack --no-interactive",
			"streaming gt submit -nps --ai",
			"buffered gt pr",
		]);
		expect(notifications.map((notification) => notification.message)).toContain("Restack succeeded; continuing submit…");
		expect(stripTerminalEscapes(notifications.at(-1)?.message ?? "")).toBe("gt submit succeeded: #125");
	});

	test("restack conflict path checks git conflicts and lists conflicted files", async () => {
		const { runner, notifications, widgets } = await runSubmit(
			[
				buffered("gt", DRY_RUN_ARGS, { code: 1, stderr: "Stack needs to be restacked before submit.\n" }),
				buffered("gt", RESTACK_ARGS, { code: 1, stderr: "CONFLICT (content): Merge conflict\n" }),
				buffered("git", GIT_UNMERGED_ARGS, { stdout: "src/a.ts\n" }),
				buffered("git", GIT_STATUS_PORCELAIN_ARGS, { stdout: "UU src/a.ts\nAA src/b.ts\n" }),
			],
			{ confirms: [true] },
		);

		runner.assertDone();
		expect(callDisplays(runner.calls)).toEqual([
			"buffered gt submit -nps --ai --dry-run",
			"buffered gt restack --no-interactive",
			"buffered git diff --name-only --diff-filter=U",
			"buffered git status --porcelain",
		]);
		expect(notifications[0]?.level).toBe("error");
		const widgetText = arrayWidgetText(widgets);
		expect(widgetText).toContain("`gt restack` hit merge conflicts. Submission was not attempted.");
		expect(widgetText).toContain("Conflicted files:");
		expect(widgetText).toContain("- src/a.ts");
		expect(widgetText).toContain("- src/b.ts");
	});

	test("semantic submit failure still verifies current PR and reports post-submit failure", async () => {
		const { runner, notifications, widgets } = await runSubmit([
			buffered("gt", DRY_RUN_ARGS),
			streaming("gt", SUBMIT_ARGS, {
				stdout: "This branch does not introduce any changes:\nGraphite will not be submitted because GitHub does not allow empty PRs.\n",
			}),
			buffered("gt", CURRENT_PR_ARGS),
		]);

		runner.assertDone();
		expect(callDisplays(runner.calls)).toEqual([
			"buffered gt submit -nps --ai --dry-run",
			"streaming gt submit -nps --ai",
			"buffered gt pr",
		]);
		expect(notifications[0]?.level).toBe("error");
		expect(notifications[0]?.message).toContain("Graphite skipped submitting part of the stack because a branch is empty");
		expect(arrayWidgetText(widgets)).toContain("$ gt pr (exit code 0)");
	});

	test("current PR verification failure explains that the branch still has no PR", async () => {
		const { runner, notifications, widgets } = await runSubmit([
			buffered("gt", DRY_RUN_ARGS),
			streaming("gt", SUBMIT_ARGS, { stdout: "submit succeeded\n" }),
			buffered("gt", CURRENT_PR_ARGS, { code: 1, stderr: "No PR found for current branch\n" }),
		]);

		runner.assertDone();
		expect(notifications[0]?.level).toBe("error");
		expect(notifications[0]?.message).toContain("current branch still has no PR");
		expect(arrayWidgetText(widgets)).toContain("$ gt pr (exit code 1)");
	});

	test("submit startup errors include the startup failure and output sections", async () => {
		const { runner, notifications, widgets } = await runSubmit([
			buffered("gt", DRY_RUN_ARGS),
			streaming("gt", SUBMIT_ARGS, { result: { code: 1, startupError: "spawn gt ENOENT" } }),
		]);

		runner.assertDone();
		expect(notifications[0]?.level).toBe("error");
		expect(notifications[0]?.message).toContain("spawn gt ENOENT");
		const widgetText = arrayWidgetText(widgets);
		expect(widgetText).toContain("$ gt submit -nps --ai");
		expect(widgetText).toContain("----- stdout -----");
		expect(widgetText).toContain("----- stderr -----");
	});

	test("submit timeout/killed results use the timeout failure reason", async () => {
		const { runner, notifications, widgets } = await runSubmit([
			buffered("gt", DRY_RUN_ARGS),
			streaming("gt", SUBMIT_ARGS, { stdout: "still running\n", result: { code: 1, killed: true } }),
		]);

		runner.assertDone();
		expect(notifications[0]?.level).toBe("error");
		expect(notifications[0]?.message).toContain("gt submit timed out and was killed.");
		expect(arrayWidgetText(widgets)).toContain("still running");
	});

	test("success fallback in non-UI mode prints recent output when no PR links are detected", async () => {
		const { result, logs, errors } = await captureConsole(() =>
			runSubmit(
				[
					buffered("gt", DRY_RUN_ARGS),
					streaming("gt", SUBMIT_ARGS, { stdout: "Submitted stack without URLs\n" }),
					buffered("gt", CURRENT_PR_ARGS, { stdout: "Current branch has a PR but output omitted the URL\n" }),
				],
				{ hasUI: false },
			),
		);

		result.runner.assertDone();
		expect(errors).toEqual([]);
		expect(logs.join("\n")).toContain("gt submit succeeded, but no PR URLs were detected in output.");
		expect(logs.join("\n")).toContain("Recent output:");
		expect(logs.join("\n")).toContain("Submitted stack without URLs");
		expect(result.notifications[0]?.message).toBe("gt submit succeeded, but no PR URLs were detected.");
	});
});
