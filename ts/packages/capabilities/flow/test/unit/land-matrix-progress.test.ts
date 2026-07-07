import { describe, expect, test } from "vitest";

import type { Caps } from "@nseng-ai/clinkr";
import { stripAnsi } from "@nseng-ai/clinkr/testing";
import {
	createLandMatrixProgressController,
	formatLandProgressTitle,
	landMatrixRowsFromPlan,
	renderLandMatrixProgressFrame,
	type LandMatrixRowSpec,
} from "../../src/land/land-presentation.ts";
import type { LandingPlan } from "../../src/land/api.ts";
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

describe("land matrix progress", () => {
	test("formats the live land title from merged target PR counts", () => {
		expect(formatLandProgressTitle({ landedPrs: 0 })).toBe("ns flow land");
		expect(formatLandProgressTitle({ landedPrs: 1 })).toBe("ns flow land — 1 target PR merged");
		expect(formatLandProgressTitle({ landedPrs: 1, totalPrs: 2 })).toBe(
			"ns flow land — 1/2 target PRs merged",
		);
	});

	test("maps landing plan branches to fixed bottom-to-top matrix rows", () => {
		expect(landMatrixRowsFromPlan(plan())).toEqual([
			{ branch: "feature/a", prNumber: 123, label: "feature/a (#123)" },
			{ branch: "feature/b", prNumber: 124, label: "feature/b (#124)" },
		]);
	});

	test("renders running commands and gate/merge/verify/restack columns without globals", () => {
		const rows = landMatrixRowsFromPlan(plan());
		const lines = renderLandMatrixProgressFrame({
			caps: caps(),
			title: "ns flow land — 1/2 target PRs merged",
			runningCommands: ["gh pr merge 123 --squash"],
			rows: rows.map((row) => landRowView(row)),
		});

		const output = stripAnsi(lines.join("\n"));
		expect(output).toContain("ns flow land — 1/2 target PRs merged");
		expect(output).toContain("Running: gh pr merge 123 --squash");
		expect(output).not.toContain("Preflight");
		expect(output).not.toContain("Prepare");
		expect(output).not.toContain("Slots");
		expect(output).not.toContain("Update");
		expect(output).not.toContain("Recheck");
		expect(output).not.toContain("Descendants");
		expect(output).not.toContain("Cleanup");
		expect(output).toContain("Gate");
		expect(output).toContain("Merge");
		expect(output).toContain("Verify");
		expect(output).toContain("Restack");
		expect(output).toContain("feature/a (#123)");
	});

	test("does not render until setRows renders the full pending matrix", () => {
		const capture = streamCapture({ sleep: "pending" });
		const controller = createLandMatrixProgressController({
			caps: caps(),
			deps: capture.deps,
		});

		expect(capture.writes).toHaveLength(0);
		expect(capture.redraws).toHaveLength(0);

		controller.setRows(landMatrixRowsFromPlan(plan()));

		expect(capture.redraws.length).toBeGreaterThan(0);
		const firstFrame = stripAnsi(capture.redraws[0] ?? "");
		expect(firstFrame).not.toContain("Preflight");
		expect(firstFrame).toContain("ns flow land — 0/2 target PRs merged");
		expect(firstFrame).toContain("Running: —");
		expectPendingMatrixRows(firstFrame);
	});

	test("renders the first branch matrix frame with every cell pending", () => {
		const rows = landMatrixRowsFromPlan(plan());
		const lines = renderLandMatrixProgressFrame({
			caps: caps(),
			title: "ns flow land — 0/2 target PRs merged",
			runningCommands: [],
			rows: rows.map((row) => pendingLandRowView(row)),
		});

		const output = stripAnsi(lines.join("\n"));
		expectPendingMatrixRows(output);
	});

	test("centers initial pending dots in the matrix columns", () => {
		const rows = [
			{
				branch: "feature/very-long-branch-name-that-truncates",
				prNumber: 123,
				label: "feature/very-long-branch-name-that-truncates (#123)",
			},
		];
		const lines = renderLandMatrixProgressFrame({
			caps: caps(),
			title: "ns flow land — 0/1 target PRs merged",
			runningCommands: [],
			rows: rows.map((row) => pendingLandRowView(row)),
		});

		const plainLines = lines.map((line) => stripAnsi(line));
		const headerLine = plainLines.find((line) => line.includes("Branch / PR"));
		const rowLine = plainLines.find((line) => line.includes("feature/very-long-branch-name"));
		if (headerLine === undefined || rowLine === undefined) throw new Error("missing matrix lines");

		expect(dotIndexes(rowLine)).toEqual([
			headerLine.indexOf("Gate") + 2,
			headerLine.indexOf("Merge") + 2,
			headerLine.indexOf("Verify") + 2,
			headerLine.indexOf("Restack") + 3,
		]);
	});
});

function expectPendingMatrixRows(output: string): void {
	const rowLines = output
		.split("\n")
		.filter((line) => line.includes("feature/a (#123)") || line.includes("feature/b (#124)"));
	expect(rowLines).toHaveLength(2);
	for (const rowLine of rowLines) {
		expect(rowLine.match(/·/g)).toHaveLength(4);
	}
}

function dotIndexes(line: string): number[] {
	const indexes: number[] = [];
	let index = line.indexOf("·");
	while (index >= 0) {
		indexes.push(index);
		index = line.indexOf("·", index + 1);
	}
	return indexes;
}

function landRowView(row: LandMatrixRowSpec) {
	return {
		...row,
		rowKey: row.branch,
		cells: {
			gate: { state: "done" as const },
			merge: { state: "active" as const },
			verify: { state: "pending" as const },
			restack: { state: "pending" as const },
		},
	};
}

function pendingLandRowView(row: LandMatrixRowSpec) {
	return {
		...row,
		rowKey: row.branch,
		cells: {
			gate: { state: "pending" as const },
			merge: { state: "pending" as const },
			verify: { state: "pending" as const },
			restack: { state: "pending" as const },
		},
	};
}

function plan(): Pick<LandingPlan, "branchPlans" | "stack"> {
	return {
		stack: {
			trunk: "main",
			current: "feature/b",
			actualCurrentBranch: "feature/b",
			landingTargetBranch: "feature/b",
			landingBranches: ["feature/a", "feature/b"],
			remainingLandingBranches: [],
			descendantBranches: [],
			descendantRootBranches: [],
			warnings: [],
		},
		branchPlans: [
			{ branch: "feature/a", localSha: "aaa", pr: pr("feature/a", 123) },
			{ branch: "feature/b", localSha: "bbb", pr: pr("feature/b", 124) },
		],
	};
}

function pr(branch: string, number: number) {
	return {
		id: `PR_${number}`,
		number,
		title: branch,
		body: null,
		state: "OPEN",
		isDraft: false,
		headRefName: branch,
		baseRefName: "main",
		headRefOid: `${number}`,
		url: `https://github.com/acme/repo/pull/${number}`,
	};
}
