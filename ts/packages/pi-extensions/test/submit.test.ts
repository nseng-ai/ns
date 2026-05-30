import { describe, expect, mock, test } from "bun:test";

import type {
	BufferedSubmitCommandResult,
	ExtensionAPI,
	ExtensionCommandContext,
	LoadedPendingWorktreeSnapshotResult,
	NotifyLevel,
	StreamedSubmitCommandResult,
	SubmitCheckpointOperations,
	SubmitCommandRunner,
} from "../src/submit.ts";
import { stripTerminalEscapes } from "../src/terminal-presentation.ts";
import type { PendingWorktreeSnapshot } from "../src/pending-worktree.ts";

mock.module("@earendil-works/pi-ai", () => ({
	async completeSimple(): Promise<never> {
		throw new Error("unexpected model call from submit tests");
	},
}));

const { submitExtensionWithDependencies } = await import("../src/submit.ts");

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

type ContextOptions = {
	cwd?: string;
	hasUI?: boolean;
	confirms?: boolean[];
	checkpoint?: SubmitCheckpointOperations;
};

type StatusUpdate = {
	key: string;
	value: string | undefined;
};

type PreparedMessageResult = Awaited<ReturnType<SubmitCheckpointOperations["prepareMessage"]>>;

type CommitResult = Awaited<ReturnType<SubmitCheckpointOperations["commit"]>>;

class FakePi implements ExtensionAPI {
	readonly commands = new Map<string, RegisteredCommand>();

	registerCommand(name: string, command: RegisteredCommand): void {
		this.commands.set(name, command);
	}

