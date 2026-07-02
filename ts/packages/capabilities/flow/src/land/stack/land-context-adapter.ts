import { formatCommand } from "@sdl/core/command";
import { landCompleted, landFailure, landOutcomeFailure, landSuccess } from "../api.ts";
import type {
	LandContext,
	LandingFailure,
	LandOutcome,
	LandResult,
	WorkingTreeStatus,
	WorktreeClassification,
} from "../api.ts";
import { exec } from "./command-exec.ts";
import { GIT_TIMEOUT_MS } from "./constants.ts";
import { failure, landStackFailure, success, type LandStackResult } from "./errors.ts";
import { resolveMetadataDbPath } from "./graphite-topology.ts";
import { loadPr } from "./pr-facts.ts";
import {
	assertLocalBranchExists,
	detectInProgressOperation,
	loadCurrentBranch,
	loadLandingShape,
	loadLiveLocalBranches,
	loadLocalSha,
	loadRepoRoot,
	loadTrunk,
} from "./stack-facts.ts";
import type { LandStackExtensionAPI } from "./types.ts";
import {
	isManagedSlotPath,
	loadWorktrees,
	normalizeExistingPath,
	slotNameFromPath,
} from "./worktrees.ts";
import type { LandingFailureSource } from "./plan-mapping.ts";
import type { LandStackFailure } from "./errors.ts";

export function createLandContext(pi: LandStackExtensionAPI): LandContext {
	return {
		git: {
			resolveRepoRoot: async ({ cwd }) => toLandResult(await loadRepoRoot(pi, cwd), "git"),
			currentBranch: async ({ repoRoot }) =>
				toLandResult(await loadCurrentBranch(pi, repoRoot), "git"),
			workingTreeStatus: async ({ repoRoot }) => loadWorkingTreeStatus(pi, repoRoot),
			localBranchExists: async ({ repoRoot, branch }) =>
				loadLocalBranchExists(pi, repoRoot, branch),
			localBranchSha: async ({ repoRoot, branch }) =>
				toLandResult(await loadLocalSha(pi, repoRoot, branch), "git"),
			listLocalBranches: async ({ repoRoot }) => loadLocalBranches(pi, repoRoot),
			branchContainsParent: async ({ repoRoot, branch, parent }) =>
				loadBranchContainsParent({ pi, repoRoot, branch, parent }),
		},
		graphite: {
			trunk: async ({ repoRoot }) => toLandResult(await loadTrunk(pi, repoRoot), "graphite"),
			metadataDbPath: async ({ repoRoot }) =>
				toLandResult(await resolveMetadataDbPath(pi, repoRoot), "graphite"),
			stackShape: async (request) => {
				const shape = await loadLandingShape(pi, request.repoRoot);
				if (shape.type === "failure") return toLandResult(shape, "graphite");
				return landSuccess({
					...shape.value.stack,
					warnings: shape.value.stack.warnings.map((message) => ({ level: "warning", message })),
				});
			},
			prepareSubmitUpdate: async () => landCompleted(),
			prepareRestackForSubmit: async () => landCompleted(),
		},
		github: {
			pullRequestFacts: async ({ repoRoot, branchOrNumber }) => {
				const pr = await loadPr(pi, repoRoot, branchOrNumber);
				if (pr.type === "failure") return toLandResult(pr, "github");
				return landSuccess({
					number: pr.value.number,
					title: pr.value.title,
					body: pr.value.body,
					state: pr.value.state,
					isDraft: pr.value.isDraft,
					headRefName: pr.value.headRefName,
					baseRefName: pr.value.baseRefName,
					headRefOid: pr.value.headRefOid,
					...(pr.value.mergeStateStatus === undefined
						? {}
						: { mergeStateStatus: pr.value.mergeStateStatus }),
					...(pr.value.url === undefined ? {} : { url: pr.value.url }),
					...(pr.value.mergedAt === undefined ? {} : { mergedAt: pr.value.mergedAt }),
				});
			},
		},
		worktrees: {
			worktrees: async ({ repoRoot }) =>
				toLandResult(await loadWorktrees(pi, repoRoot), "worktree"),
			classifyWorktree: async ({ repoRoot, path }) => classifyWorktree(repoRoot, path),
		},
	};
}

