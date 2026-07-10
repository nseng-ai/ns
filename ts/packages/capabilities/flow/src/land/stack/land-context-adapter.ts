import { commandSucceeded, formatCommand } from "@nseng-ai/foundation/command";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import type { GitWorktreeStateFs } from "@nseng-ai/capability-kit/git";
import { snapshotBackupRefs } from "./backup-refs.ts";
import { formatCommandForDisplay } from "./command-stream.ts";
import { landCompleted, landFailure, landOutcomeFailure, landSuccess } from "../api.ts";
import type {
	LandContext,
	LandGraphiteCommandResult,
	LandGraphiteDeleteLocalBranchResult,
	LandGraphiteRefreshBranchResult,
	LandingFailure,
	LandingPhase,
	LandOutcome,
	LandResult,
	ManagedSlotWorktree,
	PullRequestFacts,
	WorkingTreeStatus,
	WorktreeClassification,
} from "../api.ts";
import { exec, formatCommandDetails } from "./command-exec.ts";
import {
	GH_MERGE_TIMEOUT_MS,
	GIT_TIMEOUT_MS,
	GT_MUTATION_TIMEOUT_MS,
	SLOT_TIMEOUT_MS,
} from "./constants.ts";
import {
	failure,
	landStackFailure,
	success,
	type LandingExecutionFailure,
	type LandStackResult,
} from "./errors.ts";
import { loadGraphiteTopology, resolveMetadataDbPath } from "./graphite-topology.ts";
import {
	deleteLocalBranchOperation,
	formatGraphiteOperation,
	getDownstackNoCheckoutOperation,
	restackOperation,
	submitUpdateOperation,
	type LandGraphiteCommandChannel,
	type LandGraphiteOperation,
} from "./graphite-command-channel.ts";
import { loadPr, loadPrsByBranch } from "./pr-facts.ts";
import {
	assertLocalBranchExists,
	detectInProgressOperation,
	loadCurrentBranch,
	loadLiveLocalBranchTips,
	loadLocalSha,
	loadRepoRoot,
	loadStackSnapshot,
	loadTrunk,
} from "./stack-facts.ts";
import type { LandStackExtensionAPI } from "./types.ts";
import {
	isManagedSlotPath,
	loadWorktrees,
	normalizeExistingPath,
	slotFreeArgs,
	slotNameFromPath,
} from "./worktrees.ts";

type LandingFailureSource = Extract<LandingFailure, { readonly type: "boundary" }>["source"];