	async exec(command: string, args: string[]): ReturnType<ExtensionAPI["exec"]> {
		return { code: 99, stdout: "", stderr: `unexpected pi.exec: ${commandDisplay(command, args)}` };
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

function createContext(options: ContextOptions = {}): {
	ctx: ExtensionCommandContext;
	notifications: Notification[];
	confirmations: Confirmation[];
	widgets: WidgetUpdate[];
	statuses: StatusUpdate[];
	waitForIdleCalls: () => number;
} {
	const notifications: Notification[] = [];
	const confirmations: Confirmation[] = [];
	const widgets: WidgetUpdate[] = [];
	const statuses: StatusUpdate[] = [];
	const confirmAnswers = [...(options.confirms ?? [true])];
	let waits = 0;

	const ctx: ExtensionCommandContext = {
		cwd: options.cwd ?? ROOT,
		hasUI: options.hasUI ?? true,
		modelRegistry: {
			find(): unknown | undefined {
				return undefined;
			},
			async getApiKeyAndHeaders(): Promise<{ ok: false; error: string }> {
				return { ok: false, error: "unexpected model auth lookup" };
			},
		},
		ui: {
			notify(message: string, level?: NotifyLevel): void {
				notifications.push({ message, level });
			},
			async confirm(title: string, message: string): Promise<boolean> {
				confirmations.push({ title, message });
				return confirmAnswers.shift() ?? false;
			},
			setStatus(key: string, value: string | undefined): void {
				statuses.push({ key, value });
			},
			setWidget(key: string, value: WidgetContent, widgetOptions?: WidgetOptions): void {
				widgets.push({ key, value, options: widgetOptions });
			},
		},
		async waitForIdle(): Promise<void> {
			waits += 1;
		},
	};

	return { ctx, notifications, confirmations, widgets, statuses, waitForIdleCalls: () => waits };
}

async function runSubmit(
	script: ScriptedStep[],
	contextOptions: ContextOptions = {},
): Promise<{
	pi: FakePi;
	runner: ScriptedSubmitRunner;
	notifications: Notification[];
	confirmations: Confirmation[];
	widgets: WidgetUpdate[];
	statuses: StatusUpdate[];
	waitForIdleCalls: () => number;
}> {
	const pi = new FakePi();
	const runner = new ScriptedSubmitRunner(script);
	const dependencies = contextOptions.checkpoint ? { runner, checkpoint: contextOptions.checkpoint } : { runner };
	submitExtensionWithDependencies(pi, dependencies);
	const command = pi.commands.get("dev:submit");
	expect(command).toBeDefined();
	const context = createContext(contextOptions);
	await command?.handler("", context.ctx);
	return { pi, runner, ...context };
}

const CHECKPOINT_MESSAGE = `[cp] Update submit recovery

- Add no-PR checkpoint prompt
- Retry submit after checkpoint`;

function createCheckpointOperations(
	options: {
		snapshot?: Partial<PendingWorktreeSnapshot>;
		snapshotResult?: LoadedPendingWorktreeSnapshotResult;
		prepared?: PreparedMessageResult;
		commit?: CommitResult;
	} = {},
): {
	operations: SubmitCheckpointOperations;
	calls: {
		load: ExtensionCommandContext[];
		prepare: Array<Pick<PendingWorktreeSnapshot, "status" | "diff">>;
		commit: string[];
	};
} {
	const calls = {
		load: [] as ExtensionCommandContext[],
		prepare: [] as Array<Pick<PendingWorktreeSnapshot, "status" | "diff">>,
		commit: [] as string[],
	};
	const operations: SubmitCheckpointOperations = {
		async loadSnapshot(ctx: ExtensionCommandContext): Promise<LoadedPendingWorktreeSnapshotResult> {
			calls.load.push(ctx);
			return options.snapshotResult ?? { ok: true, snapshot: pendingSnapshot(options.snapshot) };
		},
		async prepareMessage(
			_ctx: ExtensionCommandContext,
			snapshot: Pick<PendingWorktreeSnapshot, "status" | "diff">,
		): Promise<PreparedMessageResult> {
			calls.prepare.push(snapshot);
			return options.prepared ?? { ok: true, message: CHECKPOINT_MESSAGE, source: "model" };
		},
		async commit(_ctx: ExtensionCommandContext, message: string): Promise<CommitResult> {
			calls.commit.push(message);
			return options.commit ?? { summary: "abc123 [cp] Update submit recovery" };
		},
	};
	return { operations, calls };
}

function pendingSnapshot(overrides: Partial<PendingWorktreeSnapshot> = {}): PendingWorktreeSnapshot {
	const status = overrides.status ?? " M src/submit.ts\n";
	return {
		root: overrides.root ?? ROOT,
		branch: overrides.branch ?? "feature",
		status,
		diff: overrides.diff ?? "diff --git a/src/submit.ts b/src/submit.ts\n",
		clean: overrides.clean ?? status.trim().length === 0,
	};
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
	test("registers /dev:submit, waits for idle, and clears the output widget before work", async () => {
		const { pi, runner, widgets, waitForIdleCalls } = await runSubmit([
			buffered("gt", DRY_RUN_ARGS),
			streaming("gt", SUBMIT_ARGS, { stdout: "submitted\n" }),
			buffered("gt", CURRENT_PR_ARGS),
		]);

		runner.assertDone();
		expect([...pi.commands.keys()]).toEqual(["dev:submit"]);
		expect(pi.commands.has("submit")).toBe(false);
		expect(pi.commands.get("dev:submit")?.description).toBe("Submit the current Graphite stack with gt submit -nps --ai");
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
				message: "Submission cancelled. Run `gt restack` when ready, then /dev:submit again.",
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

	test("no PR with dirty worktree previews checkpoint, commits on confirmation, and retries once", async () => {
		const checkpoint = createCheckpointOperations();
		const { runner, notifications, confirmations } = await runSubmit(
			[
				buffered("gt", DRY_RUN_ARGS),
				streaming("gt", SUBMIT_ARGS, { stdout: "submit succeeded\n" }),
				buffered("gt", CURRENT_PR_ARGS, { code: 1, stderr: "No PR found for current branch\n" }),
				buffered("gt", DRY_RUN_ARGS),
				streaming("gt", SUBMIT_ARGS, { stdout: "Submitted https://github.com/acme/widgets/pull/126\n" }),
				buffered("gt", CURRENT_PR_ARGS),
			],
			{ confirms: [true], checkpoint: checkpoint.operations },
		);

		runner.assertDone();
		expect(callDisplays(runner.calls)).toEqual([
			"buffered gt submit -nps --ai --dry-run",
			"streaming gt submit -nps --ai",
			"buffered gt pr",
			"buffered gt submit -nps --ai --dry-run",
			"streaming gt submit -nps --ai",
			"buffered gt pr",
		]);
		expect(checkpoint.calls.load).toHaveLength(1);
		expect(checkpoint.calls.prepare).toEqual([{ status: " M src/submit.ts\n", diff: "diff --git a/src/submit.ts b/src/submit.ts\n" }]);
		expect(checkpoint.calls.commit).toEqual([CHECKPOINT_MESSAGE]);
		expect(confirmations).toHaveLength(1);
		expect(confirmations[0]?.title).toBe("Checkpoint pending changes?");
		expect(confirmations[0]?.message).toContain("Graphite still reports no PR");
		expect(confirmations[0]?.message).toContain("stage and commit all outstanding changes");
		expect(confirmations[0]?.message).toContain(CHECKPOINT_MESSAGE);
		expect(notifications.map((notification) => stripTerminalEscapes(notification.message))).toEqual([
			"Checkpoint created: abc123 [cp] Update submit recovery; retrying submit…",
			"gt submit succeeded: #126",
		]);
	});

	test("no PR with dirty worktree does not commit or retry when user declines", async () => {
		const checkpoint = createCheckpointOperations();
		const { runner, notifications, confirmations, widgets } = await runSubmit(
			[
				buffered("gt", DRY_RUN_ARGS),
				streaming("gt", SUBMIT_ARGS, { stdout: "submit succeeded\n" }),
				buffered("gt", CURRENT_PR_ARGS, { code: 1, stderr: "No PR found for current branch\n" }),
			],
			{ confirms: [false], checkpoint: checkpoint.operations },
		);

		runner.assertDone();
		expect(callDisplays(runner.calls)).toEqual([
			"buffered gt submit -nps --ai --dry-run",
			"streaming gt submit -nps --ai",
			"buffered gt pr",
		]);
		expect(confirmations[0]?.message).toContain(CHECKPOINT_MESSAGE);
		expect(checkpoint.calls.commit).toEqual([]);
		expect(notifications).toEqual([
			{
				message: "Submission cancelled. Pending changes were not checkpointed; run /dev:cp or /dev:submit again when ready.",
				level: "warning",
			},
		]);
		const widgetText = arrayWidgetText(widgets);
		expect(widgetText).toContain("current branch still has no PR");
		expect(widgetText).toContain(CHECKPOINT_MESSAGE);
	});

	test("no PR with clean worktree keeps the original failure visible", async () => {
		const checkpoint = createCheckpointOperations({ snapshot: { status: "", diff: "", clean: true } });
		const { runner, notifications, widgets } = await runSubmit(
			[
				buffered("gt", DRY_RUN_ARGS),
				streaming("gt", SUBMIT_ARGS, { stdout: "submit succeeded\n" }),
				buffered("gt", CURRENT_PR_ARGS, { code: 1, stderr: "No PR found for current branch\n" }),
			],
			{ checkpoint: checkpoint.operations },
		);

		runner.assertDone();
		expect(checkpoint.calls.load).toHaveLength(1);
		expect(checkpoint.calls.prepare).toEqual([]);
		expect(checkpoint.calls.commit).toEqual([]);
		expect(notifications[0]?.level).toBe("error");
		expect(notifications[0]?.message).toContain("current branch still has no PR");
		expect(notifications[0]?.message).toContain("Working tree is clean");
		expect(arrayWidgetText(widgets)).toContain("$ gt pr (exit code 1)");
	});

	test("no PR on trunk refuses checkpoint recovery", async () => {
		const checkpoint = createCheckpointOperations({ snapshot: { branch: "main" } });
		const { runner, notifications } = await runSubmit(
			[
				buffered("gt", DRY_RUN_ARGS),
				streaming("gt", SUBMIT_ARGS, { stdout: "submit succeeded\n" }),
				buffered("gt", CURRENT_PR_ARGS, { code: 1, stderr: "No PR found for current branch\n" }),
			],
			{ checkpoint: checkpoint.operations },
		);

		runner.assertDone();
		expect(checkpoint.calls.prepare).toEqual([]);
		expect(checkpoint.calls.commit).toEqual([]);
		expect(notifications[0]?.level).toBe("error");
		expect(notifications[0]?.message).toContain("Refusing to create checkpoint commit on trunk branch: main");
	});

	test("no PR in non-UI mode suggests /dev:cp and does not inspect or mutate", async () => {
		const checkpoint = createCheckpointOperations();
		const { result, errors } = await captureConsole(() =>
			runSubmit(
				[
					buffered("gt", DRY_RUN_ARGS),
					streaming("gt", SUBMIT_ARGS, { stdout: "submit succeeded\n" }),
					buffered("gt", CURRENT_PR_ARGS, { code: 1, stderr: "No PR found for current branch\n" }),
				],
				{ hasUI: false, checkpoint: checkpoint.operations },
			),
		);

		result.runner.assertDone();
		expect(result.confirmations).toEqual([]);
		expect(checkpoint.calls.load).toEqual([]);
		expect(checkpoint.calls.commit).toEqual([]);
		expect(errors.join("\n")).toContain("Run /dev:cp to checkpoint outstanding changes, then run /dev:submit again.");
		expect(result.notifications[0]?.level).toBe("error");
	});

	test("checkpoint message preparation failure preserves Graphite evidence and does not retry", async () => {
		const checkpoint = createCheckpointOperations({ prepared: { ok: false, error: "model unavailable" } });
		const { runner, notifications, widgets } = await runSubmit(
			[
				buffered("gt", DRY_RUN_ARGS),
				streaming("gt", SUBMIT_ARGS, { stdout: "submit succeeded\n" }),
				buffered("gt", CURRENT_PR_ARGS, { code: 1, stderr: "No PR found for current branch\n" }),
			],
			{ checkpoint: checkpoint.operations },
		);

		runner.assertDone();
		expect(checkpoint.calls.prepare).toHaveLength(1);
		expect(checkpoint.calls.commit).toEqual([]);
		expect(callDisplays(runner.calls)).toEqual([
			"buffered gt submit -nps --ai --dry-run",
			"streaming gt submit -nps --ai",
			"buffered gt pr",
		]);
		expect(notifications[0]?.level).toBe("error");
		expect(notifications[0]?.message).toContain("model unavailable");
		expect(notifications[0]?.message).toContain("current branch still has no PR");
		expect(arrayWidgetText(widgets)).toContain("$ gt pr (exit code 1)");
	});

	test("checkpoint commit failure preserves Graphite evidence and does not retry", async () => {
		const checkpoint = createCheckpointOperations({ commit: { error: "Checkpoint commit failed.\nexit 1: hook failed" } });
		const { runner, notifications, widgets } = await runSubmit(
			[
				buffered("gt", DRY_RUN_ARGS),
				streaming("gt", SUBMIT_ARGS, { stdout: "submit succeeded\n" }),
				buffered("gt", CURRENT_PR_ARGS, { code: 1, stderr: "No PR found for current branch\n" }),
			],
			{ confirms: [true], checkpoint: checkpoint.operations },
		);

		runner.assertDone();
		expect(checkpoint.calls.commit).toEqual([CHECKPOINT_MESSAGE]);
		expect(callDisplays(runner.calls)).toEqual([
			"buffered gt submit -nps --ai --dry-run",
			"streaming gt submit -nps --ai",
			"buffered gt pr",
		]);
		expect(notifications[0]?.level).toBe("error");
		expect(notifications[0]?.message).toContain("hook failed");
		expect(notifications[0]?.message).toContain("current branch still has no PR");
		expect(arrayWidgetText(widgets)).toContain("$ gt pr (exit code 1)");
	});

	test("retry still having no PR displays normal failure without prompting again", async () => {
		const checkpoint = createCheckpointOperations();
		const { runner, notifications, confirmations, widgets } = await runSubmit(
			[
				buffered("gt", DRY_RUN_ARGS),
				streaming("gt", SUBMIT_ARGS, { stdout: "first submit\n" }),
				buffered("gt", CURRENT_PR_ARGS, { code: 1, stderr: "No PR found for current branch\n" }),
				buffered("gt", DRY_RUN_ARGS),
				streaming("gt", SUBMIT_ARGS, { stdout: "second submit\n" }),
				buffered("gt", CURRENT_PR_ARGS, { code: 1, stderr: "No PR found for current branch\n" }),
			],
			{ confirms: [true], checkpoint: checkpoint.operations },
		);

		runner.assertDone();
		expect(confirmations).toHaveLength(1);
		expect(checkpoint.calls.load).toHaveLength(1);
		expect(checkpoint.calls.commit).toEqual([CHECKPOINT_MESSAGE]);
		expect(notifications.map((notification) => notification.level)).toEqual(["info", "error"]);
		expect(notifications.at(-1)?.message).toContain("current branch still has no PR");
		expect(notifications.at(-1)?.message).toContain("second submit");
		expect(arrayWidgetText(widgets)).toContain("$ gt pr (exit code 1)");
	});

	test("non-no-PR current PR verification failure remains hard without checkpoint prompt", async () => {
		const checkpoint = createCheckpointOperations();
		const { runner, notifications, confirmations } = await runSubmit(
			[
				buffered("gt", DRY_RUN_ARGS),
				streaming("gt", SUBMIT_ARGS, { stdout: "submit succeeded\n" }),
				buffered("gt", CURRENT_PR_ARGS, { code: 2, stderr: "Graphite auth failed\n" }),
			],
			{ checkpoint: checkpoint.operations },
		);

		runner.assertDone();
		expect(confirmations).toEqual([]);
		expect(checkpoint.calls.load).toEqual([]);
		expect(checkpoint.calls.commit).toEqual([]);
		expect(notifications[0]?.level).toBe("error");
		expect(notifications[0]?.message).toContain("current PR verification failed with exit code 2");
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
