import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import brmemHandoffExtension, {
	buildCreateHandoffPrompt,
	buildPickupHandoffPrompt,
	parseHandoffKeysFromBrmemList,
	parsePickupHandoffArgs,
	resolveHandoffKey,
	type CommandContext,
	type ExecResult,
	type ExtensionAPI,
} from "../src/brmem-handoff.ts";

const ROOT = "/repo";
const BRANCH = "feature/handoff";

type RegisteredCommand = Parameters<ExtensionAPI["registerCommand"]>[1];
type CommandInfo = NonNullable<ReturnType<NonNullable<ExtensionAPI["getCommands"]>>>[number];

type ExecCall = {
	command: string;
	args: string[];
	options: { cwd?: string; timeout?: number } | undefined;
};

type ScriptedExec = {
	command: string;
	args: string[];
	result: Partial<ExecResult> | undefined;
};

type Notification = {
	message: string;
	level: "info" | "warning" | "error" | undefined;
};

type Selection = {
	title: string;
	items: string[];
};

class FakePi implements ExtensionAPI {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly execCalls: ExecCall[] = [];
	readonly errors: string[] = [];
	readonly sentUserMessages: string[] = [];
	private readonly script: ScriptedExec[];
	private readonly commandInfos: CommandInfo[];

	constructor(script: ScriptedExec[] = [], commandInfos: CommandInfo[] = []) {
		this.script = [...script];
		this.commandInfos = [...commandInfos];
	}

	registerCommand(name: string, options: RegisteredCommand): void {
		this.commands.set(name, options);
	}

