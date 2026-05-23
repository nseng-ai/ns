import { describe, expect, test } from "bun:test";

import objectiveExtension, {
	parseObjectiveDiffChangedSlugs,
	type CommandContext,
	type ExecResult,
	type ExtensionAPI,
	type NotifyLevel,
} from "../src/objective.ts";

const ROOT = "/repo";
const TRUNK = "master";

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

function createContext(options: { cancelSelect?: boolean; selectIndex?: number } = {}): {
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

async function runObjectiveNext(
	args: string,
	script: ScriptedExec[],
	contextOptions: { cancelSelect?: boolean; selectIndex?: number } = {},
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

function objectiveList(slugs: string[], trunkBranch: string = TRUNK): string {
	return JSON.stringify({
		exit_code: 0,
		data: {
			trunk_branch: trunkBranch,
			view: "list",
			current_branch: "feature/current",
			filtered_to_current: false,
			names_only: false,
			groups: slugs.map((slug, index) => ({
				slug,
				branches: [
					{
						branch: `feature/${slug}`,
						tip_head_iso: `2026-01-0${index + 1}T00:00:00Z`,
						ahead_trunk: index + 1,
					},
				],
			})),
		},
	});
}

function listStep(slugs: string[]): ScriptedExec {
	return step("objective", ["list", "--format", "json"], { stdout: objectiveList(slugs) });
}

function diffStep(stdout: string, result: Partial<ExecResult> = {}): ScriptedExec {
	return step("git", ["diff", "--name-status", "-M", `${TRUNK}...HEAD`, "--", ".asdl/objectives"], {
		stdout,
		...result,
	});
}

describe("parseObjectiveDiffChangedSlugs", () => {
	test("extracts Objective slugs and counts both sides of rename/copy statuses", () => {
		const stdout = [
			"M\t.asdl/objectives/alpha/objective.md",
			"D\t.asdl/objectives/alpha/roadmap.md",
			"R100\t.asdl/objectives/bravo/objective.md\t.asdl/objectives/charlie/objective.md",
			"C075\t.asdl/objectives/delta/roadmap.md\t.asdl/objectives/echo/roadmap.md",
			"M\tdocs/readme.md",
			"M\t.asdl/objectives",
			"",
		].join("\n");

		expect(parseObjectiveDiffChangedSlugs(stdout)).toEqual(["alpha", "bravo", "charlie", "delta", "echo"]);
	});
});

describe("objective picker suggestion", () => {
	test("puts exactly one changed open Objective first and labels it as suggested", async () => {
		const result = await runObjectiveNext("", [
			listStep(["alpha", "bravo", "charlie"]),
			diffStep("M\t.asdl/objectives/bravo/objective.md\n"),
		]);

		result.pi.assertDone();
		const items = result.selections[0]?.items ?? [];
		expect(items[0]).toBe(
			"bravo — suggested: only Objective changed vs master — 1 branch — latest feature/bravo — max +2 ahead trunk",
		);
		expect(items[1]).toBe("alpha — 1 branch — latest feature/alpha — max +1 ahead trunk");
		expect(items[2]).toBe("charlie — 1 branch — latest feature/charlie — max +3 ahead trunk");
		expect(result.pi.sentUserMessages[0]).toContain("bravo");
		expect(result.notifications.some((notification) => notification.message === "Suggested bravo from objective diff vs master.")).toBe(
			true,
		);
	});

	test("does not suggest when multiple Objective slugs changed", async () => {
		const result = await runObjectiveNext("", [
			listStep(["alpha", "bravo"]),
			diffStep(["M\t.asdl/objectives/alpha/objective.md", "M\t.asdl/objectives/bravo/objective.md"].join("\n")),
		]);

		result.pi.assertDone();
		const items = result.selections[0]?.items ?? [];
		expect(items).toEqual([
			"alpha — 1 branch — latest feature/alpha — max +1 ahead trunk",
			"bravo — 1 branch — latest feature/bravo — max +2 ahead trunk",
		]);
		expect(items.some((item) => item.includes("suggested"))).toBe(false);
	});

	test("does not suggest when the changed Objective slug is not open", async () => {
		const result = await runObjectiveNext("", [
			listStep(["alpha", "bravo"]),
			diffStep("M\t.asdl/objectives/closed-objective/objective.md\n"),
		]);

		result.pi.assertDone();
		const items = result.selections[0]?.items ?? [];
		expect(items).toEqual([
			"alpha — 1 branch — latest feature/alpha — max +1 ahead trunk",
			"bravo — 1 branch — latest feature/bravo — max +2 ahead trunk",
		]);
		expect(items.some((item) => item.includes("suggested"))).toBe(false);
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
			"alpha — 1 branch — latest feature/alpha — max +1 ahead trunk",
			"bravo — 1 branch — latest feature/bravo — max +2 ahead trunk",
		]);
		expect(result.notifications).toEqual([{ message: "Objective selection cancelled.", level: "info" }]);
		expect(result.pi.sentUserMessages).toEqual([]);
	});
});
