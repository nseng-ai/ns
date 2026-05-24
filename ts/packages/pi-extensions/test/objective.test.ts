import { describe, expect, test } from "bun:test";

import objectiveExtension, {
	type CommandContext,
	type ExecResult,
	type ExtensionAPI,
	type NotifyLevel,
} from "../src/objective.ts";

const ROOT = "/repo";
const TRUNK = "master";

const OBJECTIVE_COMMAND_NAMES = ["objective-next", "objective-current", "objective-update"] as const;
type ObjectiveCommandName = (typeof OBJECTIVE_COMMAND_NAMES)[number];

const SELECTION_TITLES: Record<ObjectiveCommandName, string> = {
	"objective-next": "Select an active Objective for next-work recommendation",
	"objective-current": "Select an active Objective to summarize",
	"objective-update": "Select an active Objective to update",
};

const ACTION_PROMPTS: Record<ObjectiveCommandName, string> = {
	"objective-next": "Run objective-next for this explicitly selected Objective slug or path:",
	"objective-current": "Run objective-current for this explicitly selected Objective slug or path:",
	"objective-update": "Run objective-update for this explicitly selected Objective slug or path:",
};

type RegisteredCommand = Parameters<ExtensionAPI["registerCommand"]>[1];

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
	level: NotifyLevel | undefined;
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

	getCommands(): ReturnType<ExtensionAPI["getCommands"]> {
		return [];
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

function createContext(options: { cancelSelect?: boolean; selectIndex?: number; selectIndices?: number[] } = {}): {
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
		hasUI: true,
		ui: {
			notify(message: string, level?: NotifyLevel): void {
				notifications.push({ message, level });
			},
			async select(title: string, items: string[]): Promise<string | undefined> {
				const callIndex = selections.length;
				selections.push({ title, items: [...items] });
				if (options.cancelSelect) {
					return undefined;
				}
				return items[options.selectIndices?.[callIndex] ?? options.selectIndex ?? 0];
			},
			setStatus(): void {},
		},
		async waitForIdle(): Promise<void> {
			waits += 1;
		},
	};

	return { ctx, notifications, selections, waitForIdleCalls: () => waits };
}

async function runObjectiveNext(
	args: string,
	script: ScriptedExec[],
	contextOptions: { cancelSelect?: boolean; selectIndex?: number; selectIndices?: number[] } = {},
): Promise<{
	pi: FakePi;
	notifications: Notification[];
	selections: Selection[];
	waitForIdleCalls: () => number;
}> {
	const pi = new FakePi(script);
	objectiveExtension(pi);
	const command = pi.commands.get("objective-next");
	expect(command).toBeDefined();
	const context = createContext(contextOptions);
	await command?.handler(args, context.ctx);
	return { pi, ...context };
}

async function runObjectiveCommand(
	commandName: ObjectiveCommandName,
	args: string,
	script: ScriptedExec[] = [],
	contextOptions: { cancelSelect?: boolean; selectIndex?: number; selectIndices?: number[] } = {},
): Promise<{
	pi: FakePi;
	notifications: Notification[];
	selections: Selection[];
	waitForIdleCalls: () => number;
}> {
	const pi = new FakePi(script);
	objectiveExtension(pi);
	const command = pi.commands.get(commandName);
	expect(command).toBeDefined();
	if (!command) {
		throw new Error(`${commandName} was not registered`);
	}

	const context = createContext(contextOptions);
	await command.handler(args, context.ctx);
	return { pi, ...context };
}

function expectListActiveObjectivesCall(result: { pi: FakePi }): void {
	expect(result.pi.execCalls[0]).toEqual({
		command: "objective",
		args: ["list", "--current", "--format", "json"],
		options: { cwd: ROOT, timeout: 30_000 },
	});
}

function expectPromptSelectsObjective(
	commandName: ObjectiveCommandName,
	prompt: string | undefined,
	objective: string,
): void {
	expect(prompt).toContain(ACTION_PROMPTS[commandName]);
	expect(prompt).toContain(`\`\`\`text\n${objective}\n\`\`\``);
	expect(prompt).toContain("Treat this as an explicit user selection. Do not auto-select a different Objective.");
}

