import { describeBranchContextGraphiteCreationSteps } from "@nseng-ai/branch-context/api";
import { describe, expect, test } from "vitest";

import { buildRunnerChildPrompt } from "../../../src/runner/prompt.ts";

const REPORT_PATH = "/scratch/step-1-report.json";

const BASE_OPTIONS = {
	slug: "demo-objective",
	objectivePath: ".ns/objectives/demo-objective",
	mode: "default",
	baseBranch: "main",
	reportPath: REPORT_PATH,
} as const;

describe("buildRunnerChildPrompt", () => {
	test("default-mode prompt states the standing rules and JSON report contract", () => {
		const prompt = buildRunnerChildPrompt(BASE_OPTIONS);

		expect(prompt).toContain("Objective: demo-objective");
		expect(prompt).toContain("Objective record: .ns/objectives/demo-objective");
		expect(prompt).toContain("Base branch at dispatch: main");
		expect(prompt).toContain("exactly one focused, coherent implementation slice");
		expect(prompt).toContain(describeBranchContextGraphiteCreationSteps("main"));
		expect(prompt).toContain("Do not run `gt create`, `gt checkout`, `gt restack`");
		expect(prompt).toContain("use plain `git switch` instead of `gt checkout`");
		expect(prompt).toContain("Leave ALL changes uncommitted.");
		expect(prompt).toContain("the runner owns staging and the local commit");
		expect(prompt).toContain("the parent owns any later push/submit/handoff decision");
		expect(prompt).toContain("`gt submit`");
		expect(prompt).toContain("per the repo's prose validation policy");
		expect(prompt).toContain("`validation` section of your report");
		expect(prompt).toContain("objective-next workflow");
		expect(prompt).toContain(`\`${REPORT_PATH}\``);
		expect(prompt).toContain("containing only the JSON document");
		expect(prompt).toContain("never add it to git");
		expect(prompt).toContain("1-3 sentence summary");
		expect(prompt).toContain('"status": "<ready-for-parent-commit | stop | blocked>"');
		expect(prompt).toContain('"roadmapItems"');
		expect(prompt).toContain('"commitSubject"');
		expect(prompt).toContain('"commitBody"');
		expect(prompt).toContain('"objectiveImpact"');
	});

	test("recover prompt keeps the recover preamble and mode-sensitive branch value", () => {
		const prompt = buildRunnerChildPrompt({
			...BASE_OPTIONS,
			mode: "recover",
			baseBranch: "feature/demo-step",
			recoverContext: {
				branch: "feature/demo-step",
				changedPaths: ["src/a.ts"],
			},
		});

		expect(prompt).toContain("Recovery mode: a previous runner step failed");
		expect(prompt).toContain("dirty branch `feature/demo-step`");
		expect(prompt).toContain("Repair the attempt on this same branch.");
		expect(prompt).toContain("- src/a.ts");
		expect(prompt).toContain('"branch": "<the current branch>"');
		expect(prompt).toContain("Stay on the current dirty implementation branch.");
		expect(prompt).not.toContain("Failure diagnostics from the previous attempt");
		expect(prompt).not.toContain("Create your own implementation branch");
	});

	test("stays thin: no tracking-update instruction and no inlined objective content", () => {
		const prompt = buildRunnerChildPrompt(BASE_OPTIONS);

		expect(prompt).not.toContain("Semantic Update");
		expect(prompt).not.toContain("Update Objective tracking");
		expect(prompt).toContain("Do not expect Objective content in this prompt.");
		expect(prompt).not.toContain("Recovery mode");
		expect(prompt).not.toContain("Parent guidance");
	});

	test("passes guidance verbatim", () => {
		const guidance = "Focus on the parser only.\nSkip the CLI wiring.";
		const prompt = buildRunnerChildPrompt({
			...BASE_OPTIONS,
			guidance,
		});

		expect(prompt).toContain("Parent guidance");
		expect(prompt).toContain(guidance);
	});
});
