import { describe, expect, test } from "bun:test";

import checkpointPreviewExtension, {
	CHECKPOINT_PREVIEW_ALIAS_COMMAND_NAME,
	CHECKPOINT_PREVIEW_COMMAND_NAME,
	buildCheckpointPreviewPrompt,
	type CommandContext,
	type CustomMessage,
	type ExtensionAPI,
	untrackedFilesFromPorcelain,
} from "../src/checkpoint-preview.ts";
import type { ExecResult } from "../src/command-runtime.ts";

type RegisteredCommand = {
	description?: string;
	handler(args: string, ctx: CommandContext): Promise<void> | void;
};

type ExecCall = {
	command: string;
	args: string[];
	options?: { cwd?: string; timeout?: number };
};

class FakePi implements ExtensionAPI {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly execCalls: ExecCall[] = [];
	readonly sentMessages: CustomMessage[] = [];
	readonly sentUserMessages: string[] = [];
	private readonly execResults: ExecResult[];

	constructor(execResults: ExecResult[] = []) {
		this.execResults = [...execResults];
	}

	registerCommand(name: string, options: RegisteredCommand): void {
		this.commands.set(name, options);
	}

	async exec(command: string, args: string[], options?: { cwd?: string; timeout?: number }): Promise<ExecResult> {
		this.execCalls.push({ command, args: [...args], ...(options === undefined ? {} : { options }) });
		const result = this.execResults.shift();
		if (!result) throw new Error(`No fake exec result for ${command} ${args.join(" ")}`);
		return result;
	}

	sendMessage(message: CustomMessage): void {
		this.sentMessages.push(message);
	}

	sendUserMessage(content: string): void {
		this.sentUserMessages.push(content);
	}
}

class FakeContext implements CommandContext {
	readonly cwd = "/repo";
	readonly hasUI = true;
	readonly statuses: Array<string | undefined> = [];
	readonly notifications: Array<{ message: string; level?: string }> = [];
	waited = false;
	readonly ui = {
		notify: (message: string, level?: string): void => {
			this.notifications.push({ message, ...(level === undefined ? {} : { level }) });
		},
		setStatus: (_key: string, value: string | undefined): void => {
			this.statuses.push(value);
		},
	};

	async waitForIdle(): Promise<void> {
		this.waited = true;
	}
}

describe("checkpoint preview extension", () => {
	test("registers cp-preview and checkpoint-preview commands", () => {
		const pi = new FakePi();
		checkpointPreviewExtension(pi);

		expect(pi.commands.has(CHECKPOINT_PREVIEW_COMMAND_NAME)).toBe(true);
		expect(pi.commands.has(CHECKPOINT_PREVIEW_ALIAS_COMMAND_NAME)).toBe(true);
		expect(pi.commands.get(CHECKPOINT_PREVIEW_COMMAND_NAME)?.description).toContain("without staging or committing");
	});

	test("captures cp evidence and sends a preview-only generation prompt", async () => {
		const pi = new FakePi([
			execResult("feature/cp-preview\n"),
			execResult(" M src/file.ts\n?? new note.md\n"),
			execResult("diff --git a/src/file.ts b/src/file.ts\n+added\n"),
		]);
		checkpointPreviewExtension(pi);
		const ctx = new FakeContext();

		await pi.commands.get(CHECKPOINT_PREVIEW_COMMAND_NAME)?.handler("", ctx);

		expect(ctx.waited).toBe(true);
		expect(pi.execCalls.map((call) => [call.command, call.args])).toEqual([
			["git", ["symbolic-ref", "--short", "HEAD"]],
			["git", ["status", "--porcelain"]],
			["git", ["diff", "HEAD"]],
		]);
		expect(ctx.statuses.at(-1)).toBeUndefined();
		expect(ctx.notifications.at(-1)?.message).toContain("without staging or committing");
		expect(pi.sentMessages).toEqual([]);
		expect(pi.sentUserMessages).toHaveLength(1);
		const prompt = pi.sentUserMessages[0] ?? "";
		expect(prompt).toContain("Draft a dev-checkpoint commit message preview");
		expect(prompt).toContain("Do not run tools, do not stage files, do not commit");
		expect(prompt).toContain("Output exactly one short subject line prefixed with `[cp]`");
		expect(prompt).toContain("Branch: feature/cp-preview");
		expect(prompt).toContain("- new note.md");
		expect(prompt).toContain(" M src/file.ts");
		expect(prompt).toContain("diff --git a/src/file.ts b/src/file.ts");
	});

	test("refuses on main before reading status or diff", async () => {
		const pi = new FakePi([execResult("main\n")]);
		checkpointPreviewExtension(pi);
		const ctx = new FakeContext();

		await pi.commands.get(CHECKPOINT_PREVIEW_COMMAND_NAME)?.handler("", ctx);

		expect(pi.execCalls.map((call) => call.args)).toEqual([["symbolic-ref", "--short", "HEAD"]]);
		expect(pi.sentUserMessages).toEqual([]);
		expect(pi.sentMessages[0]?.content).toContain("Refusing to preview");
		expect(pi.sentMessages[0]?.details).toEqual(
			expect.objectContaining({ status: "rejected", branch: "main", reason: "protected-branch" }),
		);
	});

	test("refuses when the working tree is clean", async () => {
		const pi = new FakePi([execResult("feature/clean\n"), execResult("")]);
		checkpointPreviewExtension(pi);
		const ctx = new FakeContext();

		await pi.commands.get(CHECKPOINT_PREVIEW_COMMAND_NAME)?.handler("", ctx);

		expect(pi.execCalls.map((call) => call.args)).toEqual([
			["symbolic-ref", "--short", "HEAD"],
			["status", "--porcelain"],
		]);
		expect(pi.sentUserMessages).toEqual([]);
		expect(pi.sentMessages[0]?.content).toContain("working tree is clean");
	});

	test("shows usage for unsupported arguments", async () => {
		const pi = new FakePi();
		checkpointPreviewExtension(pi);
		const ctx = new FakeContext();

		await pi.commands.get(CHECKPOINT_PREVIEW_COMMAND_NAME)?.handler("--bad", ctx);

		expect(pi.execCalls).toEqual([]);
		expect(pi.sentUserMessages).toEqual([]);
		expect(pi.sentMessages[0]?.content).toContain("Unsupported /cp-preview argument");
		expect(pi.sentMessages[0]?.content).toContain("Usage: /cp-preview");
	});

	test("formats prompt evidence and untracked files", () => {
		expect(untrackedFilesFromPorcelain(" M a.ts\n?? new file.md\n?? nested/path.ts\n")).toEqual([
			"new file.md",
			"nested/path.ts",
		]);

		const prompt = buildCheckpointPreviewPrompt({
			branch: "feature/test",
			statusPorcelain: "?? new file.md\n",
			diffHead: "",
			untrackedFiles: ["new file.md"],
		});
		expect(prompt).toContain("- new file.md");
		expect(prompt).toContain("```diff\n(empty)\n```");
	});
});

function execResult(stdout: string, stderr = "", code = 0, killed = false): ExecResult {
	return { stdout, stderr, code, killed };
}
