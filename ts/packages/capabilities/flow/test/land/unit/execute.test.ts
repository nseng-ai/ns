import { describe, expect, test } from "vitest";

import {
	buildStackLandingPlan,
	executeLanding,
	executeStackLandingPlan,
	nullLandExecutionProgress,
	type LandConfirmationGateway,
	type LandConfirmationRequest,
	type LandStackExecutionHost,
	type LandingRequest,
} from "@nseng-ai/flow/land/api";
import {
	createInMemoryLandContext,
	pullRequestFacts,
	stackSnapshot,
	type InMemoryLandContextState,
} from "@nseng-ai/flow/land/testing";

const ROOT = "/repo";
const BRANCH = "feature-a";
const SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const OLD_SHA = "1111111111111111111111111111111111111111";

const executeRequest: LandingRequest = {
	cwd: ROOT,
	target: { type: "stack" },
	mode: "execute",
	preflight: { shouldAllowSubmitRequiredState: true },
	cleanup: { shouldFreeSlot: false, shouldForceCleanup: false },
};

describe("land execute mode over in-memory gateways", () => {
	test("lands a linear stack and mirrors the semantic sequence of the permanent single-PR transcript", async () => {
		const memory = createInMemoryLandContext(linearState());
		const outcome = await executeLanding(memory.context, executeRequest, approvedHost());

		expect(outcome).toMatchObject({
			type: "success",
			value: {
				phases: [
					{ type: "completed", phase: "repo-discovery" },
					{ type: "completed", phase: "stack-shape" },
					{ type: "completed", phase: "preflight" },
					{ type: "completed", phase: "merge" },
					{ type: "skipped", phase: "descendant-maintenance" },
					{ type: "completed", phase: "cleanup" },
				],
				landedChunks: [
					{
						index: 0,
						landingTargetBranch: BRANCH,
						landed: [{ branch: BRANCH, number: 101, title: "PR 101" }],
					},
				],
				cleanup: { retainedLocalBranches: [], freedSlots: [] },
			},
		});
		// Cross-check: `land-stack-command-scenarios.test.ts`, scenario
		// "renders final landed PR numbers as terminal hyperlinks". This compares semantic gateway
		// requests in order; the permanent transcript remains the raw command-shape authority.
		expect(memory.callEvents).toEqual([
			{
				operation: "github.pullRequestFacts",
				request: { repoRoot: ROOT, branchOrNumber: BRANCH },
			},
			{
				operation: "git.snapshotBackupRefs",
				request: { repoRoot: ROOT, branches: [BRANCH] },
			},
			{ operation: "git.localBranchSha", request: { repoRoot: ROOT, branch: BRANCH } },
			{
				operation: "github.pullRequestFacts",
				request: { repoRoot: ROOT, branchOrNumber: BRANCH },
			},
			{
				operation: "github.squashMergePullRequest",
				request: {
					repoRoot: ROOT,
					pullRequest: pullRequestFacts({
						number: 101,
						headRefName: BRANCH,
						headRefOid: SHA,
					}),
				},
			},
			{
				operation: "github.pullRequestFacts",
				request: { repoRoot: ROOT, branchOrNumber: "101" },
			},
			{
				operation: "graphite.branchChildren",
				request: { repoRoot: ROOT, metadataDbPath: `${ROOT}/.git/graphite.db`, branch: BRANCH },
			},
			{
				operation: "graphite.deleteLocalBranch",
				request: { repoRoot: ROOT, branch: BRANCH, checkedOutConflictHandling: "retain" },
			},
		]);
	});

	test("refuses safely with the default host before merge mutation", async () => {
		const memory = createInMemoryLandContext(linearState());
		const outcome = await executeLanding(memory.context, executeRequest);

		expect(outcome).toMatchObject({
			type: "failure",
			failure: {
				type: "execution",
				outcome: "refusal",
				refusalReason: "non-interactive",
			},
		});
		expect(memory.github.squashMergePullRequestCalls).toEqual([]);
		expect(memory.git.snapshotBackupRefsCalls).toEqual([]);
	});

	test("takes the submit-required preparation path before reporting residual remote metadata", async () => {
		const memory = createInMemoryLandContext(
			linearState({
				github: {
					pullRequests: [
						pullRequestFacts({
							number: 101,
							headRefName: BRANCH,
							headRefOid: OLD_SHA,
						}),
					],
				},
			}),
		);
		const confirmation = approvingConfirmation();
		const outcome = await executeLanding(memory.context, executeRequest, {
			confirmation: confirmation.gateway,
			progress: nullLandExecutionProgress,
		});

		expect(outcome).toMatchObject({
			type: "failure",
			failure: { message: expect.stringContaining("GitHub PR metadata still differs") },
		});
		expect(memory.graphite.prepareSubmitUpdateCalls).toEqual([{ repoRoot: ROOT, branch: BRANCH }]);
		expect(confirmation.requests.map((request) => request.kind)).toEqual([
			"main-landing",
			"submit-required-updates",
		]);
		expect(memory.github.squashMergePullRequestCalls).toEqual([]);
	});

	test("frees a managed-slot conflict before landing and propagates the freed slot", async () => {
		const slot = { path: "/slots/slot-03", branch: BRANCH };
		const memory = createInMemoryLandContext(
			linearState({
				worktrees: {
					worktrees: [slot],
					classifications: { [slot.path]: { type: "managed-slot", slotName: "slot-03" } },
				},
			}),
		);
		const confirmation = approvingConfirmation();
		const outcome = await executeLanding(memory.context, executeRequest, {
			confirmation: confirmation.gateway,
			progress: nullLandExecutionProgress,
		});

		expect(outcome).toMatchObject({
			type: "success",
			value: {
				cleanup: {
					freedSlots: [
						{ type: "managed-slot", branch: BRANCH, path: slot.path, slotName: "slot-03" },
					],
				},
			},
		});
		expect(confirmation.requests.map((request) => request.kind)).toEqual([
			"main-landing",
			"free-managed-slots",
		]);
		expect(memory.worktrees.freeSlotsCalls).toHaveLength(1);
	});

	test("returns optional descendant maintenance warnings", async () => {
		const descendant = "feature-child";
		const memory = createInMemoryLandContext(
			linearState({
				git: {
					localBranches: [
						{ name: BRANCH, sha: SHA },
						{ name: descendant, sha: OLD_SHA },
					],
				},
				graphite: {
					stackShape: stackSnapshot({
						current: BRANCH,
						landingBranches: [BRANCH],
						descendantBranches: [descendant],
						descendantRootBranches: [descendant],
					}),
				},
				worktrees: {
					worktrees: [{ path: "/slots/child", branch: descendant }],
					classifications: {
						"/slots/child": { type: "managed-slot", slotName: "slot-child" },
					},
				},
			}),
		);
		const plan = await buildStackLandingPlan(memory.context, ROOT, {
			shouldAllowSubmitRequiredState: true,
		});
		expect(plan.type).toBe("success");
		if (plan.type === "failure") return;
		const execution = await executeStackLandingPlan(memory.context, approvedHost(), plan.value, {
			cwd: ROOT,
		});

		expect(execution).toMatchObject({ type: "success" });
		if (execution.type === "success") {
			expect(execution.value.warnings).toHaveLength(1);
			expect(execution.value.warnings[0]?.message).toContain(
				"descendant restack/update were skipped",
			);
		}
		expect(memory.graphite.deleteLocalBranchCalls).toEqual([]);
	});

	test("propagates retained local-branch cleanup", async () => {
		const memory = createInMemoryLandContext(
			linearState({
				graphite: {
					deleteLocalBranchResults: {
						[BRANCH]: { type: "retained", branch: BRANCH, path: ROOT },
					},
				},
			}),
		);
		const outcome = await executeLanding(memory.context, executeRequest, approvedHost());

		expect(outcome).toMatchObject({
			type: "success",
			value: { cleanup: { retainedLocalBranches: [{ branch: BRANCH, path: ROOT }] } },
		});
	});
});

function linearState(overrides: InMemoryLandContextState = {}): InMemoryLandContextState {
	return {
		git: {
			repoRoot: ROOT,
			currentBranch: BRANCH,
			localBranches: [{ name: BRANCH, sha: SHA }],
			...overrides.git,
		},
		graphite: {
			stackShape: stackSnapshot({ current: BRANCH, landingBranches: [BRANCH] }),
			...overrides.graphite,
		},
		github: {
			pullRequests: [pullRequestFacts({ number: 101, headRefName: BRANCH, headRefOid: SHA })],
			...overrides.github,
		},
		...(overrides.worktrees === undefined ? {} : { worktrees: overrides.worktrees }),
	};
}

function approvedHost(): LandStackExecutionHost {
	return { confirmation: approvingConfirmation().gateway, progress: nullLandExecutionProgress };
}

function approvingConfirmation(): {
	readonly gateway: LandConfirmationGateway;
	readonly requests: readonly LandConfirmationRequest[];
} {
	const requests: LandConfirmationRequest[] = [];
	return {
		gateway: {
			confirm: async (request) => {
				requests.push(request);
				return { type: "approved" };
			},
		},
		requests,
	};
}
