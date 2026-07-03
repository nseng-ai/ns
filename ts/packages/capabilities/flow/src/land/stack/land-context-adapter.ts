import { formatCommand } from "@sdl/core/command";
import { landCompleted, landFailure, landOutcomeFailure, landSuccess } from "../api.ts";
import type {
	LandContext,
	LandingFailure,
	LandOutcome,
	LandResult,
	ManagedSlotWorktree,
	WorkingTreeStatus,
	WorktreeClassification,
} from "../api.ts";
import { exec, formatCommandDetails } from "./command-exec.ts";
import {
	BACKUP_REF_NAMESPACE,
	BACKUP_REF_PREV_NAMESPACE,
	GH_MERGE_TIMEOUT_MS,
	GIT_TIMEOUT_MS,
	GT_MUTATION_TIMEOUT_MS,
	SLOT_TIMEOUT_MS,
} from "./constants.ts";
import { failure, landStackFailure, success, type LandStackResult } from "./errors.ts";
import { resolveMetadataDbPath } from "./graphite-topology.ts";
import {
	createLandGraphiteCommandChannel,
	formatGraphiteOperation,
	type LandGraphiteCommandChannel,
	type LandGraphiteOperation,
} from "./graphite-command-channel.ts";
import { loadPr } from "./pr-facts.ts";
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
import { squashMergeArgs } from "./landing-operations.ts";
import type { LandStackExtensionAPI } from "./types.ts";
import {
	isManagedSlotPath,
	loadWorktrees,
	normalizeExistingPath,
	slotFreeArgs,
	slotNameFromPath,
} from "./worktrees.ts";
import type { LandingFailureSource } from "./plan-mapping.ts";
import type { LandStackFailure } from "./errors.ts";

export function createLandContext(
	pi: LandStackExtensionAPI,
	options: { graphite?: LandGraphiteCommandChannel } = {},
): LandContext {
	const graphite = options.graphite ?? createLandGraphiteCommandChannel({ pi });
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
			snapshotBackupRefs: async ({ repoRoot, branches }) =>
				snapshotBackupRefs({ pi, repoRoot, branches }),
		},
		graphite: {
			trunk: async ({ repoRoot }) =>
				toLandResult(await loadTrunk(pi, repoRoot, graphite), "graphite"),
			metadataDbPath: async ({ repoRoot }) =>
				toLandResult(await resolveMetadataDbPath(pi, repoRoot), "graphite"),
			stackShape: async (request) => {
				const stack = await loadStackSnapshot({
					pi,
					repoRoot: request.repoRoot,
					metadataDbPath: request.metadataDbPath,
					current: request.current,
					trunk: request.trunk,
					liveLocalBranches: request.liveLocalBranches,
				});
				if (stack.type === "failure") return toLandResult(stack, "graphite");
				return landSuccess({
					...stack.value,
					warnings: stack.value.warnings.map((message) => ({ level: "warning", message })),
				});
			},
			prepareSubmitUpdate: async ({ repoRoot, branch }) =>
				prepareSubmitUpdate({ graphite, repoRoot, branch }),
			prepareRestackForSubmit: async ({ repoRoot, branch }) =>
				prepareRestackForSubmit({ graphite, repoRoot, branch }),
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
			squashMergePullRequest: async ({ repoRoot, pullRequest }) => {
				const mergeArgs = squashMergeArgs(pullRequest);
				const result = await exec({
					pi,
					command: "gh",
					args: mergeArgs,
					cwd: repoRoot,
					timeoutMs: GH_MERGE_TIMEOUT_MS,
				});
				if (result.code === 0) {
					return landSuccess({ stdout: result.stdout, stderr: result.stderr });
				}

				const commandDisplay = formatCommand("gh", mergeArgs);
				const message = `gh pr merge --squash with PR title/body failed for PR #${pullRequest.number}.\n${formatCommandDetails(result, commandDisplay)}`;
				return landFailure({
					type: "boundary",
					phase: "merge",
					source: "github",
					code: "squash_merge_failed",
					message,
					displayCommand: commandDisplay,
				});
			},
		},
		worktrees: {
			worktrees: async ({ repoRoot }) =>
				toLandResult(await loadWorktrees(pi, repoRoot), "worktree"),
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
		{ readonly kind: "submit-update" | "restack-upstack" }
	>;
	readonly failureCode: string;
	readonly failureMessage: string;
}

interface FreeSlotsOptions {
	readonly pi: LandStackExtensionAPI;
	readonly repoRoot: string;
	readonly slots: readonly ManagedSlotWorktree[];
}

async function prepareSubmitUpdate(options: {
	readonly graphite: LandGraphiteCommandChannel;
	readonly repoRoot: string;
	readonly branch: string;
}): Promise<LandOutcome> {
	return await prepareGraphiteMutation({
		graphite: options.graphite,
		repoRoot: options.repoRoot,
		operation: { kind: "submit-update", branch: options.branch },
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
		operation: { kind: "restack-upstack", branch: options.branch },
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
	const commandDisplay = formatCommand("sdl", ["slot", ...freeArgs]);
	const result = await exec({
		pi: options.pi,
		command: "sdl",
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
	const branches = await loadLiveLocalBranchTips(pi, repoRoot);
	if (branches.type === "failure") return toLandResult(branches, "git");
	return landSuccess(
		branches.value.map((branch) => ({ name: branch.name, sha: branch.headSha ?? "" })),
	);
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

	const shas = new Map<string, string>();
	for (const branch of options.branches) {
		const sha = await loadLocalSha(options.pi, options.repoRoot, branch);
		if (sha.type === "failure") {
			return landFailure({
				type: "boundary",
				phase: "merge",
				source: "git",
				code: "backup_ref_snapshot_branch_failed",
				message: `Could not snapshot local branch ${branch} for pre-land backup refs; no PRs were landed.\n${sha.failure.message}`,
			});
		}
		const ref = `${BACKUP_REF_NAMESPACE}/${branch}`;
		const args = ["update-ref", ref, sha.value];
		const updated = await exec({
			pi: options.pi,
			command: "git",
			args,
			cwd: options.repoRoot,
			timeoutMs: GIT_TIMEOUT_MS,
		});
		if (updated.code !== 0) {
			const commandDisplay = formatCommand("git", args);
			return landFailure({
				type: "boundary",
				phase: "merge",
				source: "git",
				code: "backup_ref_write_failed",
				message: `Could not write pre-land backup ref ${ref}; no PRs were landed.\n${formatCommandDetails(updated, commandDisplay)}`,
				displayCommand: commandDisplay,
			});
		}
		shas.set(branch, sha.value);
	}
	return landSuccess(shas);
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