async function loadWorkingTreeStatus(
	pi: LandStackExtensionAPI,
	repoRoot: string,
): Promise<LandResult<WorkingTreeStatus>> {
	const status = await exec({
		pi,
		command: "git",
		args: ["status", "--porcelain=v1"],
		cwd: repoRoot,
		timeoutMs: GIT_TIMEOUT_MS,
	});
	if (status.code !== 0) {
		return landBoundaryFailureResult("git", `Could not inspect working tree status.`);
	}
	if (status.stdout.trim().length > 0) {
		return landSuccess({ isClean: false });
	}

	const operation = await detectInProgressOperation(pi, repoRoot);
	if (operation === undefined) return landSuccess({ isClean: true });
	return landSuccess({ isClean: true, inProgressOperation: toLandOperation(operation) });
}

async function loadLocalBranchExists(
	pi: LandStackExtensionAPI,
	repoRoot: string,
	branch: string,
): Promise<LandOutcome> {
	const result = await assertLocalBranchExists(pi, repoRoot, branch);
	if (result.type === "success") return landCompleted();
	return landOutcomeFailure(toLandFailure(result.failure, "git"));
}

async function loadLocalBranches(
	pi: LandStackExtensionAPI,
	repoRoot: string,
): Promise<LandResult<readonly { readonly name: string; readonly sha: string }[]>> {
	const branches = await loadLiveLocalBranches(pi, repoRoot);
	if (branches.type === "failure") return toLandResult(branches, "git");
	return landSuccess([...branches.value].map((name) => ({ name, sha: "" })));
}

interface LoadBranchContainsParentOptions {
	readonly pi: LandStackExtensionAPI;
	readonly repoRoot: string;
	readonly branch: string;
	readonly parent: string;
}

async function loadBranchContainsParent(
	options: LoadBranchContainsParentOptions,
): Promise<LandResult<boolean>> {
	return toLandResult(await inspectBranchContainsParent(options), "git");
}

async function inspectBranchContainsParent(
	options: LoadBranchContainsParentOptions,
): Promise<LandStackResult<boolean>> {
	const args = [
		"rev-list",
		"-1",
		localBranchRef(options.parent),
		"--not",
		localBranchRef(options.branch),
	];
	const result = await exec({
		pi: options.pi,
		command: "git",
		args,
		cwd: options.repoRoot,
		timeoutMs: GIT_TIMEOUT_MS,
	});
	if (result.code !== 0) {
		return failure(
			landStackFailure(
				`Could not inspect whether ${options.branch} contains parent ${options.parent}.`,
				{
					commandDisplay: formatCommand("git", args),
					result,
				},
			),
		);
	}
	return success(result.stdout.trim().length === 0);
}

function classifyWorktree(
	repoRoot: string,
	path: string,
): Promise<LandResult<WorktreeClassification>> {
	const normalizedPath = normalizeExistingPath(path);
	const normalizedRepoRoot = normalizeExistingPath(repoRoot);
	if (normalizedPath === normalizedRepoRoot) {
		return Promise.resolve(landSuccess({ type: "current" }));
	}
	if (isManagedSlotPath(path)) {
		return Promise.resolve(
			landSuccess({ type: "managed-slot", slotName: slotNameFromPath(path) ?? "slot" }),
		);
	}
	return Promise.resolve(landSuccess({ type: "manual-worktree" }));
}

function toLandOperation(operation: string): "cherry-pick" | "merge" | "rebase" | "revert" {
	if (operation.includes("cherry-pick")) return "cherry-pick";
	if (operation.includes("revert")) return "revert";
	if (operation.includes("rebase")) return "rebase";
	return "merge";
}

function toLandResult<T>(result: LandStackResult<T>, source: LandingFailureSource): LandResult<T> {
	if (result.type === "success") return result;
	return landFailure(toLandFailure(result.failure, source));
}

function landBoundaryFailureResult(
	source: LandingFailureSource,
	message: string,
): LandResult<never> {
	return landFailure({
		type: "boundary",
		phase: "preflight",
		source,
		code: "flow-adapter-failure",
		message,
	});
}

function toLandFailure(
	flowFailure: LandStackFailure,
	source: LandingFailureSource,
): LandingFailure {
	return {
		type: "boundary",
		phase: "preflight",
		source,
		code: "flow-adapter-failure",
		message: flowFailure.message,
	};
}

function localBranchRef(branch: string): string {
	return `refs/heads/${branch}`;
}
