import { describe, expect, test } from "vitest";

import type { Caps } from "@nseng-ai/clinkr";
import { stripAnsi } from "@nseng-ai/clinkr/testing";
import {
	compactSubmitMetadataCellText,
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
			runningCommands: ["gt submit --no-edit"],
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
		expect(output).toContain("Running: gt submit --no-edit");
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

	test("branch cells render compact text when it fits and keep symbols otherwise", () => {
		const cells = {
			submit: { state: "pending" },
			verify: { state: "pending" },
			description: { state: "pending" },
		} as const;
		const lines = renderSubmitMatrixProgressFrame({
			caps: caps(),
			title: "ns flow submit",
			globals: [],
			rows: [
				{
					branch: "feature/active",
					label: "feature/active",
					kind: "new",
					cells: { ...cells, metadata: { state: "active", text: "gen" } },
				},
				{
					branch: "feature/skipped",
					label: "feature/skipped",
					kind: "existing",
					cells: { ...cells, metadata: { state: "skipped", text: "exists" } },
				},
				{
					branch: "feature/done",
					label: "feature/done",
					kind: "new",
					cells: { ...cells, metadata: { state: "done", text: "ready" } },
				},
				{
					branch: "feature/failed",
					label: "feature/failed",
					kind: "new",
					cells: { ...cells, metadata: { state: "failed", text: "failed" } },
				},
				{
					branch: "feature/long-text",
					label: "feature/long-text",
					kind: "new",
					cells: {
						...cells,
						metadata: { state: "skipped", text: "metadata amendment not applicable" },
					},
				},
				{
					branch: "feature/no-text",
					label: "feature/no-text",
					kind: "new",
					cells: { ...cells, metadata: { state: "done" } },
				},
			],
		});

		const output = stripAnsi(lines.join("\n"));
		const rowLine = (branch: string): string => {
			const line = output.split("\n").find((item) => item.includes(branch));
			if (line === undefined) throw new Error(`missing row for ${branch}`);
			return line;
		};
		expect(rowLine("feature/active")).toContain("gen");
		expect(rowLine("feature/skipped")).toContain("exists");
		expect(rowLine("feature/done")).toContain("ready");
		expect(rowLine("feature/failed")).toContain("failed");
		// Text wider than the 8-column Metadata cell falls back to the legacy symbol.
		expect(rowLine("feature/long-text")).toContain("–");
		expect(rowLine("feature/long-text")).not.toContain("amendment");
		// Cells without text keep the legacy symbol rendering.
		expect(rowLine("feature/no-text")).toContain("✓");
	});

	test("compactSubmitMetadataCellText maps metadata reasons to cell labels", () => {
		expect(compactSubmitMetadataCellText("existing-pr")).toBe("exists");
		expect(compactSubmitMetadataCellText("amendment-not-applicable")).toBe("n/a");
		expect(compactSubmitMetadataCellText("generating-metadata")).toBe("gen");
		expect(compactSubmitMetadataCellText("amending-metadata-commit")).toBe("amend");
		expect(compactSubmitMetadataCellText("metadata-prepared")).toBe("ready");
		expect(compactSubmitMetadataCellText("metadata-amendment-failed")).toBe("failed");
		expect(compactSubmitMetadataCellText("metadata-generation-failed")).toBe("failed");
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
