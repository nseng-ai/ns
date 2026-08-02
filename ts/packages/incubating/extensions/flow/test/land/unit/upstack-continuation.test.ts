import { describe, expect, test } from "vitest";

import {
	executeUpstackContinuation,
	snapshotUpstackContinuation,
} from "../../../src/land/execution/upstack-continuation.ts";
import { createInMemoryLandContext, stackSnapshot } from "../../../src/land/testing.ts";
import type { LandingBoundaryFailure } from "../../../src/land/types.ts";

const ROOT = "/repo";
const METADATA_DB_PATH = `${ROOT}/.git/graphite.db`;
const ORIGINAL = "feature-a";
const CHILD = "feature-child";

const boundaryFailure: LandingBoundaryFailure = {
	type: "boundary",
	phase: "upstack-continuation",
	source: "graphite",
	code: "continuation-failed",
	message: "continuation boundary failed",
};

describe("upstack continuation snapshot", () => {
	test.each([
		{
			name: "lookup failure",
			graphite: { branchChildrenFailure: boundaryFailure },
			report: { type: "unavailable", reason: "lookup-failed", candidates: [] },
		},
		{
			name: "no child",
			graphite: { branchChildren: { [ORIGINAL]: [] } },
			report: { type: "unavailable", reason: "no-child", candidates: [] },
		},
		{
			name: "one child",
			graphite: { branchChildren: { [ORIGINAL]: [CHILD] } },
			report: { type: "candidate", branch: CHILD },
		},
		{
			name: "multiple children",
			graphite: { branchChildren: { [ORIGINAL]: [CHILD, "feature-other"] } },
			report: {
				type: "unavailable",
				reason: "multiple-children",
				candidates: [CHILD, "feature-other"],
			},
		},
	] as const)("classifies $name", async ({ graphite, report }) => {
		const memory = createInMemoryLandContext({ graphite });

		const result = await snapshotUpstackContinuation({
			context: memory.context,
			repoRoot: ROOT,
			metadataDbPath: METADATA_DB_PATH,
			stack: stackSnapshot({ current: ORIGINAL, landingBranches: [ORIGINAL] }),
		});

		expect(result.report).toEqual(report);
		expect(result.type).toBe(report.type === "candidate" ? "available" : "unavailable");
		expect(memory.graphite.branchChildrenCalls).toEqual([
			{ repoRoot: ROOT, metadataDbPath: METADATA_DB_PATH, branch: ORIGINAL },
		]);
	});
});

describe("upstack continuation execution", () => {
	test("reports checkout failure without verification or deletion", async () => {
		const memory = createInMemoryLandContext({
			git: { checkoutBranchFailures: { [CHILD]: boundaryFailure } },
		});

		const result = await execute(memory.context);

		expect(result).toMatchObject({
			type: "failed",
			report: { type: "checkout-failed", branch: CHILD },
			failure: { message: expect.stringContaining("continuation boundary failed") },
		});
		expect(memory.git.currentBranchCalls).toEqual([]);
		expect(memory.graphite.deleteLocalBranchCalls).toEqual([]);
	});

	test("reports verification read failure without deletion", async () => {
		const memory = createInMemoryLandContext({ git: { currentBranch: { type: "failure" } } });

		const result = await execute(memory.context);

		expect(result).toMatchObject({
			type: "failed",
			report: { type: "verification-failed", branch: CHILD, actualBranch: ORIGINAL },
			failure: { message: expect.stringContaining("could not be verified") },
		});
		expect(memory.graphite.deleteLocalBranchCalls).toEqual([]);
	});

	test("reports verification mismatch without deletion", async () => {
		const memory = createInMemoryLandContext({
			git: { checkoutBranchReportedCurrentBranches: { [CHILD]: "unexpected" } },
		});

		const result = await execute(memory.context);

		expect(result).toMatchObject({
			type: "failed",
			report: { type: "verification-failed", branch: CHILD, actualBranch: "unexpected" },
		});
		expect(memory.graphite.deleteLocalBranchCalls).toEqual([]);
	});

	test("preserve success keeps the original branch", async () => {
		const memory = createInMemoryLandContext();

		const result = await execute(memory.context, "preserve");

		expect(result).toEqual({
			type: "completed",
			report: { type: "continued", branch: CHILD, originalBranchDeleted: false },
		});
		expect(memory.graphite.deleteLocalBranchCalls).toEqual([]);
	});

	test("delete success removes the original branch only after verified checkout", async () => {
		const memory = createInMemoryLandContext();

		const result = await execute(memory.context);

		expect(result).toEqual({
			type: "completed",
			report: { type: "continued", branch: CHILD, originalBranchDeleted: true },
		});
		expect(memory.callEvents.map((event) => event.operation)).toEqual([
			"git.checkoutBranch",
			"git.currentBranch",
			"graphite.deleteLocalBranch",
		]);
	});

	test("delete failure reports recoverable cleanup", async () => {
		const memory = createInMemoryLandContext({
			graphite: {
				deleteLocalBranchResults: {
					[ORIGINAL]: {
						type: "failed",
						commandDisplay: `gt delete ${ORIGINAL}`,
						result: {
							type: "exited",
							stdout: "",
							stderr: "delete failed",
							code: 1,
							signal: null,
						},
						isLikelyInProgressGitOperation: false,
					},
				},
			},
		});

		const result = await execute(memory.context);

		expect(result).toMatchObject({
			type: "failed",
			report: { type: "cleanup-failed", branch: CHILD },
			failure: { displayCommand: `gt delete ${ORIGINAL}` },
		});
	});
});

async function execute(
	context: ReturnType<typeof createInMemoryLandContext>["context"],
	cleanup: "preserve" | "free-slot" = "free-slot",
) {
	return await executeUpstackContinuation({
		context,
		repoRoot: ROOT,
		originalBranch: ORIGINAL,
		candidateBranch: CHILD,
		cleanup,
	});
}