function objectiveList(slugs: string[], trunkBranch: string = TRUNK): string {
	return JSON.stringify({
		exit_code: 0,
		data: {
			base_branch: trunkBranch,
			trunk_branch: trunkBranch,
			status_source: "current",
			status_source_branch: "feature/current",
			view: "list",
			status_filter: "active",
			current_branch: "feature/current",
			filtered_to_current: true,
			names_only: false,
			groups: slugs.map((slug, index) => ({
				slug,
				status: "open",
				latest_update_iso: `2026-01-0${index + 1}T00:00:00Z`,
				latest_work_branch: `feature/${slug}`,
				branches: [
					{
						branch: `feature/${slug}`,
						parent_branch: trunkBranch,
						updated_iso: `2026-01-0${index + 1}T00:00:00Z`,
						slice_commits: index + 1,
					},
				],
			})),
		},
	});
}

function listStep(slugs: string[]): ScriptedExec {
	return step("objective", ["list", "--current", "--format", "json"], { stdout: objectiveList(slugs) });
}

function diffStep(stdout: string, result: Partial<ExecResult> = {}): ScriptedExec {
	return step("git", ["diff", "--name-status", "-M", `${TRUNK}...HEAD`, "--", ".asdl/objectives"], {
		stdout,
		...result,
	});
}

