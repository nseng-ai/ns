import { formatCommand } from "@nseng-ai/foundation/command";
import { optionalEntry } from "@nseng-ai/foundation/primitives";
import {
	GIT_LOCAL_BRANCH_TIPS_FOR_EACH_REF_ARGS,
	type GitWorktreeStateFs,
} from "@nseng-ai/capability-kit/git";
import {
	mergePullRequestArgs,
	parseMergePullRequestResult,
	parseRetargetPullRequestBaseResult,
	retargetPullRequestBaseArgs,
} from "@nseng-ai/capability-kit/github/pr-mutations";
import { formatCommandForDisplay } from "./command-stream.ts";
import {
	landCompleted,
	landFailure,
	landOutcomeFailure,
	landSuccess,
	toWarningNotifications,
} from "../api.ts";
import type {
	LandAdvanceBranchResult,
	LandContext,
	LandGraphiteCommandResult,
	LandGraphiteDeleteLocalBranchResult,
	LandGraphiteRefreshBranchResult,
	LandingFailure,
	LandingPhase,
	LandOutcome,
	LandPushBranchWithLeaseResult,
	LandResult,
	LandRetargetPullRequestBaseResult,
	ManagedSlotWorktree,
	PullRequestFacts,
	SquashMergePullRequestResult,
	WorkingTreeStatus,
	WorktreeClassification,
} from "../api.ts";
import { exec, formatCommandDetails } from "./command-exec.ts";
import {
	BACKUP_REF_NAMESPACE,
	BACKUP_REF_PREV_NAMESPACE,
	GH_MERGE_TIMEOUT_MS,
	GH_TIMEOUT_MS,
	GIT_REMOTE_TIMEOUT_MS,
	GIT_TIMEOUT_MS,
	GT_MUTATION_TIMEOUT_MS,
	SLOT_TIMEOUT_MS,
} from "./constants.ts";
import { failure, landStackFailure, success, type LandStackResult } from "./errors.ts";
import { loadGraphiteTopology, resolveMetadataDbPath } from "./graphite-topology.ts";
import {
	deleteLocalBranchOperation,
	formatGraphiteOperation,
	getDownstackNoCheckoutOperation,
	parseGitFetchRefusedCheckedOut,
	parseGitPushLeaseRejected,
	restackOperation,
	submitUpdateOperation,
	type LandGraphiteCommandChannel,
	type LandGraphiteOperation,
} from "./graphite-command-channel.ts";
import { loadPr, loadPrsByBranch } from "./pr-facts.ts";
import { copyPullRequestSnapshot } from "./pull-request-snapshot.ts";
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
import type { LandStackExtensionAPI, PullRequestSnapshot } from "./types.ts";
import {
	isManagedSlotPath,
	loadWorktrees,
	normalizeExistingPath,
	slotFreeArgs,
	slotNameFromPath,
} from "./worktrees.ts";
import type { LandStackFailure } from "./errors.ts";

type LandingFailureSource = Extract<LandingFailure, { readonly type: "boundary" }>["source"];

function toApiPullRequestFacts(pr: PullRequestSnapshot): PullRequestFacts {
	return copyPullRequestSnapshot(pr);
}

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
			advanceBranchFromRemote: async ({ repoRoot, branch }) =>
				advanceBranchFromRemote({ pi, repoRoot, branch }),
			pushBranchToRemoteWithLease: async ({ repoRoot, branch, expectedRemoteSha }) =>
				pushBranchToRemoteWithLease({ pi, repoRoot, branch, expectedRemoteSha }),
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
				return landSuccess({
					...stack.value,
					warnings: toWarningNotifications(stack.value.warnings),
				});
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
				return landSuccess(toApiPullRequestFacts(pr.value));
			},
			pullRequestFactsByBranch: async ({ repoRoot, branches }) => {
				const prs = await loadPrsByBranch(pi, repoRoot, branches);
				if (prs.type === "failure") return toLandResult(prs, "github", "preflight");
				return landSuccess(
					new Map([...prs.value].map(([branch, pr]) => [branch, toApiPullRequestFacts(pr)])),
				);
			},
			squashMergePullRequest: async ({ repoRoot, pullRequest }) =>
				squashMergePullRequest({ pi, repoRoot, pullRequest }),
			retargetPullRequestBase: async ({ repoRoot, pullRequest, baseRefName }) =>
				retargetPullRequestBase({ pi, repoRoot, pullRequest, baseRefName }),
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
	if (result.result.code === 0) return { type: "success", result: result.result };
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