export function createLandContext(
	pi: LandStackExtensionAPI,
	options: { graphite: LandGraphiteCommandChannel; gitStateFs?: GitWorktreeStateFs },
): LandContext {
	const { graphite } = options;
	return {
		git: {
			resolveRepoRoot: async ({ cwd }) =>
				toLandResult(await loadRepoRoot(pi, cwd), "git", "repo-discovery"),
			currentBranch: async ({ repoRoot }) =>
				toLandResult(await loadCurrentBranch(pi, repoRoot), "git", "repo-discovery"),
			workingTreeStatus: async ({ repoRoot }) =>
				loadWorkingTreeStatus(pi, repoRoot, optionalEntry("gitStateFs", options.gitStateFs)),
			localBranchExists: async ({ repoRoot, branch }) =>
				loadLocalBranchExists(pi, repoRoot, branch),
			localBranchSha: async ({ repoRoot, branch }) =>
				toLandResult(await loadLocalSha(pi, repoRoot, branch), "git", "preflight"),
			listLocalBranches: async ({ repoRoot }) => loadLocalBranches(pi, repoRoot),
			branchContainsParent: async ({ repoRoot, branch, parent }) =>
				loadBranchContainsParent({ pi, repoRoot, branch, parent }),
			snapshotBackupRefs: async ({ repoRoot, branches }) =>
				snapshotBackupRefs({ pi, repoRoot, branches }),
		},
		graphite: {
			trunk: async ({ repoRoot }) =>
				toLandResult(await loadTrunk(pi, repoRoot, graphite), "graphite", "repo-discovery"),
			metadataDbPath: async ({ repoRoot }) =>
				toLandResult(await resolveMetadataDbPath(pi, repoRoot), "graphite", "repo-discovery"),
			stackShape: async (request) => {
				const stack = await loadStackSnapshot({
					pi,
					repoRoot: request.repoRoot,
					metadataDbPath: request.metadataDbPath,
					current: request.current,
					trunk: request.trunk,
					liveLocalBranches: request.liveLocalBranches,
				});
				if (stack.type === "failure") return toLandResult(stack, "graphite", "stack-shape");
				return landSuccess(stack.value);
			},
			prepareSubmitUpdate: async ({ repoRoot, branch }) =>
				prepareSubmitUpdate({ graphite, repoRoot, branch }),
			prepareRestackForSubmit: async ({ repoRoot, branch }) =>
				prepareRestackForSubmit({ graphite, repoRoot, branch }),
			refreshBranchFromRemote: async ({ repoRoot, branch, checkedOutConflictHandling }) =>
				refreshBranchFromRemote({ graphite, repoRoot, branch, checkedOutConflictHandling }),
			deleteLocalBranch: async ({ repoRoot, branch, checkedOutConflictHandling }) =>
				deleteLocalBranch({ graphite, repoRoot, branch, checkedOutConflictHandling }),
			restack: async ({ repoRoot, branch, scope }) =>
				runGraphiteMutation({
					graphite,
					repoRoot,
					operation: restackOperation({ branch, scope }),
				}),
			submitUpdate: async ({ repoRoot, branch, force }) =>
				runGraphiteMutation({
					graphite,
					repoRoot,
					operation: submitUpdateOperation({ branch, force }),
				}),
			branchChildren: async ({ repoRoot, metadataDbPath, branch }) =>
				loadBranchChildren({ pi, repoRoot, metadataDbPath, branch }),
		},
		github: {
			pullRequestFacts: async ({ repoRoot, branchOrNumber }) => {
				const pr = await loadPr(pi, repoRoot, branchOrNumber);
				if (pr.type === "failure") return toLandResult(pr, "github", "preflight");
				return landSuccess(pr.value);
			},
			pullRequestFactsByBranch: async ({ repoRoot, branches }) => {
				const prs = await loadPrsByBranch(pi, repoRoot, branches);
				if (prs.type === "failure") return toLandResult(prs, "github", "preflight");
				return landSuccess(prs.value);
			},
			squashMergePullRequest: async ({ repoRoot, pullRequest }) => {
				const mergeArgs = squashMergeArgs(pullRequest);
				const commandDisplay = formatCommandForDisplay("gh", mergeArgs);
				const result = await exec({
					pi,
					command: "gh",
					args: mergeArgs,
					cwd: repoRoot,
					timeoutMs: GH_MERGE_TIMEOUT_MS,
				});
				if (commandSucceeded(result)) {
					return landSuccess({ stdout: result.stdout, stderr: result.stderr });
				}

				const diagnosticResult = redactPullRequestBodyFromResult(result, pullRequest.body);
				const message = `gh pr merge --squash with PR title/body failed for PR #${pullRequest.number}.\n${formatCommandDetails(diagnosticResult, commandDisplay)}`;
				return landFailure({
					type: "boundary",
					phase: "merge",
					source: "github",
					code: "squash_merge_failed",
					message,
					displayCommand: commandDisplay,
					execResult: diagnosticResult,
				});
			},
		},
		worktrees: {
			worktrees: async ({ repoRoot }) =>
				toLandResult(await loadWorktrees(pi, repoRoot), "worktree", "preflight"),
			classifyWorktree: async ({ repoRoot, path }) => classifyWorktree(repoRoot, path),
			freeSlots: async ({ repoRoot, slots }) => freeSlots({ pi, repoRoot, slots }),
		},
	};
}

interface PrepareGraphiteMutationOptions {
	readonly graphite: LandGraphiteCommandChannel;
	readonly repoRoot: string;
	readonly operation: Extract<
		LandGraphiteOperation,
		{ readonly kind: "submit-update" | "restack" }
	>;
	readonly failureCode: string;
	readonly failureMessage: string;
}

interface FreeSlotsOptions {
	readonly pi: LandStackExtensionAPI;
	readonly repoRoot: string;
	readonly slots: readonly ManagedSlotWorktree[];
}

async function refreshBranchFromRemote(options: {
	readonly graphite: LandGraphiteCommandChannel;
	readonly repoRoot: string;
	readonly branch: string;
	readonly checkedOutConflictHandling: "fail" | "defer";
}): Promise<LandGraphiteRefreshBranchResult> {
	const operation = getDownstackNoCheckoutOperation({
		branch: options.branch,
		checkedOutConflictHandling: options.checkedOutConflictHandling,
	});
	const commandDisplay = formatGraphiteOperation(operation);
	const result = await options.graphite.run({
		operation,
		cwd: options.repoRoot,
		timeoutMs: GT_MUTATION_TIMEOUT_MS,
	});
	if (commandSucceeded(result.result)) return { type: "success", result: result.result };
	if (result.checkoutConflict !== undefined) {
		return {
			type: "checkout-conflict",
			branch: result.checkoutConflict.branch,
			path: result.checkoutConflict.path,
			commandDisplay,
			result: result.result,
		};
	}
	return { type: "failure", commandDisplay, result: result.result };
}