describe("objective picker suggestion", () => {
	test("shows only the one changed active Objective before offering the rest", async () => {
		const result = await runObjectiveNext("", [
			listStep(["alpha", "bravo", "charlie"]),
			diffStep("M\t.asdl/objectives/bravo/objective.md\n"),
		]);

		result.pi.assertDone();
		expect(result.selections[0]).toEqual({
			title: "Select an active Objective for next-work recommendation (only Objective changed vs master)",
			items: [
				"bravo — suggested: only Objective changed vs master — 1 branch — latest work feature/bravo — max +2 slice commits",
				"View other active Objectives…",
			],
		});
		expect(result.selections).toHaveLength(1);
		expect(result.pi.sentUserMessages[0]).toContain("bravo");
		expect(result.notifications.some((notification) => notification.message === "Suggested bravo from objective diff vs master.")).toBe(
			false,
		);
	});

	test("opens a second picker for the other Objectives when requested", async () => {
		const result = await runObjectiveNext(
			"",
			[listStep(["alpha", "bravo", "charlie"]), diffStep("M\t.asdl/objectives/bravo/objective.md\n")],
			{ selectIndices: [1, 1] },
		);

		result.pi.assertDone();
		expect(result.selections[1]).toEqual({
			title: "Select an active Objective for next-work recommendation (other active Objectives)",
			items: [
				"alpha — 1 branch — latest work feature/alpha — max +1 slice commits",
				"charlie — 1 branch — latest work feature/charlie — max +3 slice commits",
			],
		});
		expect(result.pi.sentUserMessages[0]).toContain("charlie");
	});

	test("shows changed active Objectives before offering the rest", async () => {
		const result = await runObjectiveNext("", [
			listStep(["alpha", "bravo", "charlie", "delta"]),
			diffStep([
				"M\t.asdl/objectives/alpha/objective.md",
				"M\t.asdl/objectives/charlie/roadmap.md",
			].join("\n")),
		]);

		result.pi.assertDone();
		expect(result.selections[0]).toEqual({
			title: "Select an active Objective for next-work recommendation (changed Objectives vs master)",
			items: [
				"alpha — changed vs master — 1 branch — latest work feature/alpha — max +1 slice commits",
				"charlie — changed vs master — 1 branch — latest work feature/charlie — max +3 slice commits",
				"View other active Objectives…",
			],
		});
		expect(result.selections).toHaveLength(1);
		expect(result.pi.sentUserMessages[0]).toContain("alpha");
	});

	test("opens a second picker for non-changed Objectives after the changed Objectives menu", async () => {
		const result = await runObjectiveNext(
			"",
			[
				listStep(["alpha", "bravo", "charlie", "delta"]),
				diffStep([
					"M\t.asdl/objectives/alpha/objective.md",
					"M\t.asdl/objectives/charlie/roadmap.md",
				].join("\n")),
			],
			{ selectIndices: [2, 1] },
		);

		result.pi.assertDone();
		expect(result.selections[1]).toEqual({
			title: "Select an active Objective for next-work recommendation (other active Objectives)",
			items: [
				"bravo — 1 branch — latest work feature/bravo — max +2 slice commits",
				"delta — 1 branch — latest work feature/delta — max +4 slice commits",
			],
		});
		expect(result.pi.sentUserMessages[0]).toContain("delta");
	});

	test("omits the View other choice when all active Objectives changed", async () => {
		const result = await runObjectiveNext("", [
			listStep(["alpha", "bravo"]),
			diffStep(["M\t.asdl/objectives/alpha/objective.md", "M\t.asdl/objectives/bravo/objective.md"].join("\n")),
		]);

		result.pi.assertDone();
		expect(result.selections[0]).toEqual({
			title: "Select an active Objective for next-work recommendation (changed Objectives vs master)",
			items: [
				"alpha — changed vs master — 1 branch — latest work feature/alpha — max +1 slice commits",
				"bravo — changed vs master — 1 branch — latest work feature/bravo — max +2 slice commits",
			],
		});
		expect(result.pi.sentUserMessages[0]).toContain("alpha");
	});

	test("does not suggest when the changed Objective slug is not active", async () => {
		const result = await runObjectiveNext("", [
			listStep(["alpha", "bravo"]),
			diffStep("M\t.asdl/objectives/closed-objective/objective.md\n"),
		]);

		result.pi.assertDone();
		const items = result.selections[0]?.items ?? [];
		expect(items).toEqual([
			"alpha — 1 branch — latest work feature/alpha — max +1 slice commits",
			"bravo — 1 branch — latest work feature/bravo — max +2 slice commits",
		]);
		expect(items.some((item) => item.includes("suggested"))).toBe(false);
	});

	test("filters branch-closed Objectives before diff suggestions", async () => {
		const result = await runObjectiveNext("", [
			listStep(["pi-extension-deepening"]),
			diffStep([
				"A\t.asdl/objectives/pi-extension-architecture-deepening/closed.md",
				"M\t.asdl/objectives/pi-extension-deepening/objective.md",
			].join("\n")),
		]);

		result.pi.assertDone();
		const items = result.selections[0]?.items ?? [];
		expect(items).toEqual([
			"pi-extension-deepening — changed vs master — 1 branch — latest work feature/pi-extension-deepening — max +1 slice commits",
		]);
		expect(items.some((item) => item.includes("pi-extension-architecture-deepening"))).toBe(false);
		expect(result.pi.sentUserMessages[0]).toContain("pi-extension-deepening");
		expect(result.pi.sentUserMessages[0]).not.toContain("pi-extension-architecture-deepening");
	});

	test("does not claim only Objective changed when a changed slug is not active", async () => {
		const result = await runObjectiveNext("", [
			listStep(["alpha", "bravo", "charlie"]),
			diffStep([
				"M\t.asdl/objectives/bravo/objective.md",
				"M\t.asdl/objectives/closed-objective/objective.md",
			].join("\n")),
		]);

		result.pi.assertDone();
		expect(result.selections[0]).toEqual({
			title: "Select an active Objective for next-work recommendation (changed Objectives vs master)",
			items: [
				"bravo — changed vs master — 1 branch — latest work feature/bravo — max +2 slice commits",
				"View other active Objectives…",
			],
		});
		expect(result.pi.sentUserMessages[0]).toContain("bravo");
	});

	test("bypasses suggestion logic when an explicit slug is provided", async () => {
		const result = await runObjectiveNext("bravo", []);

		result.pi.assertDone();
		expect(result.pi.execCalls).toEqual([]);
		expect(result.selections).toEqual([]);
		expect(result.pi.sentUserMessages[0]).toContain("bravo");
	});

	test("falls back to the current picker when git diff fails", async () => {
		const result = await runObjectiveNext(
			"",
			[listStep(["alpha", "bravo"]), diffStep("", { code: 1, stderr: "fatal: bad revision" })],
			{ cancelSelect: true },
		);

		result.pi.assertDone();
		const items = result.selections[0]?.items ?? [];
		expect(items).toEqual([
			"alpha — 1 branch — latest work feature/alpha — max +1 slice commits",
			"bravo — 1 branch — latest work feature/bravo — max +2 slice commits",
		]);
		expect(result.notifications).toEqual([{ message: "Objective selection cancelled.", level: "info" }]);
		expect(result.pi.sentUserMessages).toEqual([]);
	});
});

