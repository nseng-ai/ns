import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import { definePlan, type DefinePlanInput } from "../src/index.ts";
import {
	TS_PLAN_RECIPE_TRUST_NOTICE,
	inspectTsPlanRecipeFromContent,
	previewTsPlanRecipeFromContent,
	renderTsPlanRecipeImplementationInstructionsFromContent,
} from "../src/host.ts";

const writtenByValidationPath = join(process.cwd(), "ts-plan-validation-should-not-run.txt");

class ClassPayload {
	readonly title = "class payload";
}

function defineInvalidPlan(input: unknown): void {
	definePlan(input as DefinePlanInput);
}

afterEach(async () => {
	await rm(writtenByValidationPath, { force: true });
});

describe("declarative recipes", () => {
	test("imports definePlan from the workspace package and renders a text preview", async () => {
		const result = await previewTsPlanRecipeFromContent(
			`import { definePlan } from "@asdl/ts-plans";

export default definePlan({
	title: "  Preview title  ",
	summary: " Summary text ",
	goal: " Build the thing ",
	context: " Existing context ",
	phases: [
		{ title: " Phase one ", prompt: " Prompt text ", tasks: [" Task A ", "Task B"] },
	],
});
`,
			{ key: "declarative-import", cwd: process.cwd() },
		);

		expect(result.type).toBe("success");
		if (result.type !== "success") return;
		expect(result.preview.title).toBe("Preview title");
		expect(result.preview.summary).toBe("Summary text");
		expect(result.preview.trustNotice).toBe(TS_PLAN_RECIPE_TRUST_NOTICE);
		expect(result.preview.content).toContain("# Preview title");
		expect(result.preview.content).toContain("Goal:\nBuild the thing");
		expect(result.preview.content).toContain("Context:\nExisting context");
		expect(result.preview.content).toContain("1. Phase one");
		expect(result.preview.content).toContain("- Task: Task A");
	});

	test("inspects a structured model without rendering text", async () => {
		const result = await inspectTsPlanRecipeFromContent(
			`import { definePlan } from "@asdl/ts-plans";

export default definePlan({
	title: "  Inspect title  ",
	summary: " Inspect summary ",
	goal: " Inspect goal ",
	context: " Inspect context ",
	phases: [
		{ title: " Phase one ", prompt: " Phase prompt ", tasks: [" Task A ", "Task B"] },
	],
});
`,
			{ key: "declarative-inspect", cwd: process.cwd() },
		);

		expect(result.type).toBe("success");
		if (result.type !== "success") return;
		expect(result.trustNotice).toBe(TS_PLAN_RECIPE_TRUST_NOTICE);
		expect(result.model).toEqual({
			title: "Inspect title",
			summary: "Inspect summary",
			goal: "Inspect goal",
			context: "Inspect context",
			phases: [
				{
					title: "Phase one",
					prompt: "Phase prompt",
					tasks: ["Task A", "Task B"],
					notes: [],
					validations: [],
				},
			],
			finalItems: [],
		});
	});

	test("allows empty tasks when prompt is non-empty", () => {
		expect(() =>
			definePlan({
				goal: "Goal",
				phases: [{ title: "Phase", prompt: "Use judgment", tasks: [] }],
			}),
		).not.toThrow();
	});
});

describe("recipe module rejection", () => {
	test("rejects raw default-exported functions", async () => {
		const result = await previewTsPlanRecipeFromContent("export default function recipe() {}", {
			key: "raw-function",
			cwd: process.cwd(),
		});

		expect(result.type).toBe("failure");
		if (result.type !== "failure") return;
		expect(result.message).toContain("Raw default-exported functions");
	});

	test("rejects missing default exports", async () => {
		const result = await previewTsPlanRecipeFromContent("export const value = 1;", {
			key: "missing-default",
			cwd: process.cwd(),
		});

		expect(result.type).toBe("failure");
		if (result.type !== "failure") return;
		expect(result.message).toContain("default export");
	});

	test("rejects metadata-only modules", async () => {
		const result = await previewTsPlanRecipeFromContent("export const metadata = { title: 'x' };", {
			key: "metadata-only",
			cwd: process.cwd(),
		});

		expect(result.type).toBe("failure");
		if (result.type !== "failure") return;
		expect(result.message).toContain("metadata exports");
	});
});

