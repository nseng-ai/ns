import { describeBranchContextGraphiteCreationSteps } from "@sdl/branch-context/api";
import { describe, expect, test } from "vitest";

import { buildRunnerChildPrompt } from "../../../src/runner/prompt.ts";
import {
	OBJECTIVE_RUNNER_REPORT_BEGIN,
	OBJECTIVE_RUNNER_REPORT_END,
} from "../../../src/runner/report.ts";

describe("buildRunnerChildPrompt", () => {
	test("default-mode prompt states the standing rules and report contract", () => {
		const prompt = buildRunnerChildPrompt({
			slug: "demo-objective",
			objectivePath: ".sdl/objectives/demo-objective",
			mode: "default",
			baseBranch: "main",
		});

		expect(prompt).toContain("Objective: demo-objective");
		expect(prompt).toContain("Objective record: .sdl/objectives/demo-objective");
		expect(prompt).toContain("Base branch at dispatch: main");
		expect(prompt).toContain("exactly one focused, coherent implementation slice");
		expect(prompt).toContain(describeBranchContextGraphiteCreationSteps("main"));
		expect(prompt).toContain("Do not run `gt create`, `gt checkout`, `gt restack`");
		expect(prompt).toContain("use plain `git switch` instead of `gt checkout`");
		expect(prompt).toContain("Leave ALL changes uncommitted.");
		expect(prompt).toContain("the runner owns staging and commit");
		expect(prompt).toContain("per the repo's prose validation policy");
		expect(prompt).toContain("objective-next workflow");
		expect(prompt).toContain(OBJECTIVE_RUNNER_REPORT_BEGIN);
		expect(prompt).toContain(OBJECTIVE_RUNNER_REPORT_END);
		expect(prompt).toContain("status: ready-for-parent-commit | stop | blocked");
		expect(prompt).toContain("roadmapItems:");
		expect(prompt).toContain("commitSubject:");
		expect(prompt).toContain("commitBody:");
		expect(prompt).toContain("## Validation");
	});

	test("stays thin: no tracking-update instruction and no inlined objective content", () => {
		const prompt = buildRunnerChildPrompt({
			slug: "demo-objective",
			objectivePath: ".sdl/objectives/demo-objective",
			mode: "default",
			baseBranch: "main",
		});

		expect(prompt).not.toContain("Semantic Update");
		expect(prompt).not.toContain("Update Objective tracking");
		expect(prompt).toContain("Do not expect Objective content in this prompt.");
		expect(prompt).not.toContain("Recovery mode");
		expect(prompt).not.toContain("Parent guidance");
	});

	test("passes guidance verbatim", () => {
		const guidance = "Focus on the parser only.\nSkip the CLI wiring.";
		const prompt = buildRunnerChildPrompt({
			slug: "demo-objective",
			objectivePath: ".sdl/objectives/demo-objective",
			mode: "default",
			baseBranch: "main",
			guidance,
		});

		expect(prompt).toContain("Parent guidance");
		expect(prompt).toContain(guidance);
	});

	test("recover-mode prompt carries the dirty-branch preamble and same-branch rule", () => {
		const prompt = buildRunnerChildPrompt({
			slug: "demo-objective",
			objectivePath: ".sdl/objectives/demo-objective",
			mode: "recover",
			baseBranch: "feature/demo-step",
			recoverContext: {
				branch: "feature/demo-step",
				changedPaths: ["src/a.ts", "src/b.ts"],
				diagnostics: "Verification failed: worktree-dirty",
			},
		});

		expect(prompt).toContain("Recovery mode: a previous runner step failed");
		expect(prompt).toContain("dirty branch `feature/demo-step`");
		expect(prompt).toContain("Repair the attempt on this same branch.");
		expect(prompt).toContain("- src/a.ts");
		expect(prompt).toContain("- src/b.ts");
		expect(prompt).toContain("Verification failed: worktree-dirty");
		expect(prompt).toContain("Stay on the current branch.");
		expect(prompt).not.toContain("Create your own implementation branch");
	});
});
