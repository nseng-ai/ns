import { readFile } from "node:fs/promises";

import { describe, expect, test } from "bun:test";

import type { ExecFunction, ExecResult } from "../src/command.ts";
import {
	buildObjectiveStackPlanningPrompt,
	extractObjectiveStackPlanConfirmation,
	findObjectiveStackPlanningState,
	listOpenObjectives,
	OBJECTIVE_STACK_PLAN_CONFIRMATION_CLOSE,
	OBJECTIVE_STACK_PLAN_CONFIRMATION_OPEN,
	OBJECTIVE_STACK_PLANNING_CUSTOM_TYPE,
	parseObjectiveStackImplArgs,
	prepareObjectiveStackImpl,
	storeConfirmedObjectiveStackPlan,
	type ObjectiveRecord,
	type ObjectiveStackImplFileSystem,
} from "../src/objective-stack-impl.ts";

const VALID_PLAN = `---
schema: asdl.stack-plan.v1
objective: stack-impl-e2e-smoke-test
planned_branches:
  - stack-impl-e2e-smoke-test/seed-fixture
---

Branch: stack-impl-e2e-smoke-test/seed-fixture
`;

const WRONG_OBJECTIVE_PLAN = `---
schema: asdl.stack-plan.v1
objective: other-objective
planned_branches:
  - other-objective/slice
---

Branch: other-objective/slice
`;

type ExpectedCommand = {
	command: string;
	args: string[];
	result: ExecResult;
};

type FakeObjectiveRecord = {
	closed?: boolean;
	objective?: string;
	roadmap?: string;
	updates?: Record<string, string>;
};

function result(stdout = "", code = 0, stderr = ""): ExecResult {
	return { stdout, stderr, code, killed: false };
}

function fakeExec(expectedCommands: ExpectedCommand[]): ExecFunction {
	return async (command, args) => {
		const expected = expectedCommands.shift();
		if (!expected) {
			throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
		}
		expect({ command, args }).toEqual({ command: expected.command, args: expected.args });
		return expected.result;
	};
}

function objectiveFileSystem(records: Record<string, FakeObjectiveRecord>): ObjectiveStackImplFileSystem {
	const files = new Map<string, string>();
	const directories = new Map<string, { name: string; isDirectory: boolean; isFile: boolean }[]>();
	const root = "/repo/.asdl/objectives";
	directories.set(
		root,
		Object.keys(records).map((slug) => ({ name: slug, isDirectory: true, isFile: false })),
	);

	for (const [slug, record] of Object.entries(records)) {
		const objectiveDir = `${root}/${slug}`;
		const entries: { name: string; isDirectory: boolean; isFile: boolean }[] = [];
		if (record.objective !== undefined) {
			files.set(`${objectiveDir}/objective.md`, record.objective);
			entries.push({ name: "objective.md", isDirectory: false, isFile: true });
		}
		if (record.roadmap !== undefined) {
			files.set(`${objectiveDir}/roadmap.md`, record.roadmap);
			entries.push({ name: "roadmap.md", isDirectory: false, isFile: true });
		}
		if (record.closed) {
			files.set(`${objectiveDir}/closed.md`, "closed\n");
			entries.push({ name: "closed.md", isDirectory: false, isFile: true });
		}
		const updates = record.updates ?? {};
		const updateEntries = Object.keys(updates).map((filename) => ({
			name: filename,
			isDirectory: false,
			isFile: true,
		}));
		if (updateEntries.length > 0) {
			entries.push({ name: "updates", isDirectory: true, isFile: false });
		}
		directories.set(objectiveDir, entries);
		directories.set(`${objectiveDir}/updates`, updateEntries);
		for (const [filename, content] of Object.entries(updates)) {
			files.set(`${objectiveDir}/updates/${filename}`, content);
		}
	}

	return {
		async readDir(path) {
			return directories.get(path) ?? [];
		},
		async isFile(path) {
			return files.has(path);
		},
		async readTextFile(path) {
			const content = files.get(path);
			if (content === undefined) {
				throw new Error(`Missing fake file: ${path}`);
			}
			return content;
		},
	};
}