describe("declarative payload validation", () => {
	const validPlan = {
		goal: "Goal",
		phases: [{ title: "Phase", tasks: ["Task"] }],
	};

	test("rejects empty goals", () => {
		expect(() => definePlan({ ...validPlan, goal: " " })).toThrow("plan.goal must be non-empty");
	});

	test("rejects missing phases", () => {
		expect(() => definePlan({ goal: "Goal", phases: [] })).toThrow("plan.phases must contain");
	});

	test("rejects bad titles", () => {
		expect(() => definePlan({ ...validPlan, title: " " })).toThrow("plan.title must be non-empty");
	});

	test("rejects non-string tasks", () => {
		expect(() =>
			defineInvalidPlan({
				goal: "Goal",
				phases: [{ title: "Phase", tasks: ["Task", 1] }],
			}),
		).toThrow("tasks[1] must be a string");
	});

	test("rejects Dates", () => {
		expect(() => defineInvalidPlan({ ...validPlan, context: new Date() })).toThrow("plan.context must be a string");
	});

	test("rejects Maps", () => {
		expect(() => defineInvalidPlan(new Map())).toThrow("plain object");
	});

	test("rejects functions", () => {
		expect(() => defineInvalidPlan({ ...validPlan, summary: () => "bad" })).toThrow("plan.summary must be JSON-like data");
	});

	test("rejects class instances", () => {
		expect(() => defineInvalidPlan(new ClassPayload())).toThrow("plain object");
	});
});

describe("imperative recipes", () => {
	test("renders phases, notes, validations, cwd, and signal", async () => {
		const result = await previewTsPlanRecipeFromContent(
			`import { planRecipe } from "@asdl/ts-plans";

export default planRecipe({ title: "Imperative", summary: "Runtime summary" }, async (plan) => {
	plan.goal("Build the imperative plan");
	plan.context("Runtime context");
	plan.note("cwd=" + plan.cwd);
	plan.note("signal=" + String(plan.signal instanceof AbortSignal));
	await plan.phase("Runtime phase", async () => {
		plan.task("Do the runtime task");
		plan.note("Remember this");
		plan.validateWithShell("echo validate only");
	});
	plan.task("Final task");
	plan.validateWithShell("touch ${writtenByValidationPath}");
});
`,
			{ key: "imperative", cwd: process.cwd(), signal: new AbortController().signal },
		);

		expect(result.type).toBe("success");
		if (result.type !== "success") return;
		expect(result.preview.content).toContain("# Imperative");
		expect(result.preview.content).toContain("Goal:\nBuild the imperative plan");
		expect(result.preview.content).toContain("Context:\nRuntime context");
		expect(result.preview.content).toContain(`cwd=${process.cwd()}`);
		expect(result.preview.content).toContain("signal=true");
		expect(result.preview.content).toContain("1. Runtime phase");
		expect(result.preview.content).toContain("- Validation: echo validate only");
		expect(result.preview.content).toContain(`- Validation: touch ${writtenByValidationPath}`);
		expect(existsSync(writtenByValidationPath)).toBe(false);
	});

	test("inspects phases, notes, validations, final items, cwd, and signal", async () => {
		const result = await inspectTsPlanRecipeFromContent(
			`import { planRecipe } from "@asdl/ts-plans";

export default planRecipe({ title: "Imperative", summary: "Runtime summary" }, async (plan) => {
	plan.goal("Build the imperative plan");
	plan.context("Runtime context");
	plan.note("cwd=" + plan.cwd);
	plan.note("signal=" + String(plan.signal instanceof AbortSignal));
	await plan.phase("Runtime phase", async () => {
		plan.task("Do the runtime task");
		plan.note("Remember this");
		plan.validateWithShell("echo validate only");
	});
	plan.task("Final task");
	plan.validateWithShell("touch ${writtenByValidationPath}");
});
`,
			{ key: "imperative-inspect", cwd: process.cwd(), signal: new AbortController().signal },
		);

		expect(result.type).toBe("success");
		if (result.type !== "success") return;
		expect(result.model.title).toBe("Imperative");
		expect(result.model.summary).toBe("Runtime summary");
		expect(result.model.goal).toBe("Build the imperative plan");
		expect(result.model.context).toBe("Runtime context");
		expect(result.model.phases).toEqual([
			{
				title: "Runtime phase",
				tasks: ["Do the runtime task"],
				notes: ["Remember this"],
				validations: ["echo validate only"],
			},
		]);
		expect(result.model.finalItems).toEqual([
			{ type: "note", text: `cwd=${process.cwd()}` },
			{ type: "note", text: "signal=true" },
			{ type: "task", prompt: "Final task" },
			{ type: "validation", command: `touch ${writtenByValidationPath}` },
		]);
		expect(existsSync(writtenByValidationPath)).toBe(false);
	});

	test("aborted signal returns failure", async () => {
		const controller = new AbortController();
		controller.abort();

		const result = await previewTsPlanRecipeFromContent(
			`import { planRecipe } from "@asdl/ts-plans";
export default planRecipe({}, () => {});
`,
			{ key: "aborted", cwd: process.cwd(), signal: controller.signal },
		);

		expect(result.type).toBe("failure");
		if (result.type !== "failure") return;
		expect(result.message).toContain("aborted");
	});
});

