import { describe, expect, test } from "vitest";
import { createInMemoryLandContext, pullRequestFacts } from "../../src/land/testing.ts";
import type { DescendantReconciliationOutcome } from "../../src/land/execution/descendant-reconciliation.ts";
import { reconcilePostTargetSurvivors } from "../../src/land/execution/reconciliation.ts";
import { LAND_BACKUP_RECOVERY_HINT } from "../../src/land/graphite-operations.ts";
import type { InMemoryLandContextState } from "../../src/land/testing.ts";
import {
	FEATURE_A_SHA,
	FEATURE_B_SHA,
	FEATURE_C_SHA,
	METADATA_DB_PATH,
	REPO_ROOT,
	createLandingPlan,
	createMergeLoopState,
	createProgressRecorder,
} from "./land-reconciliation-test-support.ts";

type DescendantWarningGradeOutcome = Extract<DescendantReconciliationOutcome, { kind: "skip" }>;
type DescendantCanReturnWarningGrade = DescendantWarningGradeOutcome extends never ? false : true;
const DESCENDANT_CAN_RETURN_WARNING_GRADE: DescendantCanReturnWarningGrade = false;

describe("Descendant reconciliation", () => {
	test("required descendant reconciliation has no warning-grade outcome", () => {
		expect(DESCENDANT_CAN_RETURN_WARNING_GRADE).toBe(false);
	});

	test.each([
		{
			name: "halts required descendant reconciliation",
			landingBranches: ["feature-a"],
			descendantBranches: ["feature-c"],
			descendantReconciliation: {
				type: "auto" as const,
				branches: ["feature-c"],
				targetBranches: ["feature-c"],
			},
			movedBranch: "feature-c",
			expectedKind: "halt",
		},
	] as const)("guards moved SHAs and $name", async (testCase) => {
		const fakes = createInMemoryLandContext({
			git: {
				localBranches: [
					{ name: "feature-a", sha: FEATURE_A_SHA },
					{ name: testCase.movedBranch, sha: FEATURE_C_SHA },
				],
			},
		});
		const outcome = await reconcilePostTargetSurvivors(
			{ land: fakes.context, progress: createProgressRecorder().progress },
			createLandingPlan({
				landingBranches: testCase.landingBranches,
				descendantBranches: testCase.descendantBranches,
				descendantReconciliation: testCase.descendantReconciliation,
			}),
			[{ branch: "feature-a", number: 1, title: "feature-a" }],
			createMergeLoopState([
				["feature-a", FEATURE_A_SHA],
				[testCase.movedBranch, FEATURE_B_SHA],
			]),
		);

		expect(outcome.kind).toBe(testCase.expectedKind);
		if (outcome.kind === "proceed") throw new Error("expected moved-SHA reconciliation stop");
		const diagnostic = outcome.kind === "halt" ? outcome.failure : outcome.warning;
		expect(diagnostic?.message).toContain(
			`local branch ${testCase.movedBranch} moved from bbbbbbb to ccccccc`,
		);
		expect(diagnostic?.suggestedAction).toContain(LAND_BACKUP_RECOVERY_HINT);
		expect(fakes.graphite.refreshBranchFromRemoteCalls).toEqual([]);
		expect(fakes.graphite.deleteLocalBranchCalls).toEqual([]);
	});

	test("fails checkout-conflicted descendant refresh without later mutations", async () => {
		const conflictResult = {
			type: "exited" as const,
			stdout: "",
			stderr: "fatal: 'feature-c' is already checked out at '/repo-slot'\n",
			code: 1,
			signal: null,
		};
		const fakes = createInMemoryLandContext({
			git: {
				localBranches: [
					{ name: "feature-a", sha: FEATURE_A_SHA },
					{ name: "feature-c", sha: FEATURE_C_SHA },
				],
			},
			graphite: {
				refreshBranchFromRemoteResults: {
					"feature-c": {
						type: "checkout-conflict",
						branch: "feature-c",
						path: "/repo-slot",
						commandDisplay: "gt get feature-c --downstack --force",
						result: conflictResult,
					},
				},
			},
		});
		const progress = createProgressRecorder();
		const outcome = await reconcilePostTargetSurvivors(
			{ land: fakes.context, progress: progress.progress },
			createLandingPlan({
				landingBranches: ["feature-a"],
				descendantBranches: ["feature-c"],
				descendantReconciliation: {
					type: "auto",
					branches: ["feature-c"],
					targetBranches: ["feature-c"],
				},
			}),
			[{ branch: "feature-a", number: 1, title: "feature-a" }],
			createMergeLoopState([
				["feature-a", FEATURE_A_SHA],
				["feature-c", FEATURE_C_SHA],
			]),
		);

		expect(outcome).toMatchObject({
			kind: "halt",
			phase: "post-merge-stack-reconciliation",
			failure: {
				failedBranch: "feature-c",
				message: expect.stringContaining(
					"feature-c could not be refreshed because feature-c is checked out at /repo-slot; it was not mutated",
				),
			},
		});
		expect(fakes.graphite.deleteLocalBranchCalls).toEqual([]);
		expect(fakes.graphite.restackCalls).toEqual([]);
		expect(fakes.graphite.submitUpdateCalls).toEqual([]);
	});

	test("refresh failure is fail-fast before cleanup and later root mutation", async () => {
		const failureResult = {
			type: "exited" as const,
			stdout: "refresh output",
			stderr: "refresh failed",
			code: 7,
			signal: null,
		};
		const fakes = createInMemoryLandContext({
			git: {
				localBranches: [
					{ name: "feature-a", sha: FEATURE_A_SHA },
					{ name: "feature-c", sha: FEATURE_C_SHA },
					{ name: "feature-d", sha: FEATURE_B_SHA },
				],
			},
			graphite: {
				refreshBranchFromRemoteResults: {
					"feature-c": {
						type: "failure",
						commandDisplay: "gt get feature-c",
						result: failureResult,
					},
					"feature-d": {
						type: "failure",
						commandDisplay: "gt get feature-d",
						result: failureResult,
					},
				},
			},
		});
		const outcome = await reconcilePostTargetSurvivors(
			{ land: fakes.context, progress: createProgressRecorder().progress },
			createLandingPlan({
				landingBranches: ["feature-a"],
				descendantBranches: ["feature-c", "feature-d"],
				descendantReconciliation: {
					type: "auto",
					branches: ["feature-c", "feature-d"],
					targetBranches: ["feature-c", "feature-d"],
				},
			}),
			[{ branch: "feature-a", number: 1, title: "feature-a" }],
			createMergeLoopState([
				["feature-a", FEATURE_A_SHA],
				["feature-c", FEATURE_C_SHA],
				["feature-d", FEATURE_B_SHA],
			]),
		);

		expect(outcome).toMatchObject({
			kind: "halt",
			phase: "post-merge-stack-reconciliation",
			failure: { failedBranch: "feature-c" },
		});
		expect(fakes.graphite.refreshBranchFromRemoteCalls.map((call) => call.branch)).toEqual([
			"feature-c",
		]);
		expect(fakes.graphite.deleteLocalBranchCalls).toEqual([]);
		expect(fakes.graphite.restackCalls).toEqual([]);
		expect(fakes.graphite.submitUpdateCalls).toEqual([]);
	});

	test("descendant restack command failure halts reconciliation without cleanup", async () => {
		const fakes = createInMemoryLandContext({
			git: {
				localBranches: [
					{ name: "feature-a", sha: FEATURE_A_SHA },
					{ name: "feature-c", sha: FEATURE_C_SHA },
				],
			},
			graphite: {
				restackResults: {
					"upstack:feature-c": {
						type: "failure",
						commandDisplay: "gt restack custom feature-c",
						result: {
							type: "exited",
							stdout: "partial restack",
							stderr: "restack failed",
							code: 9,
							signal: null,
						},
					},
				},
			},
		});
		const progress = createProgressRecorder();
		const plan = createLandingPlan({
			landingBranches: ["feature-a"],
			descendantBranches: ["feature-c"],
			descendantReconciliation: {
				type: "auto",
				branches: ["feature-c"],
				targetBranches: ["feature-c"],
			},
		});
		const state = createMergeLoopState([
			["feature-a", FEATURE_A_SHA],
			["feature-c", FEATURE_C_SHA],
		]);

		const outcome = await reconcilePostTargetSurvivors(
			{ land: fakes.context, progress: progress.progress },
			plan,
			[{ branch: "feature-a", number: 1, title: "feature-a" }],
			state,
		);

		expect(outcome).toMatchObject({
			kind: "halt",
			phase: "post-merge-stack-reconciliation",
			failure: {
				message: "PR #1 merged, but restack failed for descendant root feature-c.",
				displayCommand: "gt restack custom feature-c",
				execResult: { stdout: "partial restack", stderr: "restack failed", code: 9 },
				failedBranch: "feature-c",
			},
		});
		expect(fakes.graphite.refreshBranchFromRemoteCalls).toEqual([
			{
				repoRoot: REPO_ROOT,
				branch: "feature-c",
				checkedOutConflictHandling: "defer",
			},
		]);
		expect(fakes.graphite.deleteLocalBranchCalls).toEqual([]);
		expect(fakes.graphite.restackCalls).toEqual([
			{ repoRoot: REPO_ROOT, branch: "feature-c", scope: "upstack" },
		]);
		// Submit must not run when the restack step already failed.
		expect(fakes.graphite.submitUpdateCalls).toEqual([]);
	});

	test("zero-exit restack without refreshed-trunk ancestry fails and blocks submit", async () => {
		const fakes = createInMemoryLandContext({
			git: {
				localBranches: [
					{ name: "feature-a", sha: FEATURE_A_SHA },
					{ name: "feature-c", sha: FEATURE_C_SHA },
				],
				branchContainsParents: { "feature-c|main": false },
			},
			graphite: { branchParents: { "feature-c": "main" } },
		});
		const outcome = await reconcilePostTargetSurvivors(
			{ land: fakes.context, progress: createProgressRecorder().progress },
			createLandingPlan({
				landingBranches: ["feature-a"],
				descendantBranches: ["feature-c"],
				descendantReconciliation: {
					type: "auto",
					branches: ["feature-c"],
					targetBranches: ["feature-c"],
				},
			}),
			[{ branch: "feature-a", number: 1, title: "feature-a" }],
			createMergeLoopState([
				["feature-a", FEATURE_A_SHA],
				["feature-c", FEATURE_C_SHA],
			]),
		);

		expect(outcome).toMatchObject({
			kind: "halt",
			phase: "post-merge-stack-reconciliation",
			failure: {
				failedBranch: "feature-c",
				message: expect.stringContaining(
					"gt restack exited 0, but descendant root feature-c still does not contain refreshed trunk main",
				),
			},
		});
		expect(fakes.graphite.restackCalls).toHaveLength(1);
		expect(fakes.graphite.submitUpdateCalls).toEqual([]);
	});

	test("repairs a stale provider parent before restack", async () => {
		const fakes = createInMemoryLandContext({
			git: {
				localBranches: [
					{ name: "feature-a", sha: FEATURE_A_SHA },
					{ name: "feature-c", sha: FEATURE_C_SHA },
				],
			},
			graphite: { branchParents: { "feature-c": "feature-a" } },
		});
		const outcome = await reconcilePostTargetSurvivors(
			{ land: fakes.context, progress: createProgressRecorder().progress },
			createLandingPlan({
				landingBranches: ["feature-a"],
				descendantBranches: ["feature-c"],
				descendantReconciliation: {
					type: "auto",
					branches: ["feature-c"],
					targetBranches: ["feature-c"],
				},
			}),
			[{ branch: "feature-a", number: 1, title: "feature-a" }],
			createMergeLoopState([
				["feature-a", FEATURE_A_SHA],
				["feature-c", FEATURE_C_SHA],
			]),
		);

		expect(fakes.graphite.reparentBranchCalls).toEqual([
			{
				repoRoot: REPO_ROOT,
				branch: "feature-c",
				parent: "main",
			},
		]);
		expect(outcome).toMatchObject({ kind: "halt", phase: "post-merge-stack-reconciliation" });
	});

	test("zero-exit submit with stale remote facts fails reconciliation", async () => {
		const fakes = createInMemoryLandContext({
			git: {
				localBranches: [
					{ name: "feature-a", sha: FEATURE_A_SHA },
					{ name: "feature-c", sha: FEATURE_C_SHA },
				],
			},
			graphite: { branchParents: { "feature-c": "main" } },
			github: {
				// Remote facts stay stale: head on old stack history and base on the landed branch.
				pullRequests: [
					pullRequestFacts({
						number: 3,
						headRefName: "feature-c",
						baseRefName: "feature-a",
						headRefOid: FEATURE_B_SHA,
					}),
				],
			},
		});
		const outcome = await reconcilePostTargetSurvivors(
			{ land: fakes.context, progress: createProgressRecorder().progress },
			createLandingPlan({
				landingBranches: ["feature-a"],
				descendantBranches: ["feature-c"],
				descendantReconciliation: {
					type: "auto",
					branches: ["feature-c"],
					targetBranches: ["feature-c"],
				},
			}),
			[{ branch: "feature-a", number: 1, title: "feature-a" }],
			createMergeLoopState([
				["feature-a", FEATURE_A_SHA],
				["feature-c", FEATURE_C_SHA],
			]),
		);

		expect(outcome).toMatchObject({
			kind: "halt",
			phase: "post-merge-stack-reconciliation",
			failure: {
				failedBranch: "feature-c",
				failedPrNumber: 3,
				message: expect.stringContaining(
					"gt submit exited 0, but GitHub facts for feature-c remain stale",
				),
			},
		});
		expect(fakes.graphite.submitUpdateCalls).toEqual([
			{ repoRoot: REPO_ROOT, branch: "feature-c", force: true },
		]);
	});

	test("reconciles descendants without deleting landed branches", async () => {
		const postRestackSha = "dddddddddddddddddddddddddddddddddddddddd";
		const fakes = createInMemoryLandContext({
			git: {
				localBranches: [
					{ name: "feature-a", sha: FEATURE_A_SHA },
					{ name: "feature-c", sha: FEATURE_C_SHA },
				],
				// Before the restack transition runs, ancestry and topology are stale.
				branchContainsParents: { "feature-c|main": false },
			},
			graphite: { branchParents: { "feature-c": "feature-a" } },
			github: {
				pullRequests: [
					pullRequestFacts({
						number: 3,
						headRefName: "feature-c",
						baseRefName: "feature-a",
						headRefOid: FEATURE_C_SHA,
					}),
				],
			},
			transitions: {
				onRestackSuccess: {
					"feature-c": {
						localSha: postRestackSha,
						containsParents: { main: true },
						providerParent: "main",
					},
				},
				onSubmitUpdateSuccess: {
					"feature-c": { headRefOid: postRestackSha, baseRefName: "main" },
				},
			},
		});
		const state = createMergeLoopState([
			["feature-a", FEATURE_A_SHA],
			["feature-c", FEATURE_C_SHA],
		]);

		const outcome = await reconcilePostTargetSurvivors(
			{ land: fakes.context, progress: createProgressRecorder().progress },
			createLandingPlan({
				landingBranches: ["feature-a"],
				descendantBranches: ["feature-c"],
				descendantReconciliation: {
					type: "auto",
					branches: ["feature-c"],
					targetBranches: ["feature-c"],
				},
			}),
			[{ branch: "feature-a", number: 1, title: "feature-a" }],
			state,
		);

		expect(outcome).toEqual({ kind: "proceed" });
		expect(fakes.graphite.deleteLocalBranchCalls.map((call) => call.branch)).toEqual([]);
		expect(fakes.graphite.reparentBranchCalls.map((call) => call.branch)).toEqual(["feature-c"]);
		expect(fakes.graphite.restackCalls).toEqual([
			{ repoRoot: REPO_ROOT, branch: "feature-c", scope: "upstack" },
		]);
		expect(fakes.graphite.submitUpdateCalls).toEqual([
			{ repoRoot: REPO_ROOT, branch: "feature-c", force: true },
		]);
		expect(fakes.graphite.branchParentCalls).toEqual([
			{ repoRoot: REPO_ROOT, metadataDbPath: METADATA_DB_PATH, branch: "feature-c" },
		]);
		// Post-restack SHA becomes the new expectation for the reconciled root.
		expect(state.expectedShas.get("feature-c")).toBe(postRestackSha);
	});

	test("repairs every deferred descendant root before restacking or publishing", async () => {
		const fakes = createTwoRootReconciliationContext({
			graphite: {
				branchParents: { "feature-c": "feature-a", "feature-d": "feature-a" },
			},
		});
		const outcome = await runTwoRootReconciliation(fakes);

		expect(outcome).toEqual({ kind: "proceed" });
		expect(
			fakes.callEvents.flatMap((event) => {
				switch (event.operation) {
					case "graphite.refreshBranchFromRemote":
					case "graphite.reparentBranch":
					case "graphite.restack":
					case "graphite.submitUpdate":
						return [`${event.operation}:${event.request.branch}`];
					default:
						return [];
				}
			}),
		).toEqual([
			"graphite.refreshBranchFromRemote:feature-c",
			"graphite.refreshBranchFromRemote:feature-d",
			"graphite.reparentBranch:feature-c",
			"graphite.reparentBranch:feature-d",
			"graphite.restack:feature-c",
			"graphite.restack:feature-d",
			"graphite.submitUpdate:feature-c",
			"graphite.submitUpdate:feature-d",
		]);
		expect(fakes.graphite.deleteLocalBranchCalls).toEqual([]);
	});

	test("stops deferred descendant preparation when a later topology repair fails", async () => {
		const commandDisplay = "gt track feature-d --parent main --no-interactive";
		const fakes = createTwoRootReconciliationContext({
			graphite: {
				branchParents: { "feature-c": "feature-a", "feature-d": "feature-a" },
				reparentBranchResults: {
					"feature-d": {
						type: "failure",
						commandDisplay,
						result: {
							type: "exited",
							stdout: "",
							stderr: "track failed",
							code: 1,
							signal: null,
						},
					},
				},
			},
		});
		const outcome = await runTwoRootReconciliation(fakes);

		expect(outcome).toMatchObject({
			kind: "halt",
			phase: "post-merge-stack-reconciliation",
			failure: {
				failedBranch: "feature-d",
				displayCommand: commandDisplay,
				message: "PR #1 merged, but Graphite topology repair failed for descendant root feature-d.",
				suggestedAction: expect.stringContaining(commandDisplay),
			},
		});
		expect(fakes.graphite.reparentBranchCalls.map((call) => call.branch)).toEqual([
			"feature-c",
			"feature-d",
		]);
		expect(fakes.graphite.restackCalls).toEqual([]);
		expect(fakes.graphite.submitUpdateCalls).toEqual([]);
		expect(fakes.graphite.deleteLocalBranchCalls).toEqual([]);
	});

	test("guards every descendant root before mutating any root", async () => {
		const fakes = createTwoRootReconciliationContext();
		const outcome = await runTwoRootReconciliation(fakes, {
			expectedFeatureDSha: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
		});

		expect(outcome).toMatchObject({
			kind: "halt",
			phase: "post-merge-stack-reconciliation",
			failure: { failedBranch: "feature-d", message: expect.stringContaining("moved from") },
		});
		expect(fakes.graphite.refreshBranchFromRemoteCalls).toEqual([]);
		expect(fakes.graphite.deleteLocalBranchCalls).toEqual([]);
		expect(fakes.graphite.restackCalls).toEqual([]);
		expect(fakes.graphite.submitUpdateCalls).toEqual([]);
	});

	test("prepares every descendant root before publishing the first root", async () => {
		const fakes = createTwoRootReconciliationContext();
		const outcome = await runTwoRootReconciliation(fakes);

		expect(outcome).toEqual({ kind: "proceed" });
		expect(
			fakes.callEvents.flatMap((event) => {
				switch (event.operation) {
					case "graphite.restack":
					case "graphite.branchParent":
					case "graphite.submitUpdate":
						return [`${event.operation}:${event.request.branch}`];
					default:
						return [];
				}
			}),
		).toEqual([
			"graphite.restack:feature-c",
			"graphite.branchParent:feature-c",
			"graphite.restack:feature-d",
			"graphite.branchParent:feature-d",
			"graphite.submitUpdate:feature-c",
			"graphite.submitUpdate:feature-d",
		]);
	});

	test("preparation failure blocks all publication and later preparation", async () => {
		const fakes = createTwoRootReconciliationContext({
			graphite: {
				restackResults: {
					"upstack:feature-d": {
						type: "failure",
						commandDisplay: "gt restack feature-d",
						result: {
							type: "exited",
							stdout: "",
							stderr: "restack failed",
							code: 1,
							signal: null,
						},
					},
				},
			},
		});
		const outcome = await runTwoRootReconciliation(fakes);

		expect(outcome).toMatchObject({
			kind: "halt",
			failure: { failedBranch: "feature-d" },
		});
		expect(fakes.graphite.restackCalls.map((call) => call.branch)).toEqual([
			"feature-c",
			"feature-d",
		]);
		expect(fakes.graphite.submitUpdateCalls).toEqual([]);
	});

	test("publication failure is fail-fast after every root is prepared", async () => {
		const fakes = createTwoRootReconciliationContext({
			graphite: {
				submitUpdateResults: {
					"feature-c": {
						type: "failure",
						commandDisplay: "gt submit feature-c",
						result: {
							type: "exited",
							stdout: "",
							stderr: "submit failed",
							code: 1,
							signal: null,
						},
					},
				},
			},
		});
		const outcome = await runTwoRootReconciliation(fakes);

		expect(outcome).toMatchObject({
			kind: "halt",
			failure: { failedBranch: "feature-c" },
		});
		expect(fakes.graphite.restackCalls.map((call) => call.branch)).toEqual([
			"feature-c",
			"feature-d",
		]);
		expect(fakes.graphite.submitUpdateCalls.map((call) => call.branch)).toEqual(["feature-c"]);
	});
});

