import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import {
	LAND_CAPABILITY_ID,
	LAND_CAPABILITY_METADATA,
	LAND_PACKAGE_NAME,
	collectPrSubmitRequirements,
	collectSubmitRestackRequirements,
	isLandFailure,
	landCompleted,
	landFailure,
	landOutcomeFailure,
	landingParentEdges,
	landSuccess,
	scopeStackSnapshot,
	validateStrictMergeGate,
	type BranchLandingPlan,
	type LandCapabilityMetadata,
	type LandingBoundaryFailure,
	type StackSnapshot,
} from "sdl-flow/land/api";

function describeLandCapability(metadata: LandCapabilityMetadata): string {
	return `${metadata.packageName}:${metadata.capabilityId}:${metadata.tier}`;
}

function raiseMissingBranchPlan(): never {
	throw new Error("Expected test branch plan.");
}

describe("sdl-flow/land API boundary", () => {
	test("exposes land capability package identity through the API subpath", () => {
		expect(describeLandCapability(LAND_CAPABILITY_METADATA)).toBe("sdl-flow:land:capability");
		expect(LAND_CAPABILITY_METADATA).toEqual({
			capabilityId: LAND_CAPABILITY_ID,
			packageName: LAND_PACKAGE_NAME,
			tier: "capability",
		});
	});

	test("keeps public identity constants aligned with package metadata", () => {
		const packageJson = readLandPackageJson();

		expect(LAND_PACKAGE_NAME).toBe(packageJson.name);
		expect(LAND_CAPABILITY_METADATA.packageName).toBe(packageJson.name);
		expect(LAND_CAPABILITY_METADATA.tier).toBe(packageJson.sdl.tier);
		expect(LAND_CAPABILITY_ID).toBe("land");
	});

	test("exports land-owned result helpers", () => {
		const failure: LandingBoundaryFailure = {
			type: "boundary",
			phase: "preflight",
			source: "git",
			code: "failed",
			message: "failed",
		};

		expect(landSuccess("ok")).toEqual({ type: "success", value: "ok" });
		expect(landFailure(failure)).toEqual({ type: "failure", failure });
		expect(landCompleted()).toEqual({ type: "completed" });
		expect(landOutcomeFailure(failure)).toEqual({ type: "failure", failure });
		expect(isLandFailure(landFailure(failure))).toBe(true);
		expect(isLandFailure(landSuccess("ok"))).toBe(false);
		expect(isLandFailure(landCompleted())).toBe(false);
	});

	test("exports renderer-independent preflight utilities", () => {
		const branchPlans: readonly BranchLandingPlan[] = [
			{
				branch: "feature/a",
				localSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
				pr: {
					number: 101,
					title: "Feature A",
					body: null,
					state: "OPEN",
					isDraft: false,
					headRefName: "feature/a",
					baseRefName: "develop",
					headRefOid: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
				},
			},
		];
		const stack: StackSnapshot = {
			trunk: "main",
			current: "feature/b",
			actualCurrentBranch: "feature/b",
			landingTargetBranch: "feature/b",
			landingBranches: ["feature/a", "feature/b"],
			remainingLandingBranches: [],
			descendantBranches: ["feature/c"],
			warnings: [],
		};

		expect(collectPrSubmitRequirements(branchPlans, "main")).toEqual([
			{
				branch: "feature/a",
				prNumber: 101,
				localSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
				prHeadSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
				baseRefName: "develop",
				expectedBaseRefName: "main",
				reasons: ["head bbbbbbb != local aaaaaaa", "base develop != main"],
			},
		]);
		expect(landingParentEdges(stack)).toEqual([
			{ branch: "feature/a", parent: "main" },
			{ branch: "feature/b", parent: "feature/a" },
		]);
		expect(scopeStackSnapshot(stack, 1)).toEqual({
			...stack,
			current: "feature/b",
			landingTargetBranch: "feature/a",
			landingBranches: ["feature/a"],
			remainingLandingBranches: ["feature/b"],
			warnings: [],
		});
		const branchPlan = branchPlans[0] ?? raiseMissingBranchPlan();
		expect(
			validateStrictMergeGate({
				branch: branchPlan.branch,
				localSha: branchPlan.pr.headRefOid,
				pr: branchPlan.pr,
				trunk: "main",
			}),
		).toMatchObject({
			type: "failure",
			failure: {
				type: "domain",
				phase: "merge",
				reason: "pull-request-base-mismatch",
				failedBranch: "feature/a",
				failedPrNumber: 101,
			},
		});
	});

	test("exports submit-restack planning through land gateway vocabulary", async () => {
		const stack: StackSnapshot = {
			trunk: "main",
			current: "feature/b",
			actualCurrentBranch: "feature/b",
			landingTargetBranch: "feature/b",
			landingBranches: ["feature/a", "feature/b"],
			remainingLandingBranches: [],
			descendantBranches: [],
			warnings: [],
		};
		const result = await collectSubmitRestackRequirements(
			{
				git: {
					resolveRepoRoot: async () => landSuccess("/repo"),
					currentBranch: async () => landSuccess("feature/b"),
					workingTreeStatus: async () => landSuccess({ isClean: true }),
					localBranchExists: async () => landCompleted(),
					localBranchSha: async () => landSuccess("aaaaaaaa"),
					listLocalBranches: async () => landSuccess([]),
					branchContainsParent: async ({ branch }) => landSuccess(branch === "feature/a"),
					snapshotBackupRefs: async () => landSuccess(new Map()),
				},
				graphite: {
					trunk: async () => landSuccess("main"),
					metadataDbPath: async () => landSuccess("/repo/.git/graphite.db"),
					stackShape: async () => landSuccess(stack),
					prepareSubmitUpdate: async () => landCompleted(),
					prepareRestackForSubmit: async () => landCompleted(),
					refreshBranchFromRemote: async () => ({
						type: "success",
						result: { stdout: "", stderr: "", code: 0, killed: false },
					}),
					deleteLocalBranch: async () => ({ type: "deleted" }),
					restackUpstack: async () => ({
						type: "success",
						result: { stdout: "", stderr: "", code: 0, killed: false },
					}),
					submitUpdate: async () => ({
						type: "success",
						result: { stdout: "", stderr: "", code: 0, killed: false },
					}),
					branchChildren: async () => landSuccess([]),
				},
				github: {
					pullRequestFacts: async () =>
						landSuccess({
							number: 1,
							title: "Feature",
							body: null,
							state: "OPEN",
							isDraft: false,
							headRefName: "feature/a",
							baseRefName: "main",
							headRefOid: "aaaaaaaa",
						}),
					squashMergePullRequest: async () => landSuccess({ stdout: "", stderr: "" }),
				},
				worktrees: {
					worktrees: async () => landSuccess([]),
					classifyWorktree: async () => landSuccess({ type: "manual-worktree" }),
					freeSlots: async ({ slots }) => landSuccess(slots),
				},
			},
			"/repo",
			stack,
		);

		expect(result).toEqual({
			type: "success",
			value: [{ branch: "feature/b", parent: "feature/a" }],
		});
	});
});

interface LandPackageJson {
	readonly name: string;
	readonly sdl: { readonly tier: "capability" };
}

function readLandPackageJson(): LandPackageJson {
	const raw = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
	if (!isLandPackageJson(raw)) {
		throw new Error("sdl-flow package.json does not match expected test shape");
	}
	return raw;
}

function isLandPackageJson(value: unknown): value is LandPackageJson {
	return (
		typeof value === "object" &&
		value !== null &&
		"name" in value &&
		typeof value.name === "string" &&
		"sdl" in value &&
		typeof value.sdl === "object" &&
		value.sdl !== null &&
		"tier" in value.sdl &&
		value.sdl.tier === "capability"
	);
}
