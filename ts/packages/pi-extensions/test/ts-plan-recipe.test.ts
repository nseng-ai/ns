import { describe, expect, test } from "bun:test";

import { buildImplTsPlannedBranchPrompt, loadTsPlanRecipeFromContent, renderTsPlanRecipe } from "../src/planned-branch/ts-recipe-runtime.ts";

const PLAN_CONTENT = `export const metadata = {
  title: "Prototype TypeScript recipes",
  summary: "Render recipe calls into an implementation prompt.",
};

export default async function plan(pi) {
  pi.goal("Prototype TypeScript source-of-truth planned-branch recipes");
  await pi.context("Markdown planned-branch flows must keep working.");
  await pi.phase("Implementation", async () => {
    await pi.task("Add recipe rendering", async () => {
      await pi.inspect("Read existing planned-branch implementation loading.");
      await pi.do("Evaluate the recipe with a recording runtime.");
      await pi.acceptance("/planned-branch:impl-ts sends a rendered prompt.");
    });
  });
  await pi.shell("cd ts && bun test --sequential packages/pi-extensions/test/ts-plan-recipe.test.ts");
}
`;

describe("TypeScript planned-branch recipe runtime", () => {
	test("loads and renders a default-export async recipe", async () => {
		const recipe = await loadTsPlanRecipeFromContent(PLAN_CONTENT, { key: "prototype-typescript-recipes.plan.ts", cwd: "/repo" });
		const rendered = await renderTsPlanRecipe(recipe, { cwd: "/repo" });

		expect(rendered.metadata).toEqual({
			title: "Prototype TypeScript recipes",
			summary: "Render recipe calls into an implementation prompt.",
		});
		expect(rendered.events.map((event) => event.type)).toEqual(["goal", "context", "phase", "task", "inspect", "do", "acceptance", "shell"]);
		expect(rendered.prompt).toContain("Title: Prototype TypeScript recipes");
		expect(rendered.prompt).toContain("## Phase: Implementation");
		expect(rendered.prompt).toContain("- Do: Evaluate the recipe with a recording runtime.");
		expect(rendered.prompt).toContain("Validate with shell: cd ts && bun test --sequential");
	});

	test("renders a degenerate freeform pi.do recipe", async () => {
		const recipe = await loadTsPlanRecipeFromContent(
			`export default async function plan(pi) { await pi.do(\`Implement this freeform plan.\`); }`,
			{ key: "freeform-plan.plan.ts", cwd: "/repo" },
		);
		const rendered = await renderTsPlanRecipe(recipe, { cwd: "/repo" });

		expect(rendered.prompt).toContain("- Do: Implement this freeform plan.");
	});

	test("rejects missing default function exports", async () => {
		await expect(loadTsPlanRecipeFromContent("export const metadata = {};", { key: "bad.plan.ts", cwd: "/repo" })).rejects.toThrow(
			"default-export a function",
		);
	});

	test("wraps recipe evaluation failures", async () => {
		const recipe = await loadTsPlanRecipeFromContent(
			`export default async function plan() { throw new Error("boom"); }`,
			{ key: "throws.plan.ts", cwd: "/repo" },
		);

		await expect(renderTsPlanRecipe(recipe, { cwd: "/repo" })).rejects.toThrow("Failed to evaluate trusted TypeScript planned-branch recipe");
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
		expect(prompt).toContain("- Acceptance: /planned-branch:impl-ts sends a rendered prompt.");
	});
});
