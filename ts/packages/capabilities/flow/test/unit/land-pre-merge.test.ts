import { describe, expect, test } from "vitest";

import {
	assertCleanRepoForExecution,
	confirmAndFreeManagedSlots,
	confirmAndSubmitRequiredPrUpdates,
	executionOperationInProgressLabel,
	submitRequiredUpdatesAndRecheckPlan,
} from "../../src/land/execution/pre-merge.ts";
import type {
	LandConfirmationDecision,
	LandConfirmationGateway,
	LandConfirmationRequest,
	LandExecutionProgress,
} from "../../src/land/execution/host-seams.ts";
import { detectWorktreeConflicts } from "../../src/land/preflight.ts";
import {
	createInMemoryLandContext,
	pullRequestFacts,
	stackSnapshot,
} from "../../src/land/testing.ts";
import type { LandingPlan, WorkingTreeStatus } from "../../src/land/types.ts";

const SLOT = {
	type: "managed-slot" as const,
	branch: "feature/a",
	path: "/slots/slot-03",
	slotName: "slot-03",
};

function plan(overrides: Partial<LandingPlan> = {}): LandingPlan {
	const stack = stackSnapshot({
		current: "feature/a",
		actualCurrentBranch: "feature/a",
		landingTargetBranch: "feature/a",
		landingBranches: ["feature/a"],
	});
	return {
		repoRoot: "/repo",
		metadataDbPath: "/repo/.git/graphite.db",
		stack,
		branchPlans: [
			{
				branch: "feature/a",
				localSha: "local-sha",
				pr: pullRequestFacts({
					number: 7,
					headRefName: "feature/a",
					headRefOid: "remote-sha",
				}),
			},
		],
		preflight: {
			status: "submit-required",
			checkedBranches: ["feature/a"],
			warnings: [],
			failures: [],
		},
		prSubmitRequirements: [
			{
				branch: "feature/a",
				prNumber: 7,
				localSha: "local-sha",
				prHeadSha: "remote-sha",
				baseRefName: "main",
				reasons: ["head remote != local"],
			},
		],
		submitRestackRequirements: [],
		managedSlotConflicts: [SLOT],
		descendantMaintenance: { type: "none", branches: [] },
		...overrides,
	};
}

function recordingConfirmation(decision: LandConfirmationDecision = { type: "approved" }): {
	gateway: LandConfirmationGateway;
	requests: LandConfirmationRequest[];
} {
	const requests: LandConfirmationRequest[] = [];
	return {
		requests,
		gateway: {
			confirm: async (request) => {
				requests.push(structuredClone(request));
				return decision;
			},
		},
	};
}

function progress(): LandExecutionProgress {
	return {
		note() {},
		setStatus() {},
		setStep() {},
		recordMergedPullRequest() {},
		planRecalculated() {},
	};
}

