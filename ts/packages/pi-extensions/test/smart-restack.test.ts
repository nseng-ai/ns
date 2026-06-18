import { describe, expect, test } from "vitest";

import smartRestackExtension, { SMART_RESTACK_COMMAND_NAME, runSmartRestack, type SmartRestackExtensionAPI } from "../src/smart-restack.ts";

const TEST_CWD = process.cwd();

interface ExecCall {
	command: string;
	args: string[];
	cwd?: string;
}

interface FakeCommandContext {
	cwd: string;
	hasUI?: boolean;
	ui: {
		notifications: { message: string; level: "info" | "warning" | "error" | undefined }[];
		notify(message: string, level?: "info" | "warning" | "error"): void;
		select?: (title: string, options: string[]) => Promise<string | undefined> | string | undefined;
	};
	waitForIdle?(): Promise<void>;
}

class FakePi implements SmartRestackExtensionAPI {
	readonly commands = new Map<string, { description?: string; handler(args: string, ctx: FakeCommandContext): Promise<void> | void }>();
	readonly execCalls: ExecCall[] = [];
	readonly sentMessages: string[] = [];
	private readonly execResults: { stdout: string; stderr: string; code: number; killed: boolean; startupError?: string }[];

	constructor(execResults: { stdout?: string; stderr?: string; code: number; killed?: boolean; startupError?: string }[] = []) {
		this.execResults = execResults.map((result) => ({
			stdout: result.stdout ?? "",
			stderr: result.stderr ?? "",
			code: result.code,
			killed: result.killed ?? false,
			...(result.startupError === undefined ? {} : { startupError: result.startupError }),
		}));
	}

	registerCommand(name: string, options: { description?: string; handler(args: string, ctx: FakeCommandContext): Promise<void> | void }): void {
		this.commands.set(name, options);
	}

	async exec(command: string, args: string[], options?: { cwd?: string }): Promise<{ stdout: string; stderr: string; code: number; killed: boolean; startupError?: string }> {
		this.execCalls.push(options?.cwd === undefined ? { command, args } : { command, args, cwd: options.cwd });
		const result = this.execResults.shift();
		if (result === undefined) throw new Error(`unexpected exec: ${command} ${args.join(" ")}`);
		return result;
	}

	async sendUserMessage(content: string): Promise<void> {
		this.sentMessages.push(content);
	}
}

function fakeCtx(options: { selection?: string; hasUI?: boolean } = {}): FakeCommandContext {
	return {
		cwd: TEST_CWD,
		...(options.hasUI === undefined ? {} : { hasUI: options.hasUI }),
		ui: {
			notifications: [],
			notify(message, level) {
				this.notifications.push({ message, level });
			},
			...(options.selection === undefined ? {} : { select: async () => options.selection }),
		},
	};
}

