import { describe, expect, test } from "vitest";

import stackSquashExtension, {
	STACK_SQUASH_COMMAND_NAME,
	runStackSquash,
	type StackSquashExtensionAPI,
} from "../src/stack-squash.ts";

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
	};
	waitForIdle?(): Promise<void>;
}

class FakePi implements StackSquashExtensionAPI {
	readonly commands = new Map<
		string,
		{ description?: string; handler(args: string, ctx: FakeCommandContext): Promise<void> | void }
	>();
	readonly execCalls: ExecCall[] = [];
	private readonly execResults: {
		stdout: string;
		stderr: string;
		code: number;
		killed: boolean;
		startupError?: string;
	}[];

	constructor(
		execResults: {
			stdout?: string;
			stderr?: string;
			code: number;
			killed?: boolean;
			startupError?: string;
		}[] = [],
	) {
		this.execResults = execResults.map((result) => ({
			stdout: result.stdout ?? "",
			stderr: result.stderr ?? "",
			code: result.code,
			killed: result.killed ?? false,
			...(result.startupError === undefined ? {} : { startupError: result.startupError }),
		}));
	}

	registerCommand(
		name: string,
		options: {
			description?: string;
			handler(args: string, ctx: FakeCommandContext): Promise<void> | void;
		},
	): void {
		this.commands.set(name, options);
	}

	async exec(
		command: string,
		args: string[],
		options?: { cwd?: string },
	): Promise<{
		stdout: string;
		stderr: string;
		code: number;
		killed: boolean;
		startupError?: string;
	}> {
		this.execCalls.push(
			options?.cwd === undefined ? { command, args } : { command, args, cwd: options.cwd },
		);
		const result = this.execResults.shift();
		if (result === undefined) throw new Error(`unexpected exec: ${command} ${args.join(" ")}`);
		return result;
	}
}

function fakeCtx(options: { hasUI?: boolean } = {}): FakeCommandContext {
	return {
		cwd: TEST_CWD,
		...(options.hasUI === undefined ? {} : { hasUI: options.hasUI }),
		ui: {
			notifications: [],
			notify(message, level) {
				this.notifications.push({ message, level });
			},
		},
	};
}

function success(stdout = ""): { code: number; stdout: string } {
	return { code: 0, stdout };
}

function stackBranches(branches: readonly string[]): { code: number; stdout: string } {
	return { code: 0, stdout: JSON.stringify({ status: "ok", exitCode: 0, data: { branches } }) };
}

const STACK_BRANCHES_ARGS = [
	"slot",
	"gt",
	"exec",
	"stack-branches",
	"--downstack",
	"--format",
	"json",
];