describe("renderers", () => {
	test("text preview includes trust notice separately", async () => {
		const result = await previewTsPlanRecipeFromContent(
			`import { definePlan } from "@asdl/ts-plans";
export default definePlan({ title: "Text", goal: "Goal", phases: [{ title: "Phase", tasks: ["Task"] }] });
`,
			{ key: "text", cwd: process.cwd(), format: "text" },
		);

		expect(result.type).toBe("success");
		if (result.type !== "success") return;
		expect(result.preview.format).toBe("text");
		expect(result.preview.content).toContain("Goal:\nGoal");
		expect(result.preview.trustNotice).toBe(TS_PLAN_RECIPE_TRUST_NOTICE);
	});

	test("mermaid preview returns pure flowchart content with separate trust notice", async () => {
		const result = await previewTsPlanRecipeFromContent(
			`import { definePlan } from "@asdl/ts-plans";
export default definePlan({ title: "Mermaid [Plan]", goal: "Goal", phases: [{ title: "Phase \\"A\\"", tasks: ["Task\\nOne"] }] });
`,
			{ key: "mermaid", cwd: process.cwd(), format: "mermaid" },
		);

		expect(result.type).toBe("success");
		if (result.type !== "success") return;
		expect(result.preview.format).toBe("mermaid");
		expect(result.preview.content.startsWith("flowchart TD")).toBe(true);
		expect(result.preview.content).toContain("Mermaid (Plan)");
		expect(result.preview.content).toContain('Phase \\"A\\"');
		expect(result.preview.content).not.toContain("Trust boundary");
		expect(result.preview.trustNotice).toBe(TS_PLAN_RECIPE_TRUST_NOTICE);
	});

	test("implementation instruction rendering uses text content", async () => {
		const result = await renderTsPlanRecipeImplementationInstructionsFromContent(
			`import { definePlan } from "@asdl/ts-plans";
export default definePlan({ title: "Impl", summary: "Summary", goal: "Goal", phases: [{ title: "Phase", tasks: ["Task"] }] });
`,
			{ key: "impl", cwd: process.cwd() },
		);

		expect(result.type).toBe("success");
		if (result.type !== "success") return;
		expect(result.title).toBe("Impl");
		expect(result.summary).toBe("Summary");
		expect(result.instructions).toContain("Goal:\nGoal");
		expect(result.trustNotice).toBe(TS_PLAN_RECIPE_TRUST_NOTICE);
	});
});
