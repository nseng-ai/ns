import { describe, expect, test } from "vitest";

import {
	executeLanding,
	nullLandConfirmationGateway,
	nullLandExecutionProgress,
	type LandConfirmationDecision,
	type LandConfirmationGateway,
	type LandConfirmationRequest,
	type LandStackExecutionHost,
	type LandingCleanupPolicy,
	type LandingExecutionReport,
	type LandingRequest,
	type StackLandingShape,
} from "@nseng-ai/flow/land/api";
import {
	createInMemoryLandContext,
	pullRequestFacts,
	stackSnapshot,
	type InMemoryLandContextState,
} from "@nseng-ai/flow/land/testing";

const ROOT = "/repo";
const SLOT_ROOT = "/state/ns/slots/repos/repo/worktrees/slot-02";
const BRANCH = "feature-a";
const SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const OLD_SHA = "1111111111111111111111111111111111111111";

function executeRequest(
	overrides: Partial<Pick<LandingRequest, "cwd" | "mode" | "cleanup">> = {},
): LandingRequest {
	return {
		cwd: overrides.cwd ?? ROOT,
		target: { type: "stack" },
		mode: overrides.mode ?? "execute",
		preflight: { shouldAllowSubmitRequiredState: true },
		cleanup: overrides.cleanup ?? "free-slot",
	};
}