function openObjectiveRecord(): FakeObjectiveRecord {
	return {
		objective: "# Smoke Objective\n\nObjective body.\n",
		roadmap: "# Roadmap\n\n- [ ] Do the work.\n",
		updates: {
			"2026-05-22-update.md": "# Update\n\nEarlier context.\n",
		},
	};
}

function promptRecord(): ObjectiveRecord {
	return {
		slug: "stack-impl-e2e-smoke-test",
		path: ".asdl/objectives/stack-impl-e2e-smoke-test",
		objectivePath: ".asdl/objectives/stack-impl-e2e-smoke-test/objective.md",
		roadmapPath: ".asdl/objectives/stack-impl-e2e-smoke-test/roadmap.md",
		objective: "# Smoke Objective\n",
		roadmap: "# Roadmap\n",
		updates: [],
	};
}

async function expectNoRemainingCommands(commands: ExpectedCommand[]): Promise<void> {
	expect(commands).toEqual([]);
}

describe("/objective-stack-impl preparation", () => {
	test("parses explicit slug", () => {
		expect(parseObjectiveStackImplArgs("stack-impl-e2e-smoke-test")).toEqual({
			replan: false,
			objectiveSlug: "stack-impl-e2e-smoke-test",
		});
		expect(parseObjectiveStackImplArgs("--replan stack-impl-e2e-smoke-test")).toEqual({
			replan: true,
			objectiveSlug: "stack-impl-e2e-smoke-test",
		});
	});

	test("non-UI missing slug errors", async () => {
		await expect(
			prepareObjectiveStackImpl("", {
				cwd: "/repo",
				exec: fakeExec([]),
				fileSystem: objectiveFileSystem({}),
			}),
		).rejects.toThrow(/Non-UI mode requires an explicit objective slug/);
	});

	test("UI missing slug lists open objectives and uses selected slug", async () => {
		const commands: ExpectedCommand[] = [
			{ command: "git", args: ["branch", "--show-current"], result: result("plan-branch\n") },
			{
				command: "brmem",
				args: [
					"check",
					"stack-impl-e2e-smoke-test.md",
					"--namespace",
					"stack-plans",
					"--branch",
					"plan-branch",
				],
				result: result("", 1),
			},
		];

		const prep = await prepareObjectiveStackImpl("", {
			cwd: "/repo",
			exec: fakeExec(commands),
			fileSystem: objectiveFileSystem({
				"closed-objective": { ...openObjectiveRecord(), closed: true },
				"stack-impl-e2e-smoke-test": openObjectiveRecord(),
			}),
			selectObjective: async (objectives) => {
				expect(objectives.map((objective) => objective.slug)).toEqual(["stack-impl-e2e-smoke-test"]);
				return "stack-impl-e2e-smoke-test";
			},
		});

		expect(prep.status).toBe("plan");
		if (prep.status === "plan") {
			expect(prep.slug).toBe("stack-impl-e2e-smoke-test");
		}
		await expectNoRemainingCommands(commands);
	});

	test("closed objectives are excluded", async () => {
		const objectives = await listOpenObjectives({
			cwd: "/repo",
			exec: fakeExec([]),
			fileSystem: objectiveFileSystem({
				closed: { ...openObjectiveRecord(), closed: true },
				open: openObjectiveRecord(),
			}),
		});

		expect(objectives.map((objective) => objective.slug)).toEqual(["open"]);
	});

	test("missing plan returns planning kickoff", async () => {
		const commands: ExpectedCommand[] = [
			{ command: "git", args: ["branch", "--show-current"], result: result("plan-branch\n") },
			{
				command: "brmem",
				args: [
					"check",
					"stack-impl-e2e-smoke-test.md",
					"--namespace",
					"stack-plans",
					"--branch",
					"plan-branch",
				],
				result: result("", 1),
			},
		];

		const prep = await prepareObjectiveStackImpl("stack-impl-e2e-smoke-test", {
			cwd: "/repo",
			exec: fakeExec(commands),
			fileSystem: objectiveFileSystem({ "stack-impl-e2e-smoke-test": openObjectiveRecord() }),
		});

		expect(prep.status).toBe("plan");
		if (prep.status === "plan") {
			expect(prep.planBranch).toBe("plan-branch");
			expect(prep.kickoffPrompt).toContain("You are planning");
			expect(prep.kickoffPrompt).toContain(".asdl/objectives/stack-impl-e2e-smoke-test/updates/2026-05-22-update.md");
			expect(prep.kickoffPrompt).toContain("Earlier context.");
		}
		await expectNoRemainingCommands(commands);
	});

	test("--replan returns planning kickoff even when plan exists", async () => {
		const commands: ExpectedCommand[] = [
			{ command: "git", args: ["branch", "--show-current"], result: result("plan-branch\n") },
			{
				command: "brmem",
				args: [
					"check",
					"stack-impl-e2e-smoke-test.md",
					"--namespace",
					"stack-plans",
					"--branch",
					"plan-branch",
				],
				result: result("present\n"),
			},
		];

		const prep = await prepareObjectiveStackImpl("--replan stack-impl-e2e-smoke-test", {
			cwd: "/repo",
			exec: fakeExec(commands),
			fileSystem: objectiveFileSystem({ "stack-impl-e2e-smoke-test": openObjectiveRecord() }),
		});

		expect(prep.status).toBe("plan");
		if (prep.status === "plan") {
			expect(prep.kickoffPrompt).toContain("total replacement");
			expect(prep.kickoffPrompt).toContain("explicitly confirm replacement");
		}
		await expectNoRemainingCommands(commands);
	});

	test("existing valid plan returns status run", async () => {
		const commands: ExpectedCommand[] = [
			{ command: "git", args: ["branch", "--show-current"], result: result("plan-branch\n") },
			{
				command: "brmem",
				args: [
					"check",
					"stack-impl-e2e-smoke-test.md",
					"--namespace",
					"stack-plans",
					"--branch",
					"plan-branch",
				],
				result: result("present\n"),
			},
			{
				command: "brmem",
				args: [
					"get",
					"stack-impl-e2e-smoke-test.md",
					"--namespace",
					"stack-plans",
					"--branch",
					"plan-branch",
				],
				result: result(VALID_PLAN),
			},
		];

		const prep = await prepareObjectiveStackImpl("stack-impl-e2e-smoke-test", {
			cwd: "/repo",
			exec: fakeExec(commands),
		});

		expect(prep.status).toBe("run");
		if (prep.status === "run") {
			expect(prep.planResult.plan.objective).toBe("stack-impl-e2e-smoke-test");
			expect(prep.planResult.locator).toEqual({
				branch: "plan-branch",
				namespace: "stack-plans",
				key: "stack-impl-e2e-smoke-test.md",
			});
		}
		await expectNoRemainingCommands(commands);
	});

	test("existing wrong-objective plan fails closed", async () => {
		const commands: ExpectedCommand[] = [
			{ command: "git", args: ["branch", "--show-current"], result: result("plan-branch\n") },
			{
				command: "brmem",
				args: [
					"check",
					"stack-impl-e2e-smoke-test.md",
					"--namespace",
					"stack-plans",
					"--branch",
					"plan-branch",
				],
				result: result("present\n"),
			},
			{
				command: "brmem",
				args: [
					"get",
					"stack-impl-e2e-smoke-test.md",
					"--namespace",
					"stack-plans",
					"--branch",
					"plan-branch",
				],
				result: result(WRONG_OBJECTIVE_PLAN),
			},
		];

		await expect(
			prepareObjectiveStackImpl("stack-impl-e2e-smoke-test", {
				cwd: "/repo",
				exec: fakeExec(commands),
			}),
		).rejects.toThrow(/Invalid existing plan/);
		await expectNoRemainingCommands(commands);
	});

	test("invalid existing plan fails closed", async () => {
		const commands: ExpectedCommand[] = [
			{ command: "git", args: ["branch", "--show-current"], result: result("plan-branch\n") },
			{
				command: "brmem",
				args: [
					"check",
					"stack-impl-e2e-smoke-test.md",
					"--namespace",
					"stack-plans",
					"--branch",
					"plan-branch",
				],
				result: result("present\n"),
			},
			{
				command: "brmem",
				args: [
					"get",
					"stack-impl-e2e-smoke-test.md",
					"--namespace",
					"stack-plans",
					"--branch",
					"plan-branch",
				],
				result: result("---\nschema: nope\n---\n\nbody\n"),
			},
		];

		await expect(
			prepareObjectiveStackImpl("stack-impl-e2e-smoke-test", {
				cwd: "/repo",
				exec: fakeExec(commands),
			}),
		).rejects.toThrow(/Invalid existing plan/);
		await expectNoRemainingCommands(commands);
	});

	test("planning prompt includes Branch Memory destination and marker-based continuation instruction", () => {
		const prompt = buildObjectiveStackPlanningPrompt({
			record: promptRecord(),
			planBranch: "plan-branch",
			replan: false,
		});

		expect(prompt).toContain(
			"Branch Memory namespace stack-plans, key stack-impl-e2e-smoke-test.md, branch plan-branch",
		);
		expect(prompt).toContain("Do not store the plan yourself and do not run `brmem put`");
		expect(prompt).toContain(OBJECTIVE_STACK_PLAN_CONFIRMATION_OPEN);
		expect(prompt).toContain(OBJECTIVE_STACK_PLAN_CONFIRMATION_CLOSE);
		expect(prompt).toContain("The extension will validate that marker content");
		expect(prompt).toContain("Do not create branches or edit implementation files");
	});

	test("extracts marker-wrapped confirmed plan content", () => {
		expect(
			extractObjectiveStackPlanConfirmation(
				`ignored\n${OBJECTIVE_STACK_PLAN_CONFIRMATION_OPEN}\n${VALID_PLAN}${OBJECTIVE_STACK_PLAN_CONFIRMATION_CLOSE}\nignored`,
			),
		).toBe(VALID_PLAN);
	});

	test("finds objective stack planning state from current session branch", () => {
		const state = findObjectiveStackPlanningState([
			{
				type: "custom",
				id: "entry-1",
				parentId: null,
				timestamp: "2026-05-22T00:00:00.000Z",
				customType: OBJECTIVE_STACK_PLANNING_CUSTOM_TYPE,
				data: { objective: "stack-impl-e2e-smoke-test", planBranch: "plan-branch", replan: false },
			},
		]);

		expect(state).toEqual({ objective: "stack-impl-e2e-smoke-test", planBranch: "plan-branch", replan: false });
	});

	test("stores confirmed plan through Branch Memory and returns a stack-impl plan result", async () => {
		const calls: Array<{ command: string; args: string[] }> = [];
		const exec: ExecFunction = async (command, args) => {
			calls.push({ command, args });
			if (command === "git") {
				expect(args).toEqual(["branch", "--show-current"]);
				return result("plan-branch\n");
			}
			if (command === "brmem" && args[0] === "check") {
				return result("", 1);
			}
			if (command === "brmem" && args[0] === "put") {
				const filePath = args.at(-1);
				expect(filePath).toBeDefined();
				expect(await readFile(filePath!, "utf8")).toBe(VALID_PLAN);
				return result();
			}
			throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
		};

		const stored = await storeConfirmedObjectiveStackPlan(
			VALID_PLAN,
			{ objective: "stack-impl-e2e-smoke-test", planBranch: "plan-branch", replan: false },
			{ cwd: "/repo", exec },
		);

		expect(stored.action).toBe("stored");
		expect(stored.locator).toEqual({
			branch: "plan-branch",
			namespace: "stack-plans",
			key: "stack-impl-e2e-smoke-test.md",
		});
		expect(calls.map((call) => `${call.command} ${call.args.slice(0, 2).join(" ")}`)).toEqual([
			"git branch --show-current",
			"brmem check stack-impl-e2e-smoke-test.md",
			"brmem put stack-impl-e2e-smoke-test.md",
		]);
	});
});
