import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import objectiveExtension, { type CommandContext, type ExecResult, type ExtensionAPI, type NotifyLevel } from "../src/objective.ts";
import protoExtension from "../src/proto.ts";

const ROOT = "/repo";
const TRUNK = "master";

const PROTO_SKILL_MARKDOWN = `---
name: proto-objective-impl
hidden-frontmatter-token: do-not-include
---

# Test Proto Objective Skill

Use the explicitly selected Objective.
`;

type RegisteredCommand = Parameters<ExtensionAPI["registerCommand"]>[1];
type CommandInfo = ReturnType<ExtensionAPI["getCommands"]>[number];

interface ExecCall {
	command: string;
	args: string[];
	options: { cwd?: string; timeout?: number } | undefined;
}

interface ScriptedExec {
	command: string;
	args: string[];
	result: Partial<ExecResult>;
}

interface Notification {
	message: string;
	level: NotifyLevel | undefined;
}

interface Selection {
	title: string;
	items: string[];
}

class FakePi implements ExtensionAPI {
	readonly commands = new Map<string, RegisteredCommand>();
	readonly errors: string[] = [];
	readonly execCalls: ExecCall[] = [];
	readonly sentUserMessages: string[] = [];
	private readonly commandInfos: CommandInfo[];
	private readonly script: ScriptedExec[];

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
		if (!expected) {
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

function step(command: string, args: string[], result: Partial<ExecResult> = {}): ScriptedExec {
	return { command, args, result };
}

function createContext(options: { cancelSelect?: boolean; hasUI?: boolean; selectIndex?: number } = {}): {
	ctx: CommandContext;
	notifications: Notification[];
	selections: Selection[];
	waitForIdleCalls: () => number;
} {
	const notifications: Notification[] = [];
	const selections: Selection[] = [];
	let waits = 0;

	const ctx: CommandContext = {
		cwd: ROOT,
		hasUI: options.hasUI ?? true,
		ui: {
			notify(message: string, level?: NotifyLevel): void {
				notifications.push({ message, level });
			},
			async select(title: string, items: string[]): Promise<string | undefined> {
				selections.push({ title, items: [...items] });
				if (options.cancelSelect) {
					return undefined;
				}
				return items[options.selectIndex ?? 0];
			},
			setStatus(): void {},
		},
		async waitForIdle(): Promise<void> {
			waits += 1;
		},
	};

	return { ctx, notifications, selections, waitForIdleCalls: () => waits };
}

function skillCommandInfo(skillName: string, skillPath: string, baseDir: string): CommandInfo {
	return {
		name: `skill:${skillName}`,
		source: "skill",
		sourceInfo: {
			path: skillPath,
			source: "project",
			scope: "project",
			origin: "top-level",
			baseDir,
		},
	};
}

async function withTempSkill<T>(callback: (skillPath: string, skillDir: string) => Promise<T>): Promise<T> {
	const dir = await mkdtemp(join(tmpdir(), "proto-objective-impl-skill-"));
	const skillPath = join(dir, "SKILL.md");
	await writeFile(skillPath, PROTO_SKILL_MARKDOWN, "utf8");
	try {
		return await callback(skillPath, dir);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

async function runProtoObjectiveImpl(
	args: string,
	script: ScriptedExec[] = [],
	contextOptions: { cancelSelect?: boolean; hasUI?: boolean; selectIndex?: number } = {},
	commandInfos: CommandInfo[] = [],
): Promise<{
	pi: FakePi;
	notifications: Notification[];
	selections: Selection[];
	waitForIdleCalls: () => number;
}> {
	const pi = new FakePi(script, commandInfos);
	protoExtension(pi);
	const command = pi.commands.get("proto:objective-impl");
	expect(command).toBeDefined();
	if (!command) {
		throw new Error("proto:objective-impl was not registered");
	}

	const context = createContext(contextOptions);
	await command.handler(args, context.ctx);
	return { pi, ...context };
}

function objectiveList(slugs: string[], trunkBranch: string = TRUNK): string {
	return JSON.stringify({
		exit_code: 0,
		data: {
			trunk_branch: trunkBranch,
			root_path: ".asdl/objectives",
			status_filter: "active",
			names_only: false,
			records: slugs.map((slug, index) => ({
				slug,
				status: "open",
				latest_update_iso: `2026-01-0${index + 1}T00:00:00Z`,
			})),
		},
	});
}

function listStep(slugs: string[], trunkBranch: string = TRUNK): ScriptedExec {
	return step("objective", ["list", "--format", "json"], { stdout: objectiveList(slugs, trunkBranch) });
}

function diffStep(stdout: string): ScriptedExec {
	return step("git", ["diff", "--name-status", "-M", `${TRUNK}...HEAD`, "--", ".asdl/objectives"], {
		stdout,
	});
}

function statusStep(stdout: string): ScriptedExec {
	return step("git", ["status", "--porcelain=v1", "-z", "--", ".asdl/objectives"], { stdout });
}

function expectPromptSelectsObjective(prompt: string | undefined, objective: string): void {
	expect(prompt).toContain("Run proto-objective-impl for this explicitly selected Objective slug or path:");
	expect(prompt).toContain(`\`\`\`text\n${objective}\n\`\`\``);
	expect(prompt).toContain("Treat this as an explicit user selection. Do not auto-select a different Objective.");
}

describe("proto:objective-impl command", () => {
	test("registers the prototype skill-backed wrapper command", () => {
		const pi = new FakePi();

		protoExtension(pi);

		expect(pi.commands.has("proto:objective-impl")).toBe(true);
		expect(pi.commands.get("proto:objective-impl")?.description).toBe(
			"Pick an active Objective or accept an explicit slug/path, then invoke the prototype Objective implementation skill.",
		);
	});

	test("explicit slug bypasses objective list and git evidence while sending the expanded skill block", async () => {
		await withTempSkill(async (skillPath, skillDir) => {
			const result = await runProtoObjectiveImpl("  bravo  ", [], {}, [
				skillCommandInfo("proto-objective-impl", skillPath, skillDir),
			]);

			result.pi.assertDone();
			expect(result.pi.execCalls).toEqual([]);
			expect(result.selections).toEqual([]);
			expect(result.waitForIdleCalls()).toBe(1);
			expect(result.pi.sentUserMessages).toHaveLength(1);
			expect(result.pi.sentUserMessages[0]).toContain(
				`<skill name="proto-objective-impl" location="${skillPath}">`,
			);
			expect(result.pi.sentUserMessages[0]).toContain(`References are relative to ${skillDir}.`);
			expect(result.pi.sentUserMessages[0]).toContain(
				"# Test Proto Objective Skill\n\nUse the explicitly selected Objective.",
			);
			expect(result.pi.sentUserMessages[0]).not.toContain("hidden-frontmatter-token");
			expectPromptSelectsObjective(result.pi.sentUserMessages[0], "bravo");
			expect(result.notifications).toContainEqual({
				message: "Invoking proto:objective-impl for bravo.",
				level: "info",
			});
		});
	});

	test("explicit slug falls back when the prototype skill is unavailable", async () => {
		const result = await runProtoObjectiveImpl("bravo");

		result.pi.assertDone();
		expect(result.pi.execCalls).toEqual([]);
		expect(result.pi.sentUserMessages[0]).toContain(
			"The proto-objective-impl skill was not found among loaded Pi skills.",
		);
		expect(result.pi.sentUserMessages[0]).toContain("Require an upfront preview and explicit human confirmation");
		expect(result.pi.sentUserMessages[0]).toContain("Do not use hidden run ledgers");
		expect(result.pi.sentUserMessages[0]).toContain("Do not change canonical /objective:* behavior");
		expect(result.pi.sentUserMessages[0]).toContain(
			"Do not submit PRs unless PR submission is included in the confirmed preview scope.",
		);
		expectPromptSelectsObjective(result.pi.sentUserMessages[0], "bravo");
		expect(result.notifications).toContainEqual({
			message: "proto-objective-impl skill was not found; using fallback prompt.",
			level: "warning",
		});
	});

	test("empty args list active Objectives, pick one, and send the selected slug prompt", async () => {
		await withTempSkill(async (skillPath, skillDir) => {
			const result = await runProtoObjectiveImpl(
				"",
				[listStep(["alpha", "bravo"]), diffStep(""), statusStep("")],
				{ selectIndex: 1 },
				[skillCommandInfo("proto-objective-impl", skillPath, skillDir)],
			);

			result.pi.assertDone();
			expect(result.waitForIdleCalls()).toBe(2);
			expect(result.pi.execCalls).toEqual([
				{
					command: "objective",
					args: ["list", "--format", "json"],
					options: { cwd: ROOT, timeout: 30_000 },
				},
				{
					command: "git",
					args: ["diff", "--name-status", "-M", "master...HEAD", "--", ".asdl/objectives"],
					options: { cwd: ROOT, timeout: 30_000 },
				},
				{
					command: "git",
					args: ["status", "--porcelain=v1", "-z", "--", ".asdl/objectives"],
					options: { cwd: ROOT, timeout: 30_000 },
				},
			]);
			expect(result.selections).toEqual([
				{
					title: "Select an active Objective for prototype implementation",
					items: [
						"alpha — open — latest update 2026-01-01T00:00:00Z",
						"bravo — open — latest update 2026-01-02T00:00:00Z",
					],
				},
			]);
			expect(result.pi.sentUserMessages[0]).toContain(
				`<skill name="proto-objective-impl" location="${skillPath}">`,
			);
			expectPromptSelectsObjective(result.pi.sentUserMessages[0], "bravo");
		});
	});

	test("changed Objective suggestions use the existing active-Objective picker labels", async () => {
		const result = await runProtoObjectiveImpl("", [
			listStep(["alpha", "bravo", "charlie"]),
			diffStep("M\t.asdl/objectives/bravo/objective.md\n"),
			statusStep(""),
		]);

		result.pi.assertDone();
		expect(result.selections[0]).toEqual({
			title: "Select an active Objective for prototype implementation (only Objective changed vs master)",
			items: [
				"bravo — suggested: only Objective changed vs master — open — latest update 2026-01-02T00:00:00Z",
				"View other active Objectives…",
			],
		});
		expectPromptSelectsObjective(result.pi.sentUserMessages[0], "bravo");
	});

	test("zero active Objectives notify and send no prompt", async () => {
		const result = await runProtoObjectiveImpl("", [listStep([])]);

		result.pi.assertDone();
		expect(result.waitForIdleCalls()).toBe(1);
		expect(result.notifications).toEqual([
			{ message: "No active Objectives. Create one with /skill:objective-create.", level: "info" },
		]);
		expect(result.selections).toEqual([]);
		expect(result.pi.sentUserMessages).toEqual([]);
	});

	test("picker cancellation sends no prompt", async () => {
		const result = await runProtoObjectiveImpl(
			"",
			[listStep(["alpha", "bravo"]), diffStep(""), statusStep("")],
			{ cancelSelect: true },
		);

		result.pi.assertDone();
		expect(result.waitForIdleCalls()).toBe(1);
		expect(result.notifications).toEqual([{ message: "Objective selection cancelled.", level: "info" }]);
		expect(result.pi.sentUserMessages).toEqual([]);
	});

	test("non-UI empty args do not invoke the agent", async () => {
		const result = await runProtoObjectiveImpl("", [listStep(["alpha", "bravo"])], { hasUI: false });

		result.pi.assertDone();
		expect(result.waitForIdleCalls()).toBe(1);
		expect(result.selections).toEqual([]);
		expect(result.notifications).toEqual([]);
		expect(result.pi.sentUserMessages).toEqual([]);
	});

	test("registering proto leaves the canonical Objective command surface separate", () => {
		const pi = new FakePi();

		protoExtension(pi);
		objectiveExtension(pi);

		expect(pi.commands.has("proto:objective-impl")).toBe(true);
		expect(pi.commands.has("objective:stack-impl")).toBe(true);
		expect(pi.commands.has("objective:impl")).toBe(false);
		expect(pi.commands.get("objective:stack-impl")?.description).toBe(
			"Pick an active Objective, then invoke the portable Objective stack implementation skill for the selected slug.",
		);
		expect(pi.commands.get("proto:objective-impl")).not.toBe(pi.commands.get("objective:stack-impl"));
	});
});