describe("objective command shared selection policy", () => {
	for (const commandName of OBJECTIVE_COMMAND_NAMES) {
		describe(commandName, () => {
			test("explicit slug or path bypasses objective list and git diff", async () => {
				const explicitObjective = ".asdl/objectives/bravo/objective.md";
				const result = await runObjectiveCommand(commandName, `  ${explicitObjective}  `);

				result.pi.assertDone();
				expect(result.pi.execCalls).toEqual([]);
				expect(result.selections).toEqual([]);
				expect(result.waitForIdleCalls()).toBe(1);
				expectPromptSelectsObjective(commandName, result.pi.sentUserMessages[0], explicitObjective);
				expect(result.pi.sentUserMessages[0]).toContain(
					`The ${commandName} skill was not found among loaded Pi skills.`,
				);
				expect(result.notifications).toContainEqual({
					message: `${commandName} skill was not found; using fallback prompt.`,
					level: "warning",
				});
			});

			test("empty args load current active candidates with objective list json", async () => {
				const result = await runObjectiveCommand(
					commandName,
					"",
					[listStep(["alpha"]), diffStep("")],
					{ cancelSelect: true },
				);

				result.pi.assertDone();
				expectListActiveObjectivesCall(result);
				expect(result.selections).toHaveLength(1);
				expect(result.pi.sentUserMessages).toEqual([]);
			});

			test("zero active Objectives notify and send no prompt", async () => {
				const result = await runObjectiveCommand(commandName, "", [listStep([])]);

				result.pi.assertDone();
				expect(result.pi.execCalls).toHaveLength(1);
				expectListActiveObjectivesCall(result);
				expect(result.notifications).toEqual([
					{ message: "No active Objectives. Create one with /skill:objective-create.", level: "info" },
				]);
				expect(result.selections).toEqual([]);
				expect(result.pi.sentUserMessages).toEqual([]);
			});

			test("picker cancellation sends no prompt", async () => {
				const result = await runObjectiveCommand(
					commandName,
					"",
					[listStep(["alpha", "bravo"]), diffStep("M\t.asdl/objectives/bravo/objective.md\n")],
					{ cancelSelect: true },
				);

				result.pi.assertDone();
				expect(result.notifications).toContainEqual({
					message: "Objective selection cancelled.",
					level: "info",
				});
				expect(result.pi.sentUserMessages).toEqual([]);
			});

			test("selected slug is embedded as an explicit selection in the generated skill prompt", async () => {
				const result = await runObjectiveCommand(
					commandName,
					"",
					[listStep(["alpha", "bravo"]), diffStep("")],
					{ selectIndex: 0 },
				);

				result.pi.assertDone();
				expectPromptSelectsObjective(commandName, result.pi.sentUserMessages[0], "alpha");
			});
		});
	}
});

describe("objective command prompt details", () => {
	test("objective-update prompt includes the post-selection evidence workflow reminder", async () => {
		const result = await runObjectiveCommand("objective-update", "bravo");

		result.pi.assertDone();
		expect(result.pi.sentUserMessages[0]).toContain(
			"After this explicit selection, follow objective-update's normal post-selection evidence workflow.",
		);
	});

	test("non-update prompts do not include the objective-update evidence workflow reminder", async () => {
		for (const commandName of ["objective-next", "objective-current"] as const) {
			const result = await runObjectiveCommand(commandName, "bravo");

			result.pi.assertDone();
			expect(result.pi.sentUserMessages[0]).not.toContain("normal post-selection evidence workflow");
		}
	});
});
