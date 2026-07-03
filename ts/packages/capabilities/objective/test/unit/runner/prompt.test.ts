import { describeBranchContextGraphiteCreationSteps } from "@sdl/branch-context/api";
import { describe, expect, test } from "vitest";

import { buildRunnerChildPrompt } from "../../../src/runner/prompt.ts";
// ADR0024-LEGACY-DELETE(import): marker constants feed only the marker-channel
// test cases; when the marker arm is deleted, rewrite those cases against the
// json-file channel (or drop the ones that only assert marker specifics).
import {
	OBJECTIVE_RUNNER_REPORT_BEGIN,
	OBJECTIVE_RUNNER_REPORT_END,
} from "../../../src/runner/report-marker.ts";

const REPORT_PATH = "/scratch/step-1-report.json";

describe("buildRunnerChildPrompt", () => {
	test("default-mode marker prompt states the standing rules and report contract", () => {
		const prompt = buildRunnerChildPrompt({
			slug: "demo-objective",
			objectivePath: ".sdl/objectives/demo-objective",
			mode: "default",
			baseBranch: "main",
			reportChannel: { type: "marker" },
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
		expect(prompt).toContain("`## Validation` section of your report");
		expect(prompt).toContain("objective-next workflow");
		expect(prompt).toContain(OBJECTIVE_RUNNER_REPORT_BEGIN);
		expect(prompt).toContain(OBJECTIVE_RUNNER_REPORT_END);
		expect(prompt).toContain("status: ready-for-parent-commit | stop | blocked");
		expect(prompt).toContain("roadmapItems:");
		expect(prompt).toContain("commitSubject:");
		expect(prompt).toContain("commitBody:");
		expect(prompt).toContain("## Validation");
	});

	test("json-file prompt swaps only the report contract for the file instruction", () => {
		const base = {
			slug: "demo-objective",
			objectivePath: ".sdl/objectives/demo-objective",
			mode: "default",
			baseBranch: "main",
		} as const;
		const prompt = buildRunnerChildPrompt({
			...base,
			reportChannel: { type: "json-file", reportPath: REPORT_PATH },
		});

		// Report medium changes...
		expect(prompt).toContain(`\`${REPORT_PATH}\``);
		expect(prompt).toContain("containing only the JSON document");
		expect(prompt).toContain("never add it to git");
		expect(prompt).toContain("1-3 sentence summary");
		expect(prompt).toContain('"status": "<ready-for-parent-commit | stop | blocked>"');
		expect(prompt).toContain('"objectiveImpact"');
		expect(prompt).toContain("`validation` section of your report");
		expect(prompt).not.toContain(OBJECTIVE_RUNNER_REPORT_BEGIN);
		expect(prompt).not.toContain(OBJECTIVE_RUNNER_REPORT_END);

		// ...while the shared rules are identical between channels.
		const markerPrompt = buildRunnerChildPrompt({ ...base, reportChannel: { type: "marker" } });
		for (const sharedRule of [
			"exactly one focused, coherent implementation slice",
			describeBranchContextGraphiteCreationSteps("main"),
			"Do not run `gt create`, `gt checkout`, `gt restack`",
			"Leave ALL changes uncommitted.",
			"the runner owns staging and commit",
			"Do not expect Objective content in this prompt.",
		]) {
			expect(prompt).toContain(sharedRule);
			expect(markerPrompt).toContain(sharedRule);
		}
	});

	test("json-file recover prompt keeps the recover preamble and mode-sensitive branch value", () => {
		const prompt = buildRunnerChildPrompt({
			slug: "demo-objective",
			objectivePath: ".sdl/objectives/demo-objective",
			mode: "recover",
			baseBranch: "feature/demo-step",
			reportChannel: { type: "json-file", reportPath: REPORT_PATH },
			recoverContext: {
				branch: "feature/demo-step",
				changedPaths: ["src/a.ts"],
			},
		});

		expect(prompt).toContain("Recovery mode: a previous runner step failed");
		expect(prompt).toContain('"branch": "<the current branch>"');
		expect(prompt).toContain("Stay on the current branch.");
	});

	test("stays thin: no tracking-update instruction and no inlined objective content", () => {
		const prompt = buildRunnerChildPrompt({
			slug: "demo-objective",
			objectivePath: ".sdl/objectives/demo-objective",
			mode: "default",
			baseBranch: "main",
			reportChannel: { type: "marker" },
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
			reportChannel: { type: "marker" },
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
			reportChannel: { type: "marker" },
			recoverContext: {
				branch: "feature/demo-step",
				changedPaths: ["src/a.ts", "src/b.ts"],
			},
		});

		expect(prompt).toContain("Recovery mode: a previous runner step failed");
		expect(prompt).toContain("dirty branch `feature/demo-step`");
		expect(prompt).toContain("Repair the attempt on this same branch.");
		expect(prompt).toContain("- src/a.ts");
		expect(prompt).toContain("- src/b.ts");
		expect(prompt).not.toContain("Failure diagnostics from the previous attempt");
		expect(prompt).toContain("Stay on the current branch.");
		expect(prompt).not.toContain("Create your own implementation branch");
	});
});