function createTwoRootReconciliationContext(
	overrides: InMemoryLandContextState = {},
): ReturnType<typeof createInMemoryLandContext> {
	const postRestackShaC = "dddddddddddddddddddddddddddddddddddddddd";
	const postRestackShaD = "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
	return createInMemoryLandContext({
		git: {
			localBranches: [
				{ name: "feature-a", sha: FEATURE_A_SHA },
				{ name: "feature-c", sha: FEATURE_C_SHA },
				{ name: "feature-d", sha: FEATURE_B_SHA },
			],
			...overrides.git,
		},
		graphite: {
			branchParents: { "feature-c": "main", "feature-d": "main" },
			...overrides.graphite,
		},
		github: {
			pullRequests: [
				pullRequestFacts({
					number: 3,
					headRefName: "feature-c",
					baseRefName: "feature-a",
					headRefOid: FEATURE_C_SHA,
				}),
				pullRequestFacts({
					number: 4,
					headRefName: "feature-d",
					baseRefName: "feature-a",
					headRefOid: FEATURE_B_SHA,
				}),
			],
			...overrides.github,
		},
		transitions: {
			onRestackSuccess: {
				"feature-c": {
					localSha: postRestackShaC,
					containsParents: { main: true },
					providerParent: "main",
				},
				"feature-d": {
					localSha: postRestackShaD,
					containsParents: { main: true },
					providerParent: "main",
				},
			},
			onSubmitUpdateSuccess: {
				"feature-c": { headRefOid: postRestackShaC, baseRefName: "main" },
				"feature-d": { headRefOid: postRestackShaD, baseRefName: "main" },
			},
			...overrides.transitions,
		},
	});
}

async function runTwoRootReconciliation(
	fakes: ReturnType<typeof createTwoRootReconciliationContext>,
	options: { readonly expectedFeatureDSha?: string } = {},
): Promise<Awaited<ReturnType<typeof reconcilePostTargetSurvivors>>> {
	return reconcilePostTargetSurvivors(
		{ land: fakes.context, progress: createProgressRecorder().progress },
		createLandingPlan({
			landingBranches: ["feature-a"],
			descendantBranches: ["feature-c", "feature-d"],
			descendantReconciliation: {
				type: "auto",
				branches: ["feature-c", "feature-d"],
				targetBranches: ["feature-c", "feature-d"],
			},
		}),
		[{ branch: "feature-a", number: 1, title: "feature-a" }],
		createMergeLoopState([
			["feature-a", FEATURE_A_SHA],
			["feature-c", FEATURE_C_SHA],
			["feature-d", options.expectedFeatureDSha ?? FEATURE_B_SHA],
		]),
	);
}
