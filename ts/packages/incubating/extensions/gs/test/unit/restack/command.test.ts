import { describe, expect, test } from "vitest";

import {
	gsRestackRequestSchema,
	gsRestackResultSchema,
	renderGsRestackHuman,
	runGsRestackResolve,
	type GsRestackGitState,
} from "../../../src/core/index.ts";
import {
	InMemoryGsRestackGitGateway,
	InMemoryGsRestackGateway,
	type InMemoryGsRestackOptions,
} from "../../../src/core/testing/index.ts";

const clean: GsRestackGitState = {
	branch: "feature",
	operation: "none",
	clean: true,
	unmergedPaths: [],
	hasStagedChanges: false,
};
const completed: GsRestackGitState = { ...clean };
const interaction = {
	isInteractive: () => false,
	confirm: async () => false,
};

describe("GS restack-resolve", () => {
	test("request and result schemas are strict", () => {
		expect(gsRestackRequestSchema.safeParse({ full: false, yes: true, extra: 1 }).success).toBe(
			false,
		);
		const result = resultData();
		expect(gsRestackResultSchema.safeParse({ ...result, extra: 1 }).success).toBe(false);
		expect(gsRestackResultSchema.safeParse(result).success).toBe(true);
	});

	test("refuses version drift before mutation", async () => {
		const scenario = createScenario({ before: clean, version: "0.2.0" });
		const result = await runGsRestackResolve(scenario.context, interaction, {
			full: false,
			yes: true,
		});
		expect(result.status).toBe("negative");
		expect(result.data).toMatchObject({ observedVersion: "0.2.0", outcome: "refused" });
		expect(scenario.restack.mutations).toEqual([]);
	});

	test.each([
		[{ ...clean, clean: false }, "clean-worktree"],
		[{ ...clean, branch: null }, "checkout-named-branch"],
		[{ ...clean, operation: "merge" as const }, "finish-active-operation"],
	])("guards unsafe start state", async (before, action) => {
		const scenario = createScenario({ before });
		const result = await runGsRestackResolve(scenario.context, interaction, {
			full: false,
			yes: true,
		});
		expect(result.status).toBe("negative");
		expect(result.data).toMatchObject({ recovery: { action } });
		expect(scenario.restack.mutations).toEqual([]);
	});

	test("requires --yes noninteractively and prompts on a TTY", async () => {
		const denied = createScenario({ before: clean });
		const missing = await runGsRestackResolve(denied.context, interaction, {
			full: false,
			yes: false,
		});
		expect(missing.status).toBe("usage-error");
		expect(missing.data).toMatchObject({ recovery: { action: "authorize-rewrite" } });

		let prompts = 0;
		const allowed = createScenario({ before: clean, after: completed });
		const result = await runGsRestackResolve(
			allowed.context,
			{
				isInteractive: () => true,
				confirm: async () => {
					prompts += 1;
					return true;
				},
			},
			{ full: false, yes: false },
		);
		expect(result.status).toBe("success");
		expect(prompts).toBe(1);
		expect(allowed.restack.mutations).toEqual(["start-downstack"]);
	});

	test.each([
		[false, "start-downstack"],
		[true, "start-full"],
	] as const)("completes one start mutation", async (full, mutation) => {
		const scenario = createScenario({ before: clean, after: completed });
		const result = await runGsRestackResolve(scenario.context, interaction, {
			full,
			yes: true,
		});
		expect(result.status).toBe("success");
		expect(result.data).toMatchObject({ outcome: "completed" });
		expect(scenario.restack.mutations).toEqual([mutation]);
	});

	test("requires a resolved and staged continuation and rejects full", async () => {
		const unresolved = createScenario({
			before: { ...clean, branch: null, operation: "rebase", clean: false, unmergedPaths: ["a"] },
		});
		const stopped = await runGsRestackResolve(unresolved.context, interaction, {
			full: false,
			yes: true,
		});
		expect(stopped.data).toMatchObject({ outcome: "conflict-stopped" });

		const unstaged = createScenario({
			before: { ...clean, branch: null, operation: "rebase", clean: false },
		});
		expect(
			(
				await runGsRestackResolve(unstaged.context, interaction, {
					full: false,
					yes: true,
				})
			).data,
		).toMatchObject({ recovery: { action: "stage-resolution" } });

		const active = createScenario({
			before: { ...clean, branch: null, operation: "rebase", clean: false, hasStagedChanges: true },
		});
		expect(
			(
				await runGsRestackResolve(active.context, interaction, {
					full: true,
					yes: true,
				})
			).status,
		).toBe("usage-error");
	});

	test("continues exactly once to completion", async () => {
		const scenario = createScenario({
			before: {
				...clean,
				branch: null,
				operation: "rebase",
				clean: false,
				hasStagedChanges: true,
			},
			after: completed,
		});
		const result = await runGsRestackResolve(scenario.context, interaction, {
			full: false,
			yes: true,
		});
		expect(result.status).toBe("success");
		expect(result.data).toMatchObject({ outcome: "completed", mode: "continue" });
		expect(scenario.restack.mutations).toEqual(["continue"]);
	});

	test("continues once and reports a second conflict stop", async () => {
		const scenario = createScenario({
			before: { ...clean, branch: null, operation: "rebase", clean: false, hasStagedChanges: true },
			after: {
				...clean,
				branch: null,
				operation: "rebase",
				clean: false,
				unmergedPaths: ["next", ...Array.from({ length: 30 }, (_, index) => `p${index}`)],
			},
		});
		const result = await runGsRestackResolve(scenario.context, interaction, {
			full: false,
			yes: true,
		});
		expect(result.status).toBe("negative");
		expect(result.data).toMatchObject({ outcome: "conflict-stopped", mode: "continue" });
		expect(gsRestackResultSchema.parse(result.data).unmergedPaths).toHaveLength(20);
		expect(scenario.restack.mutations).toEqual(["continue"]);
	});

	test("bounds diagnostics and renders recovery last", async () => {
		const scenario = createScenario({
			before: clean,
			after: { ...clean, clean: false },
			restackDiagnostic: {
				command: "gh stack rebase --no-trunk",
				termination: "exit-1",
				stdout: "out",
				stderr: "error",
			},
		});
		const result = await runGsRestackResolve(scenario.context, interaction, {
			full: false,
			yes: true,
		});
		expect(result.status).toBe("negative");
		const data = gsRestackResultSchema.parse(result.data);
		expect(data.diagnostic).toMatchObject({ termination: "exit-1" });
		expect(renderGsRestackHuman(data).split("\n").at(-1)).toMatch(/^Recovery:/u);
		expect(scenario.restack.mutations).toHaveLength(1);
	});
});

function createScenario(options: InMemoryGsRestackOptions) {
	const restack = new InMemoryGsRestackGateway(options);
	return {
		restack,
		context: { restack, git: new InMemoryGsRestackGitGateway(options) },
	};
}

function resultData() {
	return {
		outcome: "completed" as const,
		mode: "start" as const,
		requestedScope: "full" as const,
		observedVersion: "0.1.0",
		currentOperation: "none" as const,
		branch: { state: "named" as const, name: "feature" },
		unmergedPaths: [],
		hasStagedChanges: false,
		recovery: { action: "none" as const, instruction: "Continue." },
		diagnostic: null,
	};
}