async function advanceBranchFromRemote(options: {
	readonly pi: LandStackExtensionAPI;
	readonly repoRoot: string;
	readonly branch: string;
}): Promise<LandAdvanceBranchResult> {
	// Fast-forward only: a non-FF fetch failure means local trunk diverged from origin,
	// which must surface as a failure rather than clobbering local history.
	const args = advanceBranchFromRemoteArgs(options.branch);
	const result = await exec({
		pi: options.pi,
		command: "git",
		args,
		cwd: options.repoRoot,
		timeoutMs: GIT_REMOTE_TIMEOUT_MS,
	});
	if (result.code === 0) return { type: "advanced" };
	const checkedOut = parseGitFetchRefusedCheckedOut(result);
	if (checkedOut !== undefined) {
		return { type: "checked-out", branch: checkedOut.branch, path: checkedOut.path };
	}
	return { type: "failure", commandDisplay: formatCommand("git", args), result };
}

function advanceBranchFromRemoteArgs(branch: string): string[] {
	return ["fetch", "--quiet", "--no-tags", "origin", `refs/heads/${branch}:refs/heads/${branch}`];
}

async function pushBranchToRemoteWithLease(options: {
	readonly pi: LandStackExtensionAPI;
	readonly repoRoot: string;
	readonly branch: string;
	readonly expectedRemoteSha: string;
}): Promise<LandPushBranchWithLeaseResult> {
	// Explicit lease value (no reliance on remote-tracking refs): refuse the forced push if origin
	// moved past the pre-restack snapshot SHA, which means the remote branch changed mid-run.
	const args = pushBranchToRemoteWithLeaseArgs(options.branch, options.expectedRemoteSha);
	const result = await exec({
		pi: options.pi,
		command: "git",
		args,
		cwd: options.repoRoot,
		timeoutMs: GIT_REMOTE_TIMEOUT_MS,
	});
	if (result.code === 0) return { type: "pushed" };
	if (parseGitPushLeaseRejected(result)) return { type: "lease-rejected" };
	return { type: "failure", commandDisplay: formatCommand("git", args), result };
}

function pushBranchToRemoteWithLeaseArgs(branch: string, expectedRemoteSha: string): string[] {
	return [
		"push",
		"--quiet",
		`--force-with-lease=refs/heads/${branch}:${expectedRemoteSha}`,
		"origin",
		`refs/heads/${branch}:refs/heads/${branch}`,
	];
}