describe("land pre-merge execution", () => {
	test("frees managed slots and rechecks through semantic gateways", async () => {
		const memory = createInMemoryLandContext({
			worktrees: {
				worktrees: [{ branch: "feature/a", path: SLOT.path }],
				classifications: { [SLOT.path]: { type: "managed-slot", slotName: "slot-03" } },
			},
		});
		const confirmation = recordingConfirmation();

		const result = await confirmAndFreeManagedSlots({
			context: memory.context,
			host: { confirmation: confirmation.gateway, progress: progress() },
			plan: plan(),
		});

		expect(result).toEqual({ type: "success", value: undefined });
		expect(confirmation.requests).toEqual([{ kind: "free-managed-slots", slots: [SLOT] }]);
		expect(memory.worktrees.freeSlotsCalls).toEqual([{ repoRoot: "/repo", slots: [SLOT] }]);
		expect(memory.git.workingTreeStatusCalls).toEqual([{ repoRoot: "/repo" }]);
	});

	test("returns slot failure and does not perform the successful rechecks", async () => {
		const memory = createInMemoryLandContext({
			worktrees: {
				freeSlotsFailure: {
					type: "boundary",
					phase: "submit-preparation",
					source: "slot",
					code: "slot_free_failed",
					message: "slot failed",
				},
			},
		});
		const result = await confirmAndFreeManagedSlots({
			context: memory.context,
			host: { confirmation: recordingConfirmation().gateway, progress: progress() },
			plan: plan(),
		});
		expect(result.type).toBe("failure");
		expect(memory.git.workingTreeStatusCalls).toEqual([]);
	});

	test("reports a residual checkout after successful slot free", async () => {
		const memory = createInMemoryLandContext({
			worktrees: {
				worktrees: [{ branch: "feature/a", path: SLOT.path }],
				classifications: { [SLOT.path]: { type: "managed-slot", slotName: "slot-03" } },
				residualCheckoutPaths: [SLOT.path],
			},
		});
		const result = await confirmAndFreeManagedSlots({
			context: memory.context,
			host: { confirmation: recordingConfirmation().gateway, progress: progress() },
			plan: plan(),
		});
		expect(result.type).toBe("failure");
		if (result.type === "failure") {
			expect(result.failure.message).toContain("ns slot free completed");
		}
	});

	test("non-interactive refusal occurs before slot mutation", async () => {
		const memory = createInMemoryLandContext();
		const failure = {
			type: "execution" as const,
			level: "error" as const,
			message: "fully worded refusal",
			outcome: "refusal" as const,
			refusalReason: "non-interactive" as const,
		};
		const confirmation = recordingConfirmation({
			type: "refused-with-fully-worded-failure",
			failure,
		});
		const result = await confirmAndFreeManagedSlots({
			context: memory.context,
			host: { confirmation: confirmation.gateway, progress: progress() },
			plan: plan(),
		});
		expect(result).toEqual({ type: "failure", failure });
		expect(memory.worktrees.freeSlotsCalls).toEqual([]);
	});

	test("requests required restack and submit with exact semantic payload", async () => {
		const memory = createInMemoryLandContext({
			git: { branchContainsParents: { "feature/a|main": true } },
		});
		const confirmation = recordingConfirmation();
		const landingPlan = plan({
			submitRestackRequirements: [{ branch: "feature/a", parent: "main" }],
		});
		const result = await confirmAndSubmitRequiredPrUpdates({
			context: memory.context,
			host: { confirmation: confirmation.gateway, progress: progress() },
			plan: landingPlan,
		});
		expect(result).toEqual({ type: "success", value: undefined });
		expect(confirmation.requests).toEqual([
			{
				kind: "submit-required-updates",
				landingTargetBranch: "feature/a",
				restackTarget: "feature/a",
				requirements: landingPlan.prSubmitRequirements,
				restackRequirements: landingPlan.submitRestackRequirements,
			},
		]);
		expect(memory.graphite.prepareRestackForSubmitCalls).toEqual([
			{ repoRoot: "/repo", branch: "feature/a" },
		]);
		expect(memory.graphite.prepareSubmitUpdateCalls).toEqual([
			{ repoRoot: "/repo", branch: "feature/a" },
		]);
	});

	test("runs required restack, submit, and plan recheck before reporting residual requirements", async () => {
		const landingPlan = plan({
			submitRestackRequirements: [{ branch: "feature/a", parent: "main" }],
			managedSlotConflicts: [],
		});
		const memory = createInMemoryLandContext({
			git: {
				currentBranch: "feature/a",
				localBranches: [{ name: "feature/a", sha: "local-sha" }],
				branchContainsParents: { "feature/a|main": true },
			},
			graphite: { stackShape: landingPlan.stack },
			github: { pullRequests: [landingPlan.branchPlans[0]?.pr ?? pullRequestFacts()] },
		});
		const result = await submitRequiredUpdatesAndRecheckPlan({
			context: memory.context,
			host: { confirmation: recordingConfirmation().gateway, progress: progress() },
			cwd: "/repo",
			plan: landingPlan,
		});
		expect(result.type).toBe("failure");
		if (result.type === "failure") {
			expect(result.failure.message).toContain("GitHub PR metadata still differs");
		}
		expect(memory.graphite.prepareRestackForSubmitCalls).toHaveLength(1);
		expect(memory.graphite.prepareSubmitUpdateCalls).toHaveLength(1);
		expect(memory.git.resolveRepoRootCalls).toEqual([{ cwd: "/repo" }]);
	});

	test("submit confirmation refusal occurs before restack or submit mutation", async () => {
		const memory = createInMemoryLandContext();
		const confirmation = recordingConfirmation({
			type: "refused-with-fully-worded-failure",
			failure: {
				type: "execution",
				level: "error",
				message: "fully worded submit refusal",
				outcome: "refusal",
				refusalReason: "non-interactive",
			},
		});
		const result = await confirmAndSubmitRequiredPrUpdates({
			context: memory.context,
			host: { confirmation: confirmation.gateway, progress: progress() },
			plan: plan({ submitRestackRequirements: [{ branch: "feature/a", parent: "main" }] }),
		});
		expect(result.type).toBe("failure");
		expect(memory.graphite.prepareRestackForSubmitCalls).toEqual([]);
		expect(memory.graphite.prepareSubmitUpdateCalls).toEqual([]);
	});

	test("restack failure prevents submit", async () => {
		const memory = createInMemoryLandContext({
			graphite: { restackForSubmitResults: { "feature/a": { type: "failure" } } },
		});
		const result = await confirmAndSubmitRequiredPrUpdates({
			context: memory.context,
			host: { confirmation: recordingConfirmation().gateway, progress: progress() },
			plan: plan({ submitRestackRequirements: [{ branch: "feature/a", parent: "main" }] }),
		});
		expect(result.type).toBe("failure");
		expect(memory.graphite.prepareSubmitUpdateCalls).toEqual([]);
	});

	test("submit failure preserves recovery guidance and prevents plan recheck", async () => {
		const landingPlan = plan({
			submitRestackRequirements: [{ branch: "feature/a", parent: "main" }],
		});
		const memory = createInMemoryLandContext({
			git: { branchContainsParents: { "feature/a|main": true } },
			graphite: {
				submitUpdateResults: {
					"feature/a": {
						type: "failure",
						failure: {
							type: "boundary",
							phase: "submit-preparation",
							source: "graphite",
							code: "submit_failed",
							message: "submit update failed",
						},
					},
				},
			},
		});
		const confirmation = recordingConfirmation();

		const result = await submitRequiredUpdatesAndRecheckPlan({
			context: memory.context,
			host: { confirmation: confirmation.gateway, progress: progress() },
			cwd: "/repo",
			plan: landingPlan,
		});

		expect(confirmation.requests).toHaveLength(1);
		expect(memory.graphite.prepareRestackForSubmitCalls).toEqual([
			{ repoRoot: "/repo", branch: "feature/a" },
		]);
		expect(memory.graphite.prepareSubmitUpdateCalls).toEqual([
			{ repoRoot: "/repo", branch: "feature/a" },
		]);
		expect(result).toEqual({
			type: "failure",
			failure: {
				type: "execution",
				level: "error",
				message: "submit update failed",
				suggestedAction:
					"Resolve the submit failure, run gt submit --branch feature/a --no-stack --update-only --no-edit --no-ai --no-interactive manually if appropriate, then rerun /ns:flow:land.",
				outcome: "failure",
			},
		});
		expect(memory.git.resolveRepoRootCalls).toEqual([]);
	});
});

