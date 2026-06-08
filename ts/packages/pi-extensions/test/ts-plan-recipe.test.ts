import { describe, expect, test } from "bun:test";

import {
	previewTsPlanRecipeFromContent,
	renderTsPlanRecipeImplementationInstructionsFromContent,
} from "@asdl/ts-plans/host";
import { buildImplTsPlannedBranchPrompt } from "../src/planned-branch/ts-recipe-runtime.ts";

const PLAN_CONTENT = `import { definePlan } from "@asdl/ts-plans";

export default definePlan({
  title: "Prototype TypeScript recipes",
  summary: "Render recipe calls into an implementation prompt.",
  goal: "Prototype TypeScript source-of-truth planned-branch recipes",
  context: "Markdown planned-branch flows must keep working.",
  phases: [
    {
      title: "Implementation",
      tasks: [
        "Read existing planned-branch implementation loading.",
        "Evaluate the recipe with @asdl/ts-plans host rendering.",
      ],
    },
    {
      title: "Validation",
      tasks: ["Run cd ts && bun test --sequential packages/pi-extensions/test/ts-plan-recipe.test.ts"],
    },
  ],
});
`;

describe("TypeScript planned-branch recipe host integration", () => {
	test("previews a definePlan recipe through @asdl/ts-plans", async () => {
		const result = await previewTsPlanRecipeFromContent(PLAN_CONTENT, {
			key: "prototype-typescript-recipes.plan.ts",
			cwd: "/repo",
		});

		expect(result.type).toBe("success");
		if (result.type !== "success") return;
		expect(result.preview.title).toBe("Prototype TypeScript recipes");
		expect(result.preview.summary).toBe("Render recipe calls into an implementation prompt.");
		expect(result.preview.trustNotice).toContain("trusted TypeScript code with local system permissions");
		expect(result.preview.content).toContain("# Prototype TypeScript recipes");
		expect(result.preview.content).toContain("Goal:\nPrototype TypeScript source-of-truth planned-branch recipes");
		expect(result.preview.content).toContain("1. Implementation");
		expect(result.preview.content).toContain("- Task: Evaluate the recipe with @asdl/ts-plans host rendering.");
	});

	test("renders Mermaid preview content without embedding the trust notice", async () => {
		const result = await previewTsPlanRecipeFromContent(PLAN_CONTENT, {
			key: "prototype-typescript-recipes.plan.ts",
			cwd: "/repo",
			format: "mermaid",
		});

		expect(result.type).toBe("success");
		if (result.type !== "success") return;
		expect(result.preview.format).toBe("mermaid");
		expect(result.preview.content.startsWith("flowchart TD")).toBe(true);
		expect(result.preview.content).not.toContain("Trust boundary");
		expect(result.preview.trustNotice).toContain("Trust boundary");
	});

	test("rejects old raw default-exported function recipes clearly", async () => {
		const result = await previewTsPlanRecipeFromContent("export default async function plan() {}", {
			key: "raw-function.plan.ts",
			cwd: "/repo",
		});

		expect(result.type).toBe("failure");
		if (result.type !== "failure") return;
		expect(result.message).toContain("Raw default-exported functions are not supported");
	});

	test("rejects old metadata exports clearly", async () => {
		const result = await renderTsPlanRecipeImplementationInstructionsFromContent(
			`import { definePlan } from "@asdl/ts-plans";
export const metadata = { title: "Old" };
export default definePlan({ goal: "Goal", phases: [{ title: "Phase", tasks: ["Task"] }] });
`,
			{ key: "metadata.plan.ts", cwd: "/repo" },
		);

		expect(result.type).toBe("failure");
		if (result.type !== "failure") return;
		expect(result.message).toContain("Named metadata exports are not supported");
	});

	test("builds an implementation prompt from loaded attached plan evidence", async () => {
		const prompt = await buildImplTsPlannedBranchPrompt(
			{
				branch: "planned-branches/prototype-typescript-recipes",
				namespace: "planned-branch",
				selectedKey: "prototype-typescript-recipes.plan.ts",
				refName: "refs/brmem/ns/planned-branch/planned-branches---prototype-typescript-recipes:prototype-typescript-recipes.plan.ts",
				content: PLAN_CONTENT,
				byteCount: new TextEncoder().encode(PLAN_CONTENT).length,
				availableKeys: ["prototype-typescript-recipes.plan.ts"],
				source: "attached",
			},
			{ cwd: "/repo" },
		);

		expect(prompt).toContain("# planned-branch TypeScript recipe implementation");
		expect(prompt).toContain("Selected key: prototype-typescript-recipes.plan.ts");
		expect(prompt).toContain("Treat the `.plan.ts` source as the source of truth");
		expect(prompt).toContain("validateWithShell` records validation commands and does not execute them");
		expect(prompt).toContain("- Task: Evaluate the recipe with @asdl/ts-plans host rendering.");
	});
});
