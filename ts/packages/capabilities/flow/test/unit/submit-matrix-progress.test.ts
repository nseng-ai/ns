import { describe, expect, test } from "vitest";

import type { Caps } from "@nseng-ai/clinkr";
import { stripAnsi } from "@nseng-ai/clinkr/testing";
import {
	compactSubmitMetadataCellText,
	createSubmitMatrixProgressController,
	renderSubmitMatrixProgressFrame,
	submitMatrixRowsFromTopology,
} from "../../src/submit/submit-matrix-progress.ts";
import { streamCapture } from "./stream-test-helpers.ts";

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
	test("derives checkpoint model operations from the phase event policy", () => {
		const capture = streamCapture({ sleep: "pending" });
		const controller = createSubmitMatrixProgressController({
			caps: caps(),
			deps: capture.deps,
			title: "ns flow submit",
			rows: [],
			checkpointModelRef: "openai-codex/gpt-test",
		});
		controller.begin();

		controller.applyGlobalPhaseEvent("checkpoint", {
			type: "phase-started",
			phaseKey: "generate",
		});
		expect(stripAnsi(capture.redraws.at(-1) ?? "")).toContain(
			"LM · generating checkpoint message · openai-codex/gpt-test",
		);

		controller.applyGlobalPhaseEvent("checkpoint", {
			type: "phase-done",
			phaseKey: "generate",
		});
		expect(stripAnsi(capture.redraws.at(-1) ?? "")).not.toContain("generating checkpoint message");
	});

	test("renders reported operations on a dedicated line when no global row is active", () => {
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

		// A real metadata/description phase: every global row is settled, skipped, or pending —
		// only a branch cell is active — yet the reported model operation must stay visible.
		const lines = renderSubmitMatrixProgressFrame({
			caps: caps(),
			title: "ns flow submit",
			activeOperations: [
				{
					kind: "model",
					operation: "generating PR metadata",
					modelRef: "openai-codex/gpt-5.4-mini",
					detail: "branch 2/3",
				},
			],
			globals: [
				{
					key: "preflight",
					label: "Preflight",
					detail: "ready to submit",
					activeLabel: "checking submit readiness…",
					state: "done",
					substeps: [],
				},
				{
					key: "restack",
					label: "Restack",
					detail: "restack complete",
					activeLabel: "running gt restack…",
					state: "skipped",
					substeps: [],
				},
				{
					key: "submit",
					label: "Submit",
					detail: "stack submitted",
					activeLabel: "running gt submit…",
					state: "pending",
					substeps: [],
				},
				{
					key: "verify",
					label: "Verify",
					detail: "current PR verified",
					activeLabel: "checking current PR…",
					state: "pending",
					substeps: [],
				},
			],
			rows: rows.map((row) => ({
				branch: row.branch,
				label: row.label,
				kind: row.kind,
				...(row.pr === undefined ? {} : { pr: row.pr }),
				cells: {
					metadata: { state: row.kind === "existing" ? "skipped" : "active" },
					description: { state: "pending" },
				},
			})),
			tailLine: "",
		});

		const plainLines = lines.map((line) => stripAnsi(line));
		const output = plainLines.join("\n");
		expect(output).toContain("ns flow submit");
		// The dedicated operations line sits immediately before the tail slot.
		expect(plainLines.at(-1)).toBe("");
		expect(plainLines.at(-2)).toBe(
			"Running: LM · generating PR metadata · openai-codex/gpt-5.4-mini · branch 2/3",
		);
		// The operation renders exactly once — no global row hosts it.
		expect(plainLines.filter((line) => line.includes("generating PR metadata"))).toHaveLength(1);
		expect(output).toContain("Preflight");
		expect(output).toContain("Branch / PR");
		expect(output).toContain("Metadata");
		expect(output).toContain("Description");
		expect(output).toContain("Submit");
		expect(output).toContain("Verify");
		const headerLine = plainLines.find((line) => line.includes("Branch / PR"));
		expect(headerLine).toContain("Metadata");
		expect(headerLine).toContain("Description");
		expect(headerLine).not.toContain("Submit");
		expect(headerLine).not.toContain("Verify");
		expect(output).toContain("feature/a (#123)");
		expect(output).toContain("feature/b");
	});

	test("keeps active global labels while the operation renders on the dedicated line", () => {
		const lines = renderSubmitMatrixProgressFrame({
			caps: caps(),
			title: "ns flow submit",
			activeOperations: [{ kind: "command", display: "gt submit --no-interactive" }],
			globals: [
				{
					key: "submit",
					label: "Submit",
					detail: "stack submitted",
					activeLabel: "running gt submit…",
					state: "active",
					substeps: [],
				},
			],
			rows: [
				{
					branch: "feature/a",
					label: "feature/a",
					kind: "new",
					cells: {
						metadata: { state: "done" },
						description: { state: "pending" },
					},
				},
			],
			tailLine: "",
		});

		const plainLines = lines.map((line) => stripAnsi(line));
		const submitLine = plainLines.find((line) => line.includes("running gt submit…"));
		expect(submitLine).toBeDefined();
		expect(submitLine).not.toContain("gt submit --no-interactive");
		expect(plainLines.at(-2)).toBe("Running: gt submit --no-interactive");
	});

	test("reserves one blank operations slot on live frames and omits it when settled", () => {
		const globals = [
			{
				key: "submit" as const,
				label: "Submit",
				detail: "stack submitted",
				activeLabel: "running gt submit…",
				state: "done" as const,
				substeps: [],
			},
		];
		const rows = [
			{
				branch: "feature/a",
				label: "feature/a",
				kind: "new" as const,
				cells: {
					metadata: { state: "done" as const },
					description: { state: "pending" as const },
				},
			},
		];

		const live = renderSubmitMatrixProgressFrame({
			caps: caps(),
			title: "ns flow submit",
			activeOperations: [],
			globals,
			rows,
			tailLine: "",
		});
		const livePlain = live.map((line) => stripAnsi(line));
		// Exactly one blank operations slot plus the blank tail slot: the row line is third from last.
		expect(livePlain.slice(-2)).toEqual(["", ""]);
		expect(livePlain.at(-3)).toContain("feature/a");

		const settled = renderSubmitMatrixProgressFrame({
			caps: caps(),
			title: "ns flow submit",
			globals,
			rows,
		});
		const settledPlain = settled.map((line) => stripAnsi(line));
		expect(settledPlain.at(-1)).toContain("feature/a");
	});

	test("branch cells render compact text when it fits and keep symbols otherwise", () => {
		const cells = {
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
		expect(compactSubmitMetadataCellText("metadata-drafted")).toBe("drafted");
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