describe("land execute mode over in-memory gateways", () => {
	test("lands a linear stack and mirrors the semantic sequence of the permanent single-PR transcript", async () => {
		const memory = createInMemoryLandContext(linearState());
		const outcome = await executeLanding({
			context: memory.context,
			source: { type: "discover" },
			request: executeRequest(),
			host: approvedHost(),
		});

		expect(outcome).toMatchObject({
			type: "completed",
			report: {
				repoRoot: ROOT,
				completionDisposition: { type: "stack-execution" },
				phases: [
					{ type: "completed", phase: "repo-discovery" },
					{ type: "completed", phase: "stack-shape" },
					{ type: "completed", phase: "preflight" },
					{ type: "completed", phase: "confirmation" },
					{ type: "completed", phase: "merge" },
					{
						type: "skipped",
						phase: "descendant-maintenance",
						reason: "no descendant branches require maintenance",
					},
					{ type: "completed", phase: "merge-maintenance-cleanup" },
					{
						type: "skipped",
						phase: "post-landing-cleanup",
						reason: "current worktree is not a managed slot",
					},
				],
				landedChunks: [
					{
						index: 0,
						landingTargetBranch: BRANCH,
						landed: [{ branch: BRANCH, number: 101, title: "PR 101" }],
					},
				],
				cleanup: {
					preMergeFreedSlots: [],
					mergeMaintenanceCleanup: {
						deletedLocalBranches: [BRANCH],
						retainedLocalBranches: [],
					},
					postLandingSlotCleanup: { type: "not-applicable" },
				},
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
		const outcome = await executeLanding({
			context: memory.context,
			source: { type: "discover" },
			request: executeRequest(),
			host: {
				confirmation: nullLandConfirmationGateway,
				progress: nullLandExecutionProgress,
			},
		});

		expect(outcome).toMatchObject({
			type: "failed",
			failure: {
				type: "execution",
				outcome: "refusal",
				refusalReason: "non-interactive",
			},
			report: {
				phases: [
					{ type: "completed", phase: "repo-discovery" },
					{ type: "completed", phase: "stack-shape" },
					{ type: "completed", phase: "preflight" },
					{ type: "failed", phase: "confirmation" },
				],
				landedChunks: [],
			},
		});
		expect(memory.github.squashMergePullRequestCalls).toEqual([]);
		expect(memory.git.snapshotBackupRefsCalls).toEqual([]);
	});

	test("a declined main confirmation fails the confirmation phase with zero merge facts", async () => {
		const memory = createInMemoryLandContext(linearState());
		const confirmation = decidingConfirmation({ "main-landing": { type: "declined" } });
		const outcome = await executeLanding({
			context: memory.context,
			source: { type: "discover" },
			request: executeRequest(),
			host: {
				confirmation: confirmation.gateway,
				progress: nullLandExecutionProgress,
			},
		});

		expect(outcome).toMatchObject({
			type: "failed",
			failure: {
				type: "execution",
				outcome: "refusal",
				refusalReason: "declined",
				message: "Cancelled before merge; no PRs were landed.",
			},
		});
		if (outcome.type !== "failed") return;
		expect(outcome.report.phases.some((phase) => phase.phase === "merge")).toBe(false);
		expect(outcome.report.phases.at(-1)).toMatchObject({
			type: "failed",
			phase: "confirmation",
		});
		expect(memory.github.squashMergePullRequestCalls).toEqual([]);
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
		const outcome = await executeLanding({
			context: memory.context,
			source: { type: "discover" },
			request: executeRequest(),
			host: {
				confirmation: confirmation.gateway,
				progress: nullLandExecutionProgress,
			},
		});

		expect(outcome).toMatchObject({
			type: "failed",
			failure: { message: expect.stringContaining("GitHub PR metadata still differs") },
		});
		expect(memory.graphite.prepareSubmitUpdateCalls).toEqual([{ repoRoot: ROOT, branch: BRANCH }]);
		expect(confirmation.requests.map((request) => request.kind)).toEqual([
			"main-landing",
			"submit-required-updates",
		]);
		expect(memory.github.squashMergePullRequestCalls).toEqual([]);
	});

	test("frees a managed-slot conflict before landing and reports the pre-merge freed slot", async () => {
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
		const outcome = await executeLanding({
			context: memory.context,
			source: { type: "discover" },
			request: executeRequest(),
			host: {
				confirmation: confirmation.gateway,
				progress: nullLandExecutionProgress,
			},
		});

		expect(outcome).toMatchObject({
			type: "completed",
			report: {
				cleanup: {
					preMergeFreedSlots: [
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

	test("preserves rich slot-free boundary diagnostics through the pre-merge failure", async () => {
		const slot = { path: "/slots/slot-03", branch: BRANCH };
		const execResult = {
			type: "exited" as const,
			stdout: "slot output",
			stderr: "slot error",
			code: 3,
			signal: null,
		};
		const memory = createInMemoryLandContext(
			linearState({
				worktrees: {
					worktrees: [slot],
					classifications: { [slot.path]: { type: "managed-slot", slotName: "slot-03" } },
					freeSlotsFailure: {
						type: "boundary",
						phase: "submit-preparation",
						source: "slot",
						code: "slot_free_failed",
						message: "Targeted slot cleanup failed before any PRs were landed.",
						displayCommand: "ns slot free --wt slot-03",
						execResult,
					},
				},
			}),
		);
		const outcome = await executeLanding({
			context: memory.context,
			source: { type: "discover" },
			request: executeRequest(),
			host: approvedHost(),
		});

		expect(outcome).toMatchObject({
			type: "failed",
			failure: {
				type: "boundary",
				source: "slot",
				code: "slot_free_failed",
				displayCommand: "ns slot free --wt slot-03",
				execResult,
				suggestedAction:
					"Inspect the slot state, free or detach blocking landing-branch worktrees manually, then rerun /ns:flow:land.",
			},
		});
		if (outcome.type !== "failed") return;
		expect(outcome.report.phases.at(-1)).toMatchObject({
			type: "failed",
			phase: "submit-preparation",
		});
		expect(memory.github.squashMergePullRequestCalls).toEqual([]);
	});

	test("preserves rich submit boundary diagnostics through the pre-merge failure", async () => {
		const execResult = {
			type: "exited" as const,
			stdout: "submit out",
			stderr: "submit err",
			code: 1,
			signal: null,
		};
		const memory = createInMemoryLandContext(
			linearState({
				github: {
					pullRequests: [
						pullRequestFacts({ number: 101, headRefName: BRANCH, headRefOid: OLD_SHA }),
					],
				},
				graphite: {
					stackShape: stackSnapshot({ current: BRANCH, landingBranches: [BRANCH] }),
					submitUpdateResults: {
						[BRANCH]: {
							type: "failure",
							failure: {
								type: "boundary",
								phase: "submit-preparation",
								source: "graphite",
								code: "submit_update_failed",
								message: "gt submit/update failed before any PRs were landed.",
								displayCommand: "gt submit --branch feature-a",
								execResult,
							},
						},
					},
				},
			}),
		);
		const outcome = await executeLanding({
			context: memory.context,
			source: { type: "discover" },
			request: executeRequest(),
			host: approvedHost(),
		});

		expect(outcome).toMatchObject({
			type: "failed",
			failure: {
				type: "boundary",
				source: "graphite",
				code: "submit_update_failed",
				displayCommand: "gt submit --branch feature-a",
				execResult,
				suggestedAction: expect.stringContaining("Resolve the submit failure"),
			},
		});
	});

	test("returns optional descendant maintenance warnings with a skipped observed phase", async () => {
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
		const outcome = await executeLanding({
			context: memory.context,
			source: { type: "discover" },
			request: executeRequest(),
			host: approvedHost(),
		});

		expect(outcome).toMatchObject({ type: "completed" });
		if (outcome.type !== "completed") return;
		expect(outcome.report.warnings).toHaveLength(1);
		expect(outcome.report.warnings[0]?.message).toContain("descendant restack/update were skipped");
		expect(phaseByName(outcome.report, "descendant-maintenance")).toMatchObject({
			type: "skipped",
			reason: "descendant branches are checked out elsewhere",
		});
		expect(memory.graphite.deleteLocalBranchCalls).toEqual([]);
	});

	test("reports completed descendant maintenance from observed operations", async () => {
		const descendant = "feature-child";
		const descendantSha = "cccccccccccccccccccccccccccccccccccccccc";
		const memory = createInMemoryLandContext(
			linearState({
				git: {
					localBranches: [
						{ name: BRANCH, sha: SHA },
						{ name: descendant, sha: descendantSha },
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
				github: {
					pullRequests: [
						pullRequestFacts({ number: 101, headRefName: BRANCH, headRefOid: SHA }),
						pullRequestFacts({
							number: 102,
							headRefName: descendant,
							headRefOid: descendantSha,
							baseRefName: "main",
						}),
					],
				},
			}),
		);
		const outcome = await executeLanding({
			context: memory.context,
			source: { type: "discover" },
			request: executeRequest(),
			host: approvedHost(),
		});

		expect(outcome).toMatchObject({ type: "completed" });
		if (outcome.type !== "completed") return;
		expect(phaseByName(outcome.report, "descendant-maintenance")).toMatchObject({
			type: "completed",
		});
		expect(outcome.report.cleanup.mergeMaintenanceCleanup.deletedLocalBranches).toEqual([BRANCH]);
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
		const outcome = await executeLanding({
			context: memory.context,
			source: { type: "discover" },
			request: executeRequest(),
			host: approvedHost(),
		});

		expect(outcome).toMatchObject({
			type: "completed",
			report: {
				cleanup: {
					mergeMaintenanceCleanup: {
						retainedLocalBranches: [{ branch: BRANCH, path: ROOT }],
					},
				},
			},
		});
	});

	test("retains the first landed chunk and observed cleanup when a later merge fails", async () => {
		const branchB = "feature-b";
		const shaB = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
		const memory = createInMemoryLandContext({
			git: {
				repoRoot: ROOT,
				currentBranch: branchB,
				localBranches: [
					{ name: BRANCH, sha: SHA },
					{ name: branchB, sha: shaB },
				],
			},
			graphite: {
				stackShape: stackSnapshot({
					current: branchB,
					actualCurrentBranch: branchB,
					landingTargetBranch: branchB,
					landingBranches: [BRANCH, branchB],
				}),
			},
			github: {
				pullRequests: [
					pullRequestFacts({ number: 101, headRefName: BRANCH, headRefOid: SHA }),
					pullRequestFacts({
						number: 102,
						headRefName: branchB,
						headRefOid: shaB,
						baseRefName: "main",
					}),
				],
				squashMergeResults: { "102": { type: "failure" } },
			},
		});
		const outcome = await executeLanding({
			context: memory.context,
			source: { type: "discover" },
			request: executeRequest(),
			host: approvedHost(),
		});

		expect(outcome).toMatchObject({ type: "failed" });
		if (outcome.type !== "failed") return;
		expect(outcome.report.landedChunks).toMatchObject([
			{ landed: [{ branch: BRANCH, number: 101 }] },
		]);
		expect(outcome.report.cleanup.mergeMaintenanceCleanup.deletedLocalBranches).toEqual([BRANCH]);
		expect(phaseByName(outcome.report, "merge-maintenance-cleanup")).toMatchObject({
			type: "completed",
		});
		expect(outcome.report.phases.at(-1)).toMatchObject({ type: "failed", phase: "merge" });
		expect(outcome.report.cleanup.postLandingSlotCleanup).toMatchObject({ type: "not-run" });
	});
});

describe("post-landing managed-slot cleanup under canonical execution", () => {
	test("free-slot policy confirms cleanup before merge and mutates only after landing", async () => {
		const memory = createInMemoryLandContext(managedSlotState());
		const confirmation = approvingConfirmation();
		const outcome = await executeLanding({
			context: memory.context,
			source: { type: "discover" },
			request: executeRequest({ cwd: SLOT_ROOT, cleanup: "free-slot" }),
			host: { confirmation: confirmation.gateway, progress: nullLandExecutionProgress },
		});

		expect(confirmation.requests.map((request) => request.kind)).toEqual([
			"main-landing",
			"post-landing-cleanup",
		]);
		expect(outcome).toMatchObject({
			type: "completed",
			report: {
				cleanup: {
					postLandingSlotCleanup: {
						type: "completed",
						freedSlot: { slotName: "slot-02", branch: BRANCH },
						deletedLocalBranch: BRANCH,
					},
				},
			},
		});
		if (outcome.type !== "completed") return;
		expect(phaseByName(outcome.report, "post-landing-cleanup")).toMatchObject({
			type: "completed",
		});
		expect(memory.worktrees.freeSlotsCalls).toHaveLength(1);
	});

	test("preserve policy makes no cleanup confirmation or mutation and reports preserved", async () => {
		const memory = createInMemoryLandContext(managedSlotState());
		const confirmation = approvingConfirmation();
		const outcome = await executeLanding({
			context: memory.context,
			source: { type: "discover" },
			request: executeRequest({ cwd: SLOT_ROOT, cleanup: "preserve" }),
			host: { confirmation: confirmation.gateway, progress: nullLandExecutionProgress },
		});

		expect(confirmation.requests.map((request) => request.kind)).toEqual(["main-landing"]);
		expect(outcome).toMatchObject({
			type: "completed",
			report: { cleanup: { postLandingSlotCleanup: { type: "preserved" } } },
		});
		if (outcome.type !== "completed") return;
		expect(phaseByName(outcome.report, "post-landing-cleanup")).toMatchObject({
			type: "skipped",
		});
		expect(memory.worktrees.freeSlotsCalls).toEqual([]);
	});

	test("force-cleanup policy skips the cleanup confirmation and performs the same mutations", async () => {
		const memory = createInMemoryLandContext(managedSlotState());
		const confirmation = approvingConfirmation();
		const outcome = await executeLanding({
			context: memory.context,
			source: { type: "discover" },
			request: executeRequest({ cwd: SLOT_ROOT, cleanup: "force-cleanup" }),
			host: { confirmation: confirmation.gateway, progress: nullLandExecutionProgress },
		});

		expect(confirmation.requests.map((request) => request.kind)).toEqual(["main-landing"]);
		expect(outcome).toMatchObject({
			type: "completed",
			report: {
				cleanup: {
					postLandingSlotCleanup: { type: "completed", deletedLocalBranch: BRANCH },
				},
			},
		});
		expect(memory.worktrees.freeSlotsCalls).toHaveLength(1);
	});

	test("upfront-approved cleanup does not prompt a second time", async () => {
		const memory = createInMemoryLandContext(managedSlotState());
		const upfrontConfirmation = decidingConfirmation({
			"main-landing": { type: "approved", approvalSource: "approved-upfront" },
			"post-landing-cleanup": { type: "approved", approvalSource: "approved-upfront" },
		});
		const outcome = await executeLanding({
			context: memory.context,
			source: { type: "discover" },
			request: executeRequest({ cwd: SLOT_ROOT, cleanup: "free-slot" }),
			host: {
				confirmation: upfrontConfirmation.gateway,
				progress: nullLandExecutionProgress,
			},
		});

		expect(upfrontConfirmation.requests.map((request) => request.kind)).toEqual([
			"main-landing",
			"post-landing-cleanup",
		]);
		expect(outcome).toMatchObject({
			type: "completed",
			report: { cleanup: { postLandingSlotCleanup: { type: "completed" } } },
		});
		if (outcome.type !== "completed") return;
		expect(phaseByName(outcome.report, "confirmation")).toEqual({
			type: "skipped",
			phase: "confirmation",
			reason: "approved upfront before canonical execution",
		});
	});

	test.each<LandingCleanupPolicy>(["preserve", "free-slot", "force-cleanup"])(
		"dry run with %s policy performs no mutation",
		async (policy) => {
			const memory = createInMemoryLandContext(managedSlotState());
			const confirmation = approvingConfirmation();
			const outcome = await executeLanding({
				context: memory.context,
				source: { type: "discover" },
				request: executeRequest({ cwd: SLOT_ROOT, mode: "dry-run", cleanup: policy }),
				host: { confirmation: confirmation.gateway, progress: nullLandExecutionProgress },
			});

			expect(confirmation.requests).toEqual([]);
			expect(memory.worktrees.freeSlotsCalls).toEqual([]);
			expect(memory.github.squashMergePullRequestCalls).toEqual([]);
			expect(outcome).toMatchObject({
				type: "completed",
				report: {
					completionDisposition: { type: "stack-execution" },
					cleanup: {
						// Dry run dominates every cleanup policy.
						postLandingSlotCleanup: { type: "dry-run" },
					},
				},
			});
		},
	);

	test("declined cleanup lands the stack and fails with the partial report intact", async () => {
		const memory = createInMemoryLandContext(managedSlotState());
		const confirmation = decidingConfirmation({
			"post-landing-cleanup": { type: "declined" },
		});
		const outcome = await executeLanding({
			context: memory.context,
			source: { type: "discover" },
			request: executeRequest({ cwd: SLOT_ROOT, cleanup: "free-slot" }),
			host: { confirmation: confirmation.gateway, progress: nullLandExecutionProgress },
		});

		expect(outcome).toMatchObject({
			type: "failed",
			failure: {
				type: "execution",
				level: "warning",
				outcome: "refusal",
				message: expect.stringContaining("Skipped post-landing cleanup by upfront choice"),
			},
			report: {
				landedChunks: [{ landed: [{ number: 101 }] }],
				cleanup: {
					postLandingSlotCleanup: { type: "declined", slotName: "slot-02", branch: BRANCH },
				},
			},
		});
		expect(memory.worktrees.freeSlotsCalls).toEqual([]);
	});

	test("slot free failure after landing keeps landed chunks and reports failed cleanup", async () => {
		const memory = createInMemoryLandContext(
			managedSlotState({
				worktrees: {
					freeSlotsFailure: {
						type: "boundary",
						phase: "post-landing-cleanup",
						source: "slot",
						code: "slot_free_failed",
						message: "slot free failed",
					},
				},
			}),
		);
		const outcome = await executeLanding({
			context: memory.context,
			source: { type: "discover" },
			request: executeRequest({ cwd: SLOT_ROOT, cleanup: "force-cleanup" }),
			host: approvedHost(),
		});

		expect(outcome).toMatchObject({
			type: "failed",
			failure: { message: expect.stringContaining("freeing slot-02 failed") },
			report: {
				landedChunks: [{ landed: [{ number: 101 }] }],
				cleanup: { postLandingSlotCleanup: { type: "failed" } },
			},
		});
		if (outcome.type !== "failed") return;
		const postCleanup = outcome.report.cleanup.postLandingSlotCleanup;
		expect(postCleanup.type === "failed" && postCleanup.freedSlot === undefined).toBe(true);
	});

	test("branch deletion failure after slot free retains the freed slot as a partial fact", async () => {
		const memory = createInMemoryLandContext(
			managedSlotState({
				graphite: {
					stackShape: stackSnapshot({ current: BRANCH, landingBranches: [BRANCH] }),
					deleteLocalBranchResults: {
						[BRANCH]: {
							type: "failed",
							isLikelyInProgressGitOperation: false,
							commandDisplay: "gt delete feature-a",
							result: {
								type: "exited",
								stdout: "",
								stderr: "delete failed",
								code: 1,
								signal: null,
							},
						},
					},
				},
			}),
		);
		const outcome = await executeLanding({
			context: memory.context,
			source: { type: "discover" },
			request: executeRequest({ cwd: SLOT_ROOT, cleanup: "force-cleanup" }),
			host: approvedHost(),
		});

		expect(outcome).toMatchObject({
			type: "failed",
			failure: {
				message: expect.stringContaining("deleting local branch feature-a failed"),
			},
			report: {
				landedChunks: [{ landed: [{ number: 101 }] }],
				cleanup: {
					postLandingSlotCleanup: {
						type: "failed",
						freedSlot: { type: "managed-slot", slotName: "slot-02" },
					},
				},
			},
		});
	});

	test("rejects a prepared stack shape for an isolated target before discovery", async () => {
		const memory = createInMemoryLandContext();
		const outcome = await executeLanding({
			context: memory.context,
			source: { type: "prepared", shape: stackLandingShape() },
			request: {
				...executeRequest(),
				target: { type: "isolated-pull-request", branchOrNumber: "feature-a" },
			},
			host: approvedHost(),
		});

		expect(outcome).toMatchObject({
			type: "failed",
			failure: { type: "not-implemented", phase: "request-validation" },
		});
		expect(memory.git.resolveRepoRootCalls).toEqual([]);
	});

	test("rejects a prepared shape that cannot represent the requested branch scope", async () => {
		const memory = createInMemoryLandContext();
		const outcome = await executeLanding({
			context: memory.context,
			source: { type: "prepared", shape: stackLandingShape() },
			request: { ...executeRequest(), target: { type: "stack", landingBranchLimit: 2 } },
			host: approvedHost(),
		});

		expect(outcome).toMatchObject({
			type: "failed",
			failure: { type: "not-implemented", phase: "request-validation" },
		});
		expect(memory.git.resolveRepoRootCalls).toEqual([]);
	});

	test("cleanup-only trunk landing frees the slot and keeps the trunk branch", async () => {
		const memory = createInMemoryLandContext({
			git: {
				repoRoot: SLOT_ROOT,
				currentBranch: "main",
				localBranches: [{ name: "main", sha: SHA }],
			},
			graphite: {
				stackShape: stackSnapshot({
					trunk: "main",
					current: "main",
					actualCurrentBranch: "main",
					landingTargetBranch: "main",
					landingBranches: [],
				}),
			},
		});
		const confirmation = approvingConfirmation();
		const outcome = await executeLanding({
			context: memory.context,
			source: { type: "discover" },
			request: executeRequest({ cwd: SLOT_ROOT, cleanup: "free-slot" }),
			host: { confirmation: confirmation.gateway, progress: nullLandExecutionProgress },
		});

		expect(confirmation.requests.map((request) => request.kind)).toEqual(["post-landing-cleanup"]);
		expect(outcome).toMatchObject({
			type: "completed",
			report: {
				completionDisposition: { type: "cleanup-only" },
				landedChunks: [],
				cleanup: {
					postLandingSlotCleanup: {
						type: "completed",
						keptTrunkBranch: "main",
					},
				},
			},
		});
		if (outcome.type !== "completed") return;
		expect(phaseByName(outcome.report, "merge")).toMatchObject({ type: "skipped" });
		expect(memory.worktrees.freeSlotsCalls).toHaveLength(1);
		expect(memory.graphite.deleteLocalBranchCalls).toEqual([]);
		expect(memory.github.squashMergePullRequestCalls).toEqual([]);
	});

	test("cleanup-only no-PR-path landing frees the managed slot and deletes its branch", async () => {
		const memory = createInMemoryLandContext({
			git: {
				repoRoot: SLOT_ROOT,
				currentBranch: BRANCH,
				localBranches: [{ name: BRANCH, sha: SHA }],
			},
			graphite: {
				stackShape: stackSnapshot({
					current: BRANCH,
					actualCurrentBranch: BRANCH,
					landingTargetBranch: BRANCH,
					landingBranches: [],
				}),
			},
		});
		const outcome = await executeLanding({
			context: memory.context,
			source: { type: "discover" },
			request: executeRequest({ cwd: SLOT_ROOT, cleanup: "free-slot" }),
			host: approvedHost(),
		});

		expect(outcome).toMatchObject({
			type: "completed",
			report: {
				completionDisposition: { type: "cleanup-only" },
				cleanup: {
					postLandingSlotCleanup: {
						type: "completed",
						deletedLocalBranch: BRANCH,
					},
				},
			},
		});
		expect(memory.worktrees.freeSlotsCalls).toHaveLength(1);
		expect(memory.graphite.deleteLocalBranchCalls).toHaveLength(1);
		expect(memory.github.squashMergePullRequestCalls).toEqual([]);
	});

	test.each([
		{ name: "preserve", cwd: SLOT_ROOT, mode: "execute", cleanup: "preserve" },
		{ name: "dry run", cwd: SLOT_ROOT, mode: "dry-run", cleanup: "free-slot" },
		{ name: "unmanaged checkout", cwd: ROOT, mode: "execute", cleanup: "free-slot" },
	] as const)("completes trunk $name as informational nothing-to-land", async (scenario) => {
		const memory = createInMemoryLandContext({
			git: {
				repoRoot: scenario.cwd,
				currentBranch: "main",
				localBranches: [{ name: "main", sha: SHA }],
			},
			graphite: {
				stackShape: stackSnapshot({
					trunk: "main",
					current: "main",
					actualCurrentBranch: "main",
					landingTargetBranch: "main",
					landingBranches: [],
				}),
			},
		});
		const confirmation = approvingConfirmation();
		const outcome = await executeLanding({
			context: memory.context,
			source: { type: "discover" },
			request: executeRequest({
				cwd: scenario.cwd,
				mode: scenario.mode,
				cleanup: scenario.cleanup,
			}),
			host: { confirmation: confirmation.gateway, progress: nullLandExecutionProgress },
		});

		expect(outcome).toMatchObject({
			type: "completed",
			report: {
				completionDisposition: { type: "nothing-to-land", currentBranch: "main" },
				landedChunks: [],
			},
		});
		expect(confirmation.requests).toEqual([]);
		expect(memory.worktrees.freeSlotsCalls).toEqual([]);
		expect(memory.graphite.deleteLocalBranchCalls).toEqual([]);
		expect(memory.github.squashMergePullRequestCalls).toEqual([]);
	});
});

function phaseByName(
	report: LandingExecutionReport,
	phase: LandingExecutionReport["phases"][number]["phase"],
): LandingExecutionReport["phases"][number] | undefined {
	return report.phases.find((entry) => entry.phase === phase);
}

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

function stackLandingShape(): StackLandingShape {
	return {
		repoRoot: ROOT,
		current: BRANCH,
		trunk: "main",
		metadataDbPath: `${ROOT}/.git/graphite.db`,
		stack: stackSnapshot({ current: BRANCH, landingBranches: [BRANCH] }),
		localBranches: [{ name: BRANCH, sha: SHA }],
	};
}

function managedSlotState(overrides: InMemoryLandContextState = {}): InMemoryLandContextState {
	return linearState({
		git: {
			repoRoot: SLOT_ROOT,
			currentBranch: BRANCH,
			localBranches: [{ name: BRANCH, sha: SHA }],
			...overrides.git,
		},
		...(overrides.graphite === undefined ? {} : { graphite: overrides.graphite }),
		...(overrides.github === undefined ? {} : { github: overrides.github }),
		...(overrides.worktrees === undefined ? {} : { worktrees: overrides.worktrees }),
	});
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
				return { type: "approved", approvalSource: "prompted" };
			},
		},
		requests,
	};
}

function decidingConfirmation(
	decisions: Partial<Record<LandConfirmationRequest["kind"], LandConfirmationDecision>>,
): {
	readonly gateway: LandConfirmationGateway;
	readonly requests: readonly LandConfirmationRequest[];
} {
	const requests: LandConfirmationRequest[] = [];
	return {
		gateway: {
			confirm: async (request) => {
				requests.push(request);
				return decisions[request.kind] ?? { type: "approved", approvalSource: "prompted" };
			},
		},
		requests,
	};
}