describe("smart restack extension", () => {
	test("registers code:gt-restack-resolve command", () => {
		const pi = new FakePi();
		smartRestackExtension(pi);

		expect([...pi.commands.keys()]).toEqual([SMART_RESTACK_COMMAND_NAME]);
		expect(SMART_RESTACK_COMMAND_NAME).toBe("code:gt-restack-resolve");
		expect(pi.commands.get(SMART_RESTACK_COMMAND_NAME)?.description).toContain("gt restack");
	});

	test("stops without LM when gt restack succeeds", async () => {
		const pi = new FakePi([
			{ code: 0, stdout: "On branch main\nnothing to commit\n" },
			{ code: 0, stdout: "Already up to date\n" },
		]);
		const ctx = fakeCtx();

		await runSmartRestack(pi, ctx, "");

		expect(pi.execCalls).toEqual([
			{ command: "git", args: ["status"], cwd: TEST_CWD },
			{ command: "gt", args: ["restack"], cwd: TEST_CWD },
		]);
		expect(pi.sentMessages).toEqual([]);
		expect(ctx.ui.notifications.at(-1)?.message).toContain("No LM turn was started");
	});

	test("starts LM resolver after explicit selection when gt restack fails", async () => {
		const pi = new FakePi([
			{ code: 0, stdout: "On branch main\nnothing to commit\n" },
			{ code: 1, stderr: "CONFLICT (content): Merge conflict\n" },
		]);
		const ctx = fakeCtx({ selection: "Start LM resolver" });

		await runSmartRestack(pi, ctx, "prefer parent stack");

		expect(pi.execCalls).toEqual([
			{ command: "git", args: ["status"], cwd: TEST_CWD },
			{ command: "gt", args: ["restack"], cwd: TEST_CWD },
		]);
		expect(pi.sentMessages).toHaveLength(1);
		expect(pi.sentMessages[0]).toContain("code-gt-restack-resolve");
		expect(pi.sentMessages[0]).toContain("A deterministic /code:gt-restack-resolve fast path already ran `gt restack`");
		expect(pi.sentMessages[0]).toContain("prefer parent stack");
	});

	test("starts LM resolver immediately when rebase is already in progress", async () => {
		const pi = new FakePi([{ code: 0, stdout: "interactive rebase in progress; onto abc123\nYou are currently rebasing branch 'feature' on 'abc123'.\n" }]);
		const ctx = fakeCtx();

		await runSmartRestack(pi, ctx, "continue carefully");

		expect(pi.execCalls).toEqual([{ command: "git", args: ["status"], cwd: TEST_CWD }]);
		expect(pi.sentMessages).toHaveLength(1);
		expect(pi.sentMessages[0]).toContain("A Graphite restack/rebase is already in progress");
		expect(pi.sentMessages[0]).toContain("continue carefully");
	});

	test("aborts rebase only when user explicitly selects abort", async () => {
		const pi = new FakePi([
			{ code: 0, stdout: "On branch main\nnothing to commit\n" },
			{ code: 1, stderr: "CONFLICT (content): Merge conflict\n" },
			{ code: 0, stdout: "" },
		]);
		const ctx = fakeCtx({ selection: "Abort rebase" });

		await runSmartRestack(pi, ctx, "");

		expect(pi.execCalls).toEqual([
			{ command: "git", args: ["status"], cwd: TEST_CWD },
			{ command: "gt", args: ["restack"], cwd: TEST_CWD },
			{ command: "git", args: ["rebase", "--abort"], cwd: TEST_CWD },
		]);
		expect(pi.sentMessages).toEqual([]);
		expect(ctx.ui.notifications.at(-1)?.message).toContain("Rebase aborted");
	});

	test("leaves rebase stopped when user selects manual handling", async () => {
		const pi = new FakePi([
			{ code: 0, stdout: "On branch main\nnothing to commit\n" },
			{ code: 1, stderr: "CONFLICT (content): Merge conflict\n" },
		]);
		const ctx = fakeCtx({ selection: "Leave rebase stopped" });

		await runSmartRestack(pi, ctx, "");

		expect(pi.execCalls).toEqual([
			{ command: "git", args: ["status"], cwd: TEST_CWD },
			{ command: "gt", args: ["restack"], cwd: TEST_CWD },
		]);
		expect(pi.sentMessages).toEqual([]);
		expect(ctx.ui.notifications.at(-1)?.message).toContain("Rebase left stopped");
	});

	test("does not start LM or abort without selection UI", async () => {
		const pi = new FakePi([
			{ code: 0, stdout: "On branch main\nnothing to commit\n" },
			{ code: 1, stderr: "failed\n" },
		]);
		const ctx = fakeCtx({ hasUI: false });

		await runSmartRestack(pi, ctx, "");

		expect(pi.execCalls).toEqual([
			{ command: "git", args: ["status"], cwd: TEST_CWD },
			{ command: "gt", args: ["restack"], cwd: TEST_CWD },
		]);
		expect(pi.sentMessages).toEqual([]);
	});
});
