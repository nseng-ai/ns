import { describe, expect, test } from "vitest";

import type { Caps } from "@nseng-ai/clinkr";
import { stripAnsi } from "@nseng-ai/clinkr/testing";
import {
	formatLandProgressTitle,
	landMatrixRowsFromPlan,
	renderLandMatrixProgressFrame,
	type LandMatrixRowSpec,
} from "../../src/land/land-matrix-progress.ts";
import type { FlowLandingPlan } from "../../src/land/stack/types.ts";

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

	test("renders globals, running commands, and gate/merge/verify/restack columns", () => {
		const rows = landMatrixRowsFromPlan(plan());
		const lines = renderLandMatrixProgressFrame({
			caps: caps(),
			title: "ns flow land — 1/2 target PRs merged",
			runningCommands: ["gh pr merge 123 --squash"],
			globals: [
				{
					key: "preflight",
					label: "Preflight",
					detail: "2 PRs ready to land into main",
					activeLabel: "checking stack and PRs…",
					state: "done",
					substeps: [],
				},
				{
					key: "prepare",
					label: "Prepare",
					detail: "ready to merge",
					activeLabel: "preparing stack for merge…",
					state: "active",
					substeps: [
						{
							key: "slots",
							label: "Slots",
							detail: "managed slots free",
							activeLabel: "freeing managed slots…",
							state: "done",
						},
					],
				},
			],
			rows: rows.map((row) => landRowView(row)),
		});

		const output = stripAnsi(lines.join("\n"));
		expect(output).toContain("ns flow land — 1/2 target PRs merged");
		expect(output).toContain("Running: gh pr merge 123 --squash");
		expect(output).toContain("Preflight");
		expect(output).toContain("Prepare");
		expect(output).toContain("Slots");
		expect(output).toContain("Gate");
		expect(output).toContain("Merge");
		expect(output).toContain("Verify");
		expect(output).toContain("Restack");
		expect(output).toContain("feature/a (#123)");
	});
});

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

function plan(): FlowLandingPlan {
	return {
		repoRoot: "/repo",
		metadataDbPath: "/repo/.git/graphite.db",
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
		prSubmitRequirements: [],
		submitRestackRequirements: [],
		managedSlotConflicts: [],
		descendantMaintenance: { kind: "none", branches: [] },
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
