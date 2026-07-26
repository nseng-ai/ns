import { describe, expect, test } from "vitest";

import { renderRunnerCheckpoint, type CheckpointFacts } from "../../../src/runner/checkpoint.ts";

const BASE_FACTS: CheckpointFacts = {
	slug: "demo-objective",
	mode: "default",
	status: "committed",
	baseBranch: "main",
	branch: "feature/demo-step",
};

describe("renderRunnerCheckpoint", () => {
	test("renders both zones with the verified facts first", () => {
		const markdown = renderRunnerCheckpoint(
			{
				...BASE_FACTS,
				commitSha: "abc123",
				changedPaths: ["src/a.ts", "src/b.ts"],
				gateChecks: [
					{ id: "branch-not-trunk", status: "passed" },
					{ id: "same-branch-as-attempt", status: "skipped", detail: "recover-mode check" },
				],
			},
			"## Summary\n\nChild summary claim.",
		);

		expect(markdown).toContain("# Runner Checkpoint: demo-objective (committed)");
		const factsIndex = markdown.indexOf("## Verified facts (runner-attested)");
		const narrativeIndex = markdown.indexOf("## Child-reported narrative (unverified claims)");
		expect(factsIndex).toBeGreaterThan(-1);
		expect(narrativeIndex).toBeGreaterThan(factsIndex);
		expect(markdown).toContain("- objective: demo-objective");
		expect(markdown).toContain("- mode: default");
		expect(markdown).toContain("- status: committed");
		expect(markdown).toContain("- base branch: main");
		expect(markdown).toContain("- branch: feature/demo-step");
		expect(markdown).toContain("- commit: abc123");
		expect(markdown).toContain("- changed paths (2):");
		expect(markdown).toContain("  - src/a.ts");
		expect(markdown).toContain("  - branch-not-trunk: passed");
		expect(markdown).toContain("  - same-branch-as-attempt: skipped — recover-mode check");
		expect(markdown).toContain("verbatim and unverified");
		expect(markdown).toContain("## Summary\n\nChild summary claim.");
	});

	test("notes an absent narrative instead of leaving the zone empty", () => {
		const markdown = renderRunnerCheckpoint({ ...BASE_FACTS, status: "malfunction" }, undefined);

		expect(markdown).toContain("# Runner Checkpoint: demo-objective (malfunction)");
		expect(markdown).toContain("_No child report available; everything above is runner-attested._");
	});

	test("renders stop reason and diagnostics", () => {
		const markdown = renderRunnerCheckpoint(
			{
				...BASE_FACTS,
				status: "blocked",
				stopReason: "missing credentials",
				diagnostics: ["first diagnostic", "second diagnostic\nwith a second line"],
			},
			"## Summary\n\nBlocked claim.",
		);

		expect(markdown).toContain("- child-reported reason: missing credentials");
		expect(markdown).toContain("- diagnostics:");
		expect(markdown).toContain("  - first diagnostic");
		expect(markdown).toContain("  - second diagnostic\n    with a second line");
		expect(markdown).not.toContain("- usage:");
	});
});
