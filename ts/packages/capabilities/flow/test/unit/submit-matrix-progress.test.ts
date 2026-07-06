import { describe, expect, test } from "vitest";

import type { Caps } from "@nseng-ai/clinkr";
import { stripAnsi } from "@nseng-ai/clinkr/testing";
import {
	renderSubmitMatrixProgressFrame,
	submitMatrixRowsFromTopology,
} from "../../src/submit/submit-matrix-progress.ts";

function caps(parts: Partial<Caps> = {}): Caps {
	return {
		isTty: true,
		colorDepth: "none",
		columns: 96,
		canRenderUnicode: true,
		...parts,
	};
}

describe("submit matrix progress", () => {
	test("renders fixed global rows, checkpoint substeps, and four branch columns", () => {
		const rows = submitMatrixRowsFromTopology({
			currentBranch: "feature/b",
			branches: [
				{
					branch: "feature/a",
					parentBranch: "main",
					kind: "existing",
					pr: { label: "#123", url: "https://github.com/acme/repo/pull/123" },
				},
				{ branch: "feature/b", parentBranch: "feature/a", kind: "new" },
			],
		});

		const lines = renderSubmitMatrixProgressFrame({
			caps: caps(),
			title: "ns flow submit",
			globals: [
				{
					key: "inventory",
					label: "Inventory",
					detail: "2 branches in submit stack",
					activeLabel: "reading submit stack topology…",
					state: "done",
					substeps: [],
				},
				{
					key: "checkpoint",
					label: "Checkpoint",
					detail: "checkpoint complete",
					activeLabel: "checkpointing pending changes…",
					state: "active",
					substeps: [
						{
							key: "inspect",
							label: "Inspect",
							detail: "worktree inspected",
							activeLabel: "inspecting worktree…",
							state: "done",
						},
					],
				},
			],
			rows: rows.map((row) => ({
				branch: row.branch,
				label: row.label,
				kind: row.kind,
				...(row.pr === undefined ? {} : { pr: row.pr }),
				cells: {
					metadata: { state: row.kind === "existing" ? "skipped" : "done" },
					submit: { state: "active" },
					verify: { state: "pending" },
					description: { state: "pending" },
				},
			})),
		});

		const output = stripAnsi(lines.join("\n"));
		expect(output).toContain("ns flow submit");
		expect(output).toContain("Inventory");
		expect(output).toContain("Checkpoint");
		expect(output).toContain("Inspect");
		expect(output).toContain("Branch / PR");
		expect(output).toContain("Metadata");
		expect(output).toContain("Submit");
		expect(output).toContain("Verify");
		expect(output).toContain("Description");
		expect(output).toContain("feature/a (#123)");
		expect(output).toContain("feature/b");
	});

	test("topology rows are branch-first and enrich existing PRs immediately", () => {
		expect(
			submitMatrixRowsFromTopology({
				currentBranch: "feature/demo",
				branches: [
					{
						branch: "feature/demo",
						parentBranch: "main",
						kind: "existing",
						pr: { label: "#456", url: "https://github.com/acme/repo/pull/456" },
					},
				],
			}),
		).toEqual([
			{
				branch: "feature/demo",
				label: "feature/demo (#456)",
				kind: "existing",
				pr: { label: "#456", url: "https://github.com/acme/repo/pull/456" },
			},
		]);
	});
});