async function deleteLocalBranch(options: {
	readonly graphite: LandGraphiteCommandChannel;
	readonly repoRoot: string;
	readonly branch: string;
	readonly checkedOutConflictHandling: "fail" | "retain";
}): Promise<LandGraphiteDeleteLocalBranchResult> {
	const operation = deleteLocalBranchOperation({
		branch: options.branch,
		checkedOutConflictHandling: options.checkedOutConflictHandling,
	});
	const result = await options.graphite.run({
		operation,
		cwd: options.repoRoot,
		timeoutMs: GT_MUTATION_TIMEOUT_MS,
	});
	switch (result.kind) {
		case "deleted":
			return { type: "deleted" };
		case "retained":
			return { type: "retained", branch: result.branch, path: result.path };
		case "failed":
			return {
				type: "failed",
				commandDisplay: formatGraphiteOperation(operation),
				result: result.result,
			};
	}
}

async function runGraphiteMutation(options: {
	readonly graphite: LandGraphiteCommandChannel;
	readonly repoRoot: string;
	readonly operation: Extract<
		LandGraphiteOperation,
		{ readonly kind: "submit-update" | "restack" }
	>;
}): Promise<LandGraphiteCommandResult> {
	const result = await options.graphite.run({
		operation: options.operation,
		cwd: options.repoRoot,
		timeoutMs: GT_MUTATION_TIMEOUT_MS,
	});
	if (commandSucceeded(result)) return { type: "success", result };
	return {
		type: "failure",
		commandDisplay: formatGraphiteOperation(options.operation),
		result,
	};
}

async function loadBranchChildren(options: {
	readonly pi: LandStackExtensionAPI;
	readonly repoRoot: string;
	readonly metadataDbPath: string;
	readonly branch: string;
}): Promise<LandResult<readonly string[]>> {
	const topology = await loadGraphiteTopology(options.pi, options.repoRoot, options.metadataDbPath);
	if (topology.type === "failure")
		return toLandResult(topology, "graphite", "descendant-maintenance");
	return landSuccess([...(topology.value.get(options.branch)?.children ?? [])]);
}

async function prepareSubmitUpdate(options: {
	readonly graphite: LandGraphiteCommandChannel;
	readonly repoRoot: string;
	readonly branch: string;
}): Promise<LandOutcome> {
	return await prepareGraphiteMutation({
		graphite: options.graphite,
		repoRoot: options.repoRoot,
		operation: submitUpdateOperation({ branch: options.branch }),
		failureCode: "submit_update_failed",
		failureMessage: "gt submit/update failed before any PRs were landed.",
	});
}

async function prepareRestackForSubmit(options: {
	readonly graphite: LandGraphiteCommandChannel;
	readonly repoRoot: string;
	readonly branch: string;
}): Promise<LandOutcome> {
	return await prepareGraphiteMutation({
		graphite: options.graphite,
		repoRoot: options.repoRoot,
		operation: restackOperation({ branch: options.branch, scope: "upstack" }),
		failureCode: "submit_restack_failed",
		failureMessage: "gt restack failed before any PRs were landed.",
	});
}

async function prepareGraphiteMutation(
	options: PrepareGraphiteMutationOptions,
): Promise<LandOutcome> {
	const result = await options.graphite.run({
		operation: options.operation,
		cwd: options.repoRoot,
		timeoutMs: GT_MUTATION_TIMEOUT_MS,
	});
	if (commandSucceeded(result)) return landCompleted();

	const commandDisplay = formatGraphiteOperation(options.operation);
	return landOutcomeFailure({
		type: "boundary",
		phase: "submit-preparation",
		source: "graphite",
		code: options.failureCode,
		message: `${options.failureMessage}\n${formatCommandDetails(result, commandDisplay)}`,
		displayCommand: commandDisplay,
	});
}

async function freeSlots(
	options: FreeSlotsOptions,
): Promise<LandResult<readonly ManagedSlotWorktree[]>> {
	const freeArgs = slotFreeArgs(options.slots);
	const commandDisplay = formatCommand("ns", ["slot", ...freeArgs]);
	const result = await exec({
		pi: options.pi,
		command: "ns",
		args: ["slot", ...freeArgs],
		cwd: options.repoRoot,
		timeoutMs: SLOT_TIMEOUT_MS,
	});
	if (commandSucceeded(result)) return landSuccess(options.slots.map(copyManagedSlotWorktree));

	return landFailure({
		type: "boundary",
		phase: "submit-preparation",
		source: "slot",
		code: "slot_free_failed",
		message: `Targeted slot cleanup failed before any PRs were landed.\n${formatCommandDetails(result, commandDisplay)}`,
		displayCommand: commandDisplay,
		execResult: result,
	});
}