async function retargetPullRequestBase(options: {
	readonly pi: LandStackExtensionAPI;
	readonly repoRoot: string;
	readonly pullRequest: PullRequestFacts;
	readonly baseRefName: string;
}): Promise<LandRetargetPullRequestBaseResult> {
	const args = retargetPullRequestBaseArgs({
		pullRequestId: options.pullRequest.id,
		baseRefName: options.baseRefName,
	});
	const commandDisplay = formatCommand("gh", args);
	const result = await exec({
		pi: options.pi,
		command: "gh",
		args,
		cwd: options.repoRoot,
		timeoutMs: GH_TIMEOUT_MS,
	});
	if (result.code !== 0) return { type: "failure", commandDisplay, result };

	const parsed = parseRetargetPullRequestBaseResult(result.stdout);
	if (parsed.type === "ok") return { type: "retargeted" };
	if (parsed.type === "graphql-errors") {
		return { type: "failure", message: parsed.messages.join("; "), commandDisplay, result };
	}
	return {
		type: "failure",
		message: `gh api graphql updatePullRequest returned an unexpected response (${parsed.type}).`,
		commandDisplay,
		result,
	};
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
	if (result.code === 0) return { type: "success", result };
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
	if (result.code === 0) return landCompleted();

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
	if (result.code === 0) return landSuccess(options.slots.map(copyManagedSlotWorktree));

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
	if (status.code !== 0) {
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
	return landOutcomeFailure(toLandFailure(result.failure, "git", "preflight"));
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

interface SnapshotBackupRefsOptions {
	readonly pi: LandStackExtensionAPI;
	readonly repoRoot: string;
	readonly branches: readonly string[];
}

async function snapshotBackupRefs(
	options: SnapshotBackupRefsOptions,
): Promise<LandResult<ReadonlyMap<string, string>>> {
	const rotate = await rotateBackupRefsToPrevious(options);
	if (rotate !== undefined) return landFailure(rotate);

	const pruneCurrent = await pruneBackupNamespace({
		...options,
		namespace: BACKUP_REF_NAMESPACE,
		description: "current pre-land backup refs",
	});
	if (pruneCurrent !== undefined) return landFailure(pruneCurrent);

	const shas = await loadBackupSnapshotShas(options);
	if (shas.type === "failure") return shas;

	const written = await writeBackupSnapshotRefs({ ...options, shas: shas.value });
	if (written !== undefined) return landFailure(written);
	return shas;
}

async function loadBackupSnapshotShas(
	options: SnapshotBackupRefsOptions,
): Promise<LandResult<ReadonlyMap<string, string>>> {
	const tips = await loadLiveLocalBranchTips(options.pi, options.repoRoot);
	const commandDisplay = formatCommand("git", GIT_LOCAL_BRANCH_TIPS_FOR_EACH_REF_ARGS);
	if (tips.type === "failure") {
		return landFailure({
			type: "boundary",
			phase: "merge",
			source: "git",
			code: "backup_ref_snapshot_list_failed",
			message: `Could not list local branch SHAs for pre-land backup refs; no PRs were landed.\n${tips.failure.message}`,
			displayCommand: commandDisplay,
		});
	}

	const requestedBranches = new Set(options.branches);
	const shas = new Map<string, string>();
	for (const tip of tips.value) {
		if (!requestedBranches.has(tip.name)) continue;
		if (tip.headSha == null) {
			return landFailure(backupRefSnapshotBranchFailure(tip.name, commandDisplay));
		}
		shas.set(tip.name, tip.headSha);
	}

	for (const branch of options.branches) {
		if (!shas.has(branch))
			return landFailure(backupRefSnapshotBranchFailure(branch, commandDisplay));
	}
	return landSuccess(shas);
}

function backupRefSnapshotBranchFailure(branch: string, commandDisplay: string): LandingFailure {
	return {
		type: "boundary",
		phase: "merge",
		source: "git",
		code: "backup_ref_snapshot_branch_failed",
		message: `Could not snapshot local branch ${branch} for pre-land backup refs; no PRs were landed.\n${commandDisplay} did not return an exact SHA for ${branch}.`,
		displayCommand: commandDisplay,
	};
}

function missingBackupSnapshotShaForWrite(branch: string): LandingFailure {
	return {
		type: "boundary",
		phase: "merge",
		source: "git",
		code: "backup_ref_snapshot_sha_missing",
		message: `Could not write pre-land backup ref for ${branch}; no PRs were landed. Exact snapshot SHA was missing before backup ref write.`,
	};
}

async function writeBackupSnapshotRefs(
	options: SnapshotBackupRefsOptions & { readonly shas: ReadonlyMap<string, string> },
): Promise<LandingFailure | undefined> {
	if (options.branches.length === 0) return undefined;
	const refspecs: string[] = [];
	for (const branch of options.branches) {
		const sha = options.shas.get(branch);
		if (sha === undefined) return missingBackupSnapshotShaForWrite(branch);
		refspecs.push(`+${sha}:${BACKUP_REF_NAMESPACE}/${branch}`);
	}
	const args = ["fetch", "--quiet", "--no-tags", ".", ...refspecs];
	const fetched = await exec({
		pi: options.pi,
		command: "git",
		args,
		cwd: options.repoRoot,
		timeoutMs: GIT_TIMEOUT_MS,
	});
	if (fetched.code === 0) return undefined;

	const firstBranch = options.branches[0] ?? "<none>";
	const commandDisplay = formatCommand("git", args);
	return {
		type: "boundary",
		phase: "merge",
		source: "git",
		code: "backup_ref_write_failed",
		message: `Could not write pre-land backup refs starting at ${BACKUP_REF_NAMESPACE}/${firstBranch}; no PRs were landed.\n${formatCommandDetails(fetched, commandDisplay)}`,
		displayCommand: commandDisplay,
	};
}

async function rotateBackupRefsToPrevious(
	options: SnapshotBackupRefsOptions,
): Promise<LandingFailure | undefined> {
	const args = [
		"fetch",
		"--quiet",
		"--prune",
		"--no-tags",
		".",
		`+${BACKUP_REF_NAMESPACE}/*:${BACKUP_REF_PREV_NAMESPACE}/*`,
	];
	const rotated = await exec({
		pi: options.pi,
		command: "git",
		args,
		cwd: options.repoRoot,
		timeoutMs: GIT_TIMEOUT_MS,
	});
	if (rotated.code === 0) return undefined;

	const commandDisplay = formatCommand("git", args);
	return {
		type: "boundary",
		phase: "merge",
		source: "git",
		code: "backup_ref_rotation_failed",
		message: `Could not rotate current pre-land backup refs to previous; no PRs were landed.\n${formatCommandDetails(rotated, commandDisplay)}`,
		displayCommand: commandDisplay,
	};
}

interface PruneBackupNamespaceOptions extends SnapshotBackupRefsOptions {
	readonly namespace: string;
	readonly description: string;
}

async function pruneBackupNamespace(
	options: PruneBackupNamespaceOptions,
): Promise<LandingFailure | undefined> {
	const listArgs = ["for-each-ref", "--format=%(refname)", options.namespace];
	const refs = await exec({
		pi: options.pi,
		command: "git",
		args: listArgs,
		cwd: options.repoRoot,
		timeoutMs: GIT_TIMEOUT_MS,
	});
	if (refs.code !== 0) {
		const commandDisplay = formatCommand("git", listArgs);
		return {
			type: "boundary",
			phase: "merge",
			source: "git",
			code: "backup_ref_prune_list_failed",
			message: `Could not list ${options.description} for pruning; no PRs were landed.\n${formatCommandDetails(refs, commandDisplay)}`,
			displayCommand: commandDisplay,
		};
	}
	for (const ref of refs.stdout
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean)) {
		const deleteArgs = ["update-ref", "-d", ref];
		const deleted = await exec({
			pi: options.pi,
			command: "git",
			args: deleteArgs,
			cwd: options.repoRoot,
			timeoutMs: GIT_TIMEOUT_MS,
		});
		if (deleted.code !== 0) {
			const commandDisplay = formatCommand("git", deleteArgs);
			return {
				type: "boundary",
				phase: "merge",
				source: "git",
				code: "backup_ref_delete_failed",
				message: `Could not delete ${options.description} ${ref}; no PRs were landed.\n${formatCommandDetails(deleted, commandDisplay)}`,
				displayCommand: commandDisplay,
			};
		}
	}
	return undefined;
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

function toLandResult<T>(
	result: LandStackResult<T>,
	source: LandingFailureSource,
	phase: LandingPhase,
): LandResult<T> {
	if (result.type === "success") return result;
	return landFailure(toLandFailure(result.failure, source, phase));
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

function toLandFailure(
	flowFailure: LandStackFailure,
	source: LandingFailureSource,
	phase: LandingPhase,
): LandingFailure {
	return {
		type: "boundary",
		phase,
		source,
		code: `${source}-gateway-failure`,
		message: flowFailure.message,
		...(flowFailure.suggestedAction === undefined
			? {}
			: { suggestedAction: flowFailure.suggestedAction }),
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

async function squashMergePullRequest(options: {
	readonly pi: LandStackExtensionAPI;
	readonly repoRoot: string;
	readonly pullRequest: PullRequestFacts;
}): Promise<LandResult<SquashMergePullRequestResult>> {
	const { pi, repoRoot, pullRequest } = options;
	// expectedHeadOid == old `--match-head-commit`, commitHeadline == old `--subject`,
	// commitBody == old `--body <body ?? "">`.
	const args = mergePullRequestArgs({
		pullRequestId: pullRequest.id,
		expectedHeadOid: pullRequest.headRefOid,
		commitHeadline: pullRequest.title,
		commitBody: pullRequest.body ?? "",
	});
	const commandDisplay = formatCommandForDisplay("gh", args);
	const result = await exec({
		pi,
		command: "gh",
		args,
		cwd: repoRoot,
		timeoutMs: GH_MERGE_TIMEOUT_MS,
	});
	// The argv now carries the PR body via `-f commitBody=...`; redact it from any diagnostics.
	const diagnosticResult = redactPullRequestBodyFromResult(result, pullRequest.body);

	if (result.code !== 0) {
		return landFailure({
			type: "boundary",
			phase: "merge",
			source: "github",
			code: "squash_merge_failed",
			message: `GraphQL squash merge (gh api graphql mergePullRequest) failed for PR #${pullRequest.number}.\n${formatCommandDetails(diagnosticResult, commandDisplay)}`,
			displayCommand: commandDisplay,
			execResult: diagnosticResult,
		});
	}

	const parsed = parseMergePullRequestResult(result.stdout);
	if (parsed.type === "ok") {
		return landSuccess({
			stdout: result.stdout,
			stderr: result.stderr,
			verification: {
				number: parsed.pullRequest.number,
				state: parsed.pullRequest.state,
				mergedAt: parsed.pullRequest.mergedAt,
				baseRefName: parsed.pullRequest.baseRefName,
				headRefName: parsed.pullRequest.headRefName,
				...(parsed.pullRequest.url === undefined ? {} : { url: parsed.pullRequest.url }),
			},
		});
	}

	if (parsed.type === "graphql-errors") {
		return landFailure({
			type: "boundary",
			phase: "merge",
			source: "github",
			code: "squash_merge_failed",
			message: `GraphQL squash merge (gh api graphql mergePullRequest) reported errors for PR #${pullRequest.number}: ${parsed.messages.join("; ")}.\n${formatCommandDetails(diagnosticResult, commandDisplay)}`,
			displayCommand: commandDisplay,
			execResult: diagnosticResult,
		});
	}

	// Exit 0 but the mutation response was unparseable: fall back to a single pullRequestFacts load
	// to build verification. If that also fails, preserve the "merge exited 0 but verification could
	// not load PR" semantics (halt conservatively, do not delete/restack local branches).
	const fallback = await loadPr(pi, repoRoot, String(pullRequest.number));
	if (fallback.type === "failure") {
		return landFailure({
			type: "boundary",
			phase: "merge",
			source: "github",
			code: "squash_merge_verify_unavailable",
			message: `Squash merge for PR #${pullRequest.number} exited 0, but verification could not load PR #${pullRequest.number}.\n${fallback.failure.message}`,
			displayCommand: commandDisplay,
		});
	}
	const facts = fallback.value;
	return landSuccess({
		stdout: result.stdout,
		stderr: result.stderr,
		verification: {
			number: facts.number,
			state: facts.state,
			mergedAt: facts.mergedAt ?? null,
			baseRefName: facts.baseRefName,
			headRefName: facts.headRefName,
			...(facts.url === undefined ? {} : { url: facts.url }),
		},
	});
}

function localBranchRef(branch: string): string {
	return `refs/heads/${branch}`;
}
