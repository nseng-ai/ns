import { describe, expect, test } from "vitest";

import type { Caps } from "@nseng-ai/clinkr";
import { stripAnsi } from "@nseng-ai/clinkr/testing";
import type { StreamClock, StreamSinkDeps, StreamWriter } from "@nseng-ai/clinkr/stream";
import {
	createLandMatrixProgressController,
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

interface RecordingClock extends StreamClock {
	readonly sleeps: number[];
}

function fakeClock(): RecordingClock {
	const sleeps: number[] = [];
	return {
		sleeps,
		sleep(ms: number): Promise<void> {
			sleeps.push(ms);
			return new Promise(() => {});
		},
	};
}

function streamCapture(): { deps: StreamSinkDeps; writes: string[]; redraws: string[] } {
	const writes: string[] = [];
	const redraws: string[] = [];
	const writer: StreamWriter = {
		write: (text) => {
			writes.push(text);
		},
		redraw: (frame) => {
			redraws.push(frame);
		},
		done: () => {},
	};
	return {
		deps: {
			clock: fakeClock(),
			writer,
		},
		writes,
		redraws,
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

	test("renders inactive global rows without redundant detail text", () => {
		const output = stripAnsi(
			renderLandMatrixProgressFrame({
				caps: caps(),
				title: "ns flow land",
				globals: [
					{
						key: "prepare",
						label: "Prepare",
						detail: "not required",
						activeLabel: "preparing stack for merge…",
						state: "skipped",
						substeps: [
							{
								key: "slots",
								label: "Slots",
								detail: "managed slots free",
								activeLabel: "freeing managed slots…",
								state: "pending",
							},
						],
					},
				],
				rows: [],
			}).join("\n"),
		);

		expect(output).toContain("Prepare");
		expect(output).toContain("Slots");
		expect(output).not.toContain("not required");
		expect(output).not.toContain("pending");
	});

	test("ignores global updates until setRows renders the full pending matrix", () => {
		const capture = streamCapture();
		const controller = createLandMatrixProgressController({
			caps: caps(),
			deps: capture.deps,
		});

		controller.setGlobal("preflight", { state: "active", text: "checking" });
		expect(capture.writes).toHaveLength(0);
		expect(capture.redraws).toHaveLength(0);

		controller.setRows(landMatrixRowsFromPlan(plan()));

		expect(capture.redraws.length).toBeGreaterThan(0);
		const firstFrame = stripAnsi(capture.redraws[0] ?? "");
		expect(firstFrame).not.toContain("Preflight");
		expect(firstFrame).toContain("ns flow land — 0/2 target PRs merged");
		expect(firstFrame).toContain("Running: —");
		const rowLines = firstFrame
			.split("\n")
			.filter((line) => line.includes("feature/a (#123)") || line.includes("feature/b (#124)"));
		expect(rowLines).toHaveLength(2);
		for (const rowLine of rowLines) {
			expect(rowLine.match(/·/g)).toHaveLength(4);
		}
	});

	test("renders the first branch matrix frame with every cell pending", () => {
		const rows = landMatrixRowsFromPlan(plan());
		const lines = renderLandMatrixProgressFrame({
			caps: caps(),
			title: "ns flow land — 0/2 target PRs merged",
			runningCommands: [],
			globals: [],
			rows: rows.map((row) => pendingLandRowView(row)),
		});

		const output = stripAnsi(lines.join("\n"));
		const rowLines = output
			.split("\n")
			.filter((line) => line.includes("feature/a (#123)") || line.includes("feature/b (#124)"));

		expect(rowLines).toHaveLength(2);
		for (const rowLine of rowLines) {
			expect(rowLine.match(/·/g)).toHaveLength(4);
		}

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