function copyManagedSlotWorktree(slot: ManagedSlotWorktree): ManagedSlotWorktree {
	return {
		type: "managed-slot",
		branch: slot.branch,
		path: slot.path,
		...(slot.slotName === undefined ? {} : { slotName: slot.slotName }),
	};
}

async function loadWorkingTreeStatus(
	pi: LandStackExtensionAPI,
	repoRoot: string,
	options: { gitStateFs?: GitWorktreeStateFs } = {},
): Promise<LandResult<WorkingTreeStatus>> {
	const status = await exec({
		pi,
		command: "git",
		args: ["status", "--porcelain=v1"],
		cwd: repoRoot,
		timeoutMs: GIT_TIMEOUT_MS,
	});
	if (!commandSucceeded(status)) {
		return landBoundaryFailureResult("git", "preflight", `Could not inspect working tree status.`);
	}
	if (status.stdout.trim().length > 0) {
		return landSuccess({ isClean: false });
	}

	const operation = detectInProgressOperation(repoRoot, optionalEntry("fs", options.gitStateFs));
	if (operation === undefined) return landSuccess({ isClean: true });
	return landSuccess({ isClean: true, inProgressOperation: operation });
}

async function loadLocalBranchExists(
	pi: LandStackExtensionAPI,
	repoRoot: string,
	branch: string,
): Promise<LandOutcome> {
	const result = await assertLocalBranchExists(pi, repoRoot, branch);
	if (result.type === "success") return landCompleted();
	return landOutcomeFailure(toLandingFailure(result.failure, "git", "preflight"));
}

async function loadLocalBranches(
	pi: LandStackExtensionAPI,
	repoRoot: string,
): Promise<LandResult<readonly { readonly name: string; readonly sha: string }[]>> {
	const branches = await loadLiveLocalBranchTips(pi, repoRoot);
	if (branches.type === "failure") return toLandResult(branches, "git", "repo-discovery");
	const tips: Array<{ readonly name: string; readonly sha: string }> = [];
	for (const branch of branches.value) {
		if (branch.headSha == null) {
			return landFailure({
				type: "boundary",
				phase: "repo-discovery",
				source: "git",
				code: "local_branch_tip_sha_missing",
				message: `Could not resolve local branch SHA for ${branch.name}; refusing to inspect stack shape with an unknown branch tip.`,
			});
		}
		tips.push({ name: branch.name, sha: branch.headSha });
	}
	return landSuccess(tips);
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
	return toLandResult(await inspectBranchContainsParent(options), "git", "preflight");
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
	if (!commandSucceeded(result)) {
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

function toLandResult<T>(
	result: LandStackResult<T>,
	source: LandingFailureSource,
	phase: LandingPhase,
): LandResult<T> {
	if (result.type === "success") return result;
	return landFailure(toLandingFailure(result.failure, source, phase));
}

function landBoundaryFailureResult(
	source: LandingFailureSource,
	phase: LandingPhase,
	message: string,
): LandResult<never> {
	return landFailure({
		type: "boundary",
		phase,
		source,
		code: `${source}-gateway-failure`,
		message,
	});
}

function toLandingFailure(
	failure: LandingFailure | LandingExecutionFailure,
	source: LandingFailureSource,
	phase: LandingPhase,
): LandingFailure {
	if (failure.type !== "execution") return failure;
	return {
		type: "boundary",
		phase,
		source,
		code: `${source}-gateway-failure`,
		message: failure.message,
		...optionalEntry("suggestedAction", failure.suggestedAction),
	};
}

function redactPullRequestBodyFromResult(
	result: LandGraphiteCommandResult["result"],
	body: string | null,
): LandGraphiteCommandResult["result"] {
	if (body === null || body.length === 0) return result;
	return {
		...result,
		stdout: result.stdout.split(body).join("<PR body>"),
		stderr: result.stderr.split(body).join("<PR body>"),
	};
}

function squashMergeArgs(pr: PullRequestFacts): string[] {
	return [
		"pr",
		"merge",
		String(pr.number),
		"--squash",
		"--match-head-commit",
		pr.headRefOid,
		"--subject",
		pr.title,
		"--body",
		pr.body ?? "",
	];
}

function localBranchRef(branch: string): string {
	return `refs/heads/${branch}`;
}