describe("worktree classification parity", () => {
	test("trusts adapter normalization when equivalent paths are not textually equal", async () => {
		const memory = createInMemoryLandContext({
			worktrees: {
				worktrees: [{ branch: "feature/a", path: "/real/repo" }],
				classifications: { "/real/repo": { type: "current" } },
			},
		});
		const result = await detectWorktreeConflicts({
			context: memory.context,
			repoRoot: "/symlink/repo",
			currentBranch: "feature/a",
			relevantBranches: ["feature/a"],
		});
		expect(result).toEqual({
			type: "success",
			value: [{ type: "current", branch: "feature/a", path: "/real/repo" }],
		});
	});
});

describe("execution clean-repo wording parity", () => {
	const operations: ReadonlyArray<NonNullable<WorkingTreeStatus["inProgressOperation"]>> = [
		"merge",
		"cherry-pick",
		"revert",
		"rebase",
		"bisect",
	];

	test("uses the old stack dirty wording byte-for-byte", async () => {
		const memory = createInMemoryLandContext({ git: { workingTreeStatus: { isClean: false } } });
		const result = await assertCleanRepoForExecution(memory.context, "/repo");
		expect(result).toEqual({
			type: "failure",
			failure: expect.objectContaining({
				message: "Working tree is dirty; refusing to start stack landing.",
			}),
		});
	});

	test.each(operations)("matches the old label table for %s", async (operation) => {
		const expectedLabel =
			operation === "cherry-pick"
				? "A cherry-pick"
				: operation === "bisect"
					? "A bisect"
					: `A ${operation}`;
		expect(executionOperationInProgressLabel(operation)).toBe(expectedLabel);
		const memory = createInMemoryLandContext({
			git: { workingTreeStatus: { isClean: true, inProgressOperation: operation } },
		});
		const result = await assertCleanRepoForExecution(memory.context, "/repo");
		expect(result).toEqual({
			type: "failure",
			failure: expect.objectContaining({
				message: `${expectedLabel} is in progress; refusing to start stack landing.`,
			}),
		});
	});
});