describe("stack squash extension", () => {
	test("registers gt:squash-stack command", () => {
		const pi = new FakePi();
		stackSquashExtension(pi);

		expect([...pi.commands.keys()]).toEqual([STACK_SQUASH_COMMAND_NAME]);
		expect(STACK_SQUASH_COMMAND_NAME).toBe("gt:squash-stack");
		expect(pi.commands.get(STACK_SQUASH_COMMAND_NAME)?.description).toContain("gt squash");
	});

	test("squashes discovered downstack branches from tip to bottom, then restores the tip", async () => {
		const pi = new FakePi([
			success(),
			stackBranches(["feature/bottom", "feature/middle", "feature/top"]),
			success("Switched to feature/top\n"),
			success("Squashed feature/top\n"),
			success("Switched to feature/middle\n"),
			success("Squashed feature/middle\n"),
			success("Switched to feature/bottom\n"),
			success("Squashed feature/bottom\n"),
			success("Switched to feature/top\n"),
		]);
		const ctx = fakeCtx();

		await runStackSquash(pi, ctx);

		expect(pi.execCalls).toEqual([
			{ command: "git", args: ["status", "--porcelain=v1"], cwd: TEST_CWD },
			{ command: "sdl", args: STACK_BRANCHES_ARGS, cwd: TEST_CWD },
			{ command: "gt", args: ["checkout", "feature/top", "--no-interactive"], cwd: TEST_CWD },
			{ command: "gt", args: ["squash", "--no-edit", "--no-interactive"], cwd: TEST_CWD },
			{ command: "gt", args: ["checkout", "feature/middle", "--no-interactive"], cwd: TEST_CWD },
			{ command: "gt", args: ["squash", "--no-edit", "--no-interactive"], cwd: TEST_CWD },
			{ command: "gt", args: ["checkout", "feature/bottom", "--no-interactive"], cwd: TEST_CWD },
			{ command: "gt", args: ["squash", "--no-edit", "--no-interactive"], cwd: TEST_CWD },
			{ command: "gt", args: ["checkout", "feature/top", "--no-interactive"], cwd: TEST_CWD },
		]);
		expect(ctx.ui.notifications.at(-1)).toMatchObject({
			level: "info",
			message: expect.stringContaining("Processed 3 Graphite stack branches"),
		});
		expect(ctx.ui.notifications.at(-1)?.message).toContain("feature/top");
		expect(ctx.ui.notifications.at(-1)?.message).toContain("feature/bottom");
	});

	test("does not start when the worktree is dirty", async () => {
		const pi = new FakePi([{ code: 0, stdout: " M file.ts\n" }]);
		const ctx = fakeCtx();

		await runStackSquash(pi, ctx);

		expect(pi.execCalls).toEqual([
			{ command: "git", args: ["status", "--porcelain=v1"], cwd: TEST_CWD },
		]);
		expect(ctx.ui.notifications.at(-1)).toMatchObject({
			level: "error",
			message: expect.stringContaining("uncommitted changes"),
		});
	});

	test("reports stack branch discovery failures", async () => {
		const pi = new FakePi([
			success(),
			{ code: 0, stdout: JSON.stringify({ status: "failure", message: "forked stack" }) },
		]);
		const ctx = fakeCtx();

		await runStackSquash(pi, ctx);

		expect(pi.execCalls).toEqual([
			{ command: "git", args: ["status", "--porcelain=v1"], cwd: TEST_CWD },
			{ command: "sdl", args: STACK_BRANCHES_ARGS, cwd: TEST_CWD },
		]);
		expect(ctx.ui.notifications.at(-1)).toMatchObject({
			level: "error",
			message: "forked stack",
		});
	});

	test("treats already-one-commit squash exits as idempotent success", async () => {
		const pi = new FakePi([
			success(),
			stackBranches(["feature/top"]),
			success("Already at feature/top\n"),
			{ code: 1, stderr: "ERROR: Only one commit in branch, nothing to squash.\n" },
			success("Already at feature/top\n"),
		]);
		const ctx = fakeCtx();

		await runStackSquash(pi, ctx);

		expect(ctx.ui.notifications.at(-1)).toMatchObject({
			level: "info",
			message: expect.stringContaining("feature/top (already one commit)"),
		});
		expect(pi.execCalls.at(-1)).toEqual({
			command: "gt",
			args: ["checkout", "feature/top", "--no-interactive"],
			cwd: TEST_CWD,
		});
	});

	test("stops on the first squash failure", async () => {
		const pi = new FakePi([
			success(),
			stackBranches(["feature/bottom", "feature/top"]),
			success("Switched to feature/top\n"),
			{ code: 1, stderr: "cannot squash branch\n" },
		]);
		const ctx = fakeCtx();

		await runStackSquash(pi, ctx);

		expect(pi.execCalls.at(-1)).toEqual({
			command: "gt",
			args: ["squash", "--no-edit", "--no-interactive"],
			cwd: TEST_CWD,
		});
		expect(ctx.ui.notifications.at(-1)).toMatchObject({
			level: "error",
			message: expect.stringContaining("gt squash failed on feature/top"),
		});
		expect(ctx.ui.notifications.at(-1)?.message).toContain("cannot squash branch");
	});
});