	async exec(command: string, args: string[], options?: { cwd?: string; timeout?: number }): Promise<ExecResult> {
		this.execCalls.push({ command, args: [...args], options });
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

	getCommands(): CommandInfo[] {
		return this.commandInfos;
	}

	sendUserMessage(content: string): void {
		this.sentUserMessages.push(content);
	}

	assertDone(): void {
		expect(this.errors).toEqual([]);
		expect(this.script).toEqual([]);
	}
}

function sameArgs(left: string[], right: string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
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

function createContext(options: { hasUI?: boolean; cancelSelect?: boolean; selectIndex?: number } = {}): {
	ctx: CommandContext;
	notifications: Notification[];
	selections: Selection[];
	statuses: Array<string | undefined>;
	waitForIdleCalls: () => number;
} {
	const notifications: Notification[] = [];
	const selections: Selection[] = [];
	const statuses: Array<string | undefined> = [];
	let waits = 0;

	const ctx: CommandContext = {
		cwd: ROOT,
		hasUI: options.hasUI ?? true,
		ui: {
			notify(message: string, level?: "info" | "warning" | "error"): void {
				notifications.push({ message, level });
			},
			async select(title: string, items: string[]): Promise<string | undefined> {
				selections.push({ title, items: [...items] });
				if (options.cancelSelect) {
					return undefined;
				}
				return items[options.selectIndex ?? 0];
			},
			setStatus(_key: string, value: string | undefined): void {
				statuses.push(value);
			},
		},
		async waitForIdle(): Promise<void> {
			waits += 1;
		},
	};

	return { ctx, notifications, selections, statuses, waitForIdleCalls: () => waits };
}

async function runCommand(
	commandName: "brmem-handoff" | "brmem-pickup-handoff",
	args: string,
	script: ScriptedExec[] = [],
	contextOptions: { hasUI?: boolean; cancelSelect?: boolean; selectIndex?: number } = {},
	commandInfos: CommandInfo[] = [],
): Promise<{
	pi: FakePi;
	notifications: Notification[];
	selections: Selection[];
	statuses: Array<string | undefined>;
	waitForIdleCalls: () => number;
}> {
	const pi = new FakePi(script, commandInfos);
	brmemHandoffExtension(pi);
	const command = pi.commands.get(commandName);
	expect(command).toBeDefined();
	if (command === undefined) {
		throw new Error(`${commandName} was not registered`);
	}
	const context = createContext(contextOptions);
	await command.handler(args, context.ctx);
	return { pi, ...context };
}

function listJson(keys: string[]): string {
	return JSON.stringify({
		exit_code: 0,
		data: {
			namespace: "session-artifacts",
			entries: keys.map((key) => ({ key })),
		},
	});
}

function branchStep(branch = BRANCH): ScriptedExec {
	return step("git", ["branch", "--show-current"], { stdout: `${branch}\n` });
}

function listStep(branch: string, keys: string[]): ScriptedExec {
	return step("brmem", ["list", "--namespace", "session-artifacts", "--branch", branch, "--format", "json"], {
		stdout: listJson(keys),
	});
}

function getStep(branch: string, key: string, artifact: string): ScriptedExec {
	return step("brmem", ["get", key, "--namespace", "session-artifacts", "--branch", branch], { stdout: artifact });
}

async function withTempSkill<T>(callback: (skillPath: string) => Promise<T>): Promise<T> {
	const dir = await mkdtemp(join(tmpdir(), "brmem-handoff-skill-"));
	const skillPath = join(dir, "SKILL.md");
	await writeFile(
		skillPath,
		`---\nname: brmem-handoff\ndescription: Test skill\n---\n\n# brmem-handoff\n\nStore a handoff from the skill body.`,
		"utf8",
	);
	try {
		return await callback(skillPath);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

function skillCommandInfo(skillPath: string): CommandInfo {
	return {
		name: "skill:brmem-handoff",
		source: "skill",
		sourceInfo: {
			path: skillPath,
			source: "project",
			scope: "project",
			origin: "top-level",
		},
	};
}

describe("brmem handoff extension", () => {
	test("registers create and pickup commands", () => {
		const pi = new FakePi();

		brmemHandoffExtension(pi);

		expect(pi.commands.has("brmem-handoff")).toBe(true);
		expect(pi.commands.has("brmem-pickup-handoff")).toBe(true);
	});

	test("create command expands the brmem-handoff skill when available", async () => {
		await withTempSkill(async (skillPath) => {
			const result = await runCommand("brmem-handoff", "resume extension frontend work", [], {}, [
				skillCommandInfo(skillPath),
			]);

			result.pi.assertDone();
			expect(result.waitForIdleCalls()).toBe(1);
			expect(result.pi.sentUserMessages).toHaveLength(1);
			expect(result.pi.sentUserMessages[0]).toContain(`<skill name="brmem-handoff" location="${skillPath}">`);
			expect(result.pi.sentUserMessages[0]).toContain("Store a handoff from the skill body.");
			expect(result.pi.sentUserMessages[0]).toContain("resume extension frontend work");
			expect(result.notifications).toEqual([
				{ message: "Starting handoff save workflow…", level: "info" },
			]);
		});
	});

	test("create command falls back when the skill is unavailable", async () => {
		const result = await runCommand("brmem-handoff", "handoff focus");

		result.pi.assertDone();
		expect(result.pi.sentUserMessages[0]).toContain("Storage contract:");
		expect(result.pi.sentUserMessages[0]).toContain("handoff focus");
		expect(result.notifications).toEqual([
			{ message: "brmem-handoff skill was not found; using fallback save-handoff workflow prompt.", level: "warning" },
		]);
	});

	test("pickup command loads an explicit slug from the current branch", async () => {
		const artifact = "# Handoff: Continue tests\n\n## Next Steps\n\nRun the tests.";
		const result = await runCommand("brmem-pickup-handoff", "continue-tests", [
			branchStep(),
			listStep(BRANCH, ["handoffs/continue-tests.md"]),
			getStep(BRANCH, "handoffs/continue-tests.md", artifact),
		]);

		result.pi.assertDone();
		expect(result.pi.execCalls).toEqual([
			{ command: "git", args: ["branch", "--show-current"], options: { cwd: ROOT, timeout: 10_000 } },
			{
				command: "brmem",
				args: ["list", "--namespace", "session-artifacts", "--branch", BRANCH, "--format", "json"],
				options: { cwd: ROOT, timeout: 30_000 },
			},
			{
				command: "brmem",
				args: ["get", "handoffs/continue-tests.md", "--namespace", "session-artifacts", "--branch", BRANCH],
				options: { cwd: ROOT, timeout: 30_000 },
			},
		]);
		expect(result.selections).toEqual([]);
		expect(result.pi.sentUserMessages[0]).toContain(`Branch: ${BRANCH}`);
		expect(result.pi.sentUserMessages[0]).toContain("Namespace: session-artifacts");
		expect(result.pi.sentUserMessages[0]).toContain("Entry: handoffs/continue-tests.md");
		expect(result.pi.sentUserMessages[0]).toContain(artifact);
	});

	test("pickup command uses an explicit branch and entry key without reading current branch", async () => {
		const result = await runCommand("brmem-pickup-handoff", "--branch other/branch handoffs/foo.md", [
			listStep("other/branch", ["handoffs/foo.md"]),
			getStep("other/branch", "handoffs/foo.md", "# Handoff"),
		]);

		result.pi.assertDone();
		expect(result.pi.execCalls.map((call) => call.command)).toEqual(["brmem", "brmem"]);
		expect(result.pi.sentUserMessages[0]).toContain("Branch: other/branch");
		expect(result.pi.sentUserMessages[0]).toContain("Entry: handoffs/foo.md");
	});

	test("pickup command opens a picker when multiple handoffs are plausible", async () => {
		const result = await runCommand(
			"brmem-pickup-handoff",
			"",
			[
				branchStep(),
				listStep(BRANCH, ["handoffs/alpha.md", "handoffs/bravo.md"]),
				getStep(BRANCH, "handoffs/bravo.md", "# Bravo"),
			],
			{ selectIndex: 1 },
		);

		result.pi.assertDone();
		expect(result.selections).toEqual([
			{
				title: `Select handoff on ${BRANCH}`,
				items: ["handoffs/alpha.md", "handoffs/bravo.md"],
			},
		]);
		expect(result.pi.sentUserMessages[0]).toContain("Entry: handoffs/bravo.md");
	});

	test("pickup command matches search words against slug tokens", async () => {
		const result = await runCommand("brmem-pickup-handoff", "review feedback", [
			branchStep(),
			listStep(BRANCH, ["handoffs/address-review-feedback.md", "handoffs/add-pickup-handoff-skill.md"]),
			getStep(BRANCH, "handoffs/address-review-feedback.md", "# Review feedback"),
		]);

		result.pi.assertDone();
		expect(result.selections).toEqual([]);
		expect(result.pi.sentUserMessages[0]).toContain("Entry: handoffs/address-review-feedback.md");
	});

	test("pickup command reports no handoffs on the checked branch", async () => {
		const result = await runCommand("brmem-pickup-handoff", "", [branchStep(), listStep(BRANCH, [])]);

		result.pi.assertDone();
		expect(result.notifications).toEqual([
			{ message: `No saved handoffs found on branch ${BRANCH}.`, level: "info" },
		]);
		expect(result.pi.sentUserMessages).toEqual([]);
	});

	test("pickup command stops on detached HEAD", async () => {
		const result = await runCommand("brmem-pickup-handoff", "", [branchStep("")]);

		result.pi.assertDone();
		expect(result.notifications).toEqual([
			{
				message: "Cannot pick up a handoff in detached HEAD; pass --branch <branch> explicitly.",
				level: "error",
			},
		]);
		expect(result.pi.sentUserMessages).toEqual([]);
	});
});

describe("brmem handoff pure helpers", () => {
	test("parses pickup args", () => {
		expect(parsePickupHandoffArgs("--branch feature/x handoffs/foo.md")).toEqual({
			help: false,
			branch: "feature/x",
			selector: ["handoffs/foo.md"],
		});
		expect(parsePickupHandoffArgs("review feedback")).toEqual({ help: false, selector: ["review", "feedback"] });
	});

	test("filters brmem list output to handoff markdown keys", () => {
		expect(
			parseHandoffKeysFromBrmemList(
				listJson(["handoffs/bravo.md", "notes/ignore.md", "handoffs/alpha.md", "handoffs/bravo.md"]),
			),
		).toEqual(["handoffs/alpha.md", "handoffs/bravo.md"]);
	});

	test("resolves exact keys, normalized slugs, search terms, and ambiguity", () => {
		const keys = ["handoffs/address-review-feedback.md", "handoffs/add-pickup-handoff-skill.md"];
		expect(resolveHandoffKey(["handoffs/address-review-feedback.md"], keys)).toEqual({
			key: "handoffs/address-review-feedback.md",
		});
		expect(resolveHandoffKey(["add-pickup-handoff-skill"], keys)).toEqual({
			key: "handoffs/add-pickup-handoff-skill.md",
		});
		expect(resolveHandoffKey(["review", "feedback"], keys)).toEqual({
			key: "handoffs/address-review-feedback.md",
		});
		expect(resolveHandoffKey([], keys)).toEqual({ ambiguousKeys: keys });
	});

	test("pickup prompt fences artifacts that contain markdown fences", () => {
		const prompt = buildPickupHandoffPrompt(BRANCH, "handoffs/foo.md", "```text\ninside\n```");

		expect(prompt).toContain("````markdown");
		expect(prompt).toContain("```text\ninside\n```");
	});

	test("create prompt includes fallback and focus", () => {
		const prompt = buildCreateHandoffPrompt(undefined, "ship the frontend command");

		expect(prompt).toContain("Storage contract:");
		expect(prompt).toContain("ship the frontend command");
	});
});
