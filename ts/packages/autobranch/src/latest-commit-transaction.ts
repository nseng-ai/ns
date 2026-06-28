import type { CommandResult } from "./shared.ts";
import { branchNameCandidates, findAvailableBranchName } from "./branch-name.ts";
import { formatAutobranchCommandDetails } from "./shared.ts";
import { inspectUpstreamHeadState } from "./upstream.ts";
import { normalizeBranchSlugText } from "@sdl/core/branch-slug";
import type { LatestCommitAutobranchPlan } from "./latest-commit-preparation.ts";

const GIT_TIMEOUT_MS = 30_000;
const GT_TIMEOUT_MS = 120_000;
const MAX_BACKUP_SEGMENT_CHARS = 32;

export type CreatedBranchRecovery =
	| { restored: true; createdBranchDeleted: true }
	| { restored: true; createdBranchDeleted: false; createdBranchDeleteError: string }
	| {
			restored: false;
			restoreError: string;
			createdBranchDeleted: false;
			createdBranchDeleteError: string;
	  };

export type SourceResetFailureRecovery =
	| { backupCleanup: "deleted" }
	| { backupCleanup: "delete_failed"; backupDeleteError: string }
	| { backupCleanup: "recovery_required"; recoveryCommand: string };

export type LatestCommitTransactionResult =
	| { ok: true; commitSummary: string; backupDeleted: true }
	| {
			ok: true;
			commitSummary: string;
			backupDeleted: false;
			backupBranch: string;
			backupDeleteError: string;
	  }
	| { ok: false; kind: "backup_branch_name_unavailable"; sourceBranch: string }
	| { ok: false; kind: "backup_create_failed"; error: string }
	| ({
			ok: false;
			kind: "source_reset_failed";
			backupBranch: string;
			error: string;
	  } & SourceResetFailureRecovery)
	| ({
			ok: false;
			kind: "graphite_create_failed";
			backupBranch: string;
			branchName: string;
			createError: string;
	  } & CreatedBranchRecovery)
	| { ok: false; kind: "transaction_upstream_check_failed"; error: string }
	| { ok: false; kind: "pushed_head_refusal"; upstream: string }
	| ({
			ok: false;
			kind: "branch_reset_failed";
			backupBranch: string;
			branchName: string;
			resetError: string;
	  } & CreatedBranchRecovery)
	| ({
			ok: false;
			kind: "head_verify_failed";
			backupBranch: string;
			branchName: string;
			actualHead: string;
	  } & CreatedBranchRecovery);

export interface LatestCommitTransactionInput {
	cwd: string;
	plan: LatestCommitAutobranchPlan;
	exec: (command: string, args: string[], timeout: number) => Promise<CommandResult>;
	now?: (() => number) | undefined;
}

export async function runLatestCommitAutobranchTransaction(
	input: LatestCommitTransactionInput,
): Promise<LatestCommitTransactionResult> {
	const upstream = await inspectUpstreamHeadState(input);
	if (upstream.type === "failed") {
		return { ok: false, kind: "transaction_upstream_check_failed", error: upstream.error };
	}
	if (upstream.type === "upstream_contains_head") {
		return { ok: false, kind: "pushed_head_refusal", upstream: upstream.upstream };
	}

	const backupBranch = await chooseAvailableBackupBranchName(
		input,
		input.plan.sourceBranch,
		input.now?.() ?? Date.now(),
	);
	if (!backupBranch.ok) {
		return {
			ok: false,
			kind: "backup_branch_name_unavailable",
			sourceBranch: input.plan.sourceBranch,
		};
	}

	const backupCreated = await input.exec(
		"git",
		["branch", backupBranch.name, input.plan.originalHeadSha],
		GIT_TIMEOUT_MS,
	);
	if (backupCreated.code !== 0) {
		return {
			ok: false,
			kind: "backup_create_failed",
			error: formatAutobranchCommandDetails(backupCreated),
		};
	}

	const resetSource = await resetSourceBranchToParent(input);
	if (!resetSource.ok) {
		return {
			ok: false,
			kind: "source_reset_failed",
			backupBranch: backupBranch.name,
			error: resetSource.error,
			...(await recoverFromSourceResetFailure(input, backupBranch.name)),
		};
	}

	const created = await input.exec(
		"gt",
		["create", input.plan.branchName, "--no-interactive", "--no-ai"],
		GT_TIMEOUT_MS,
	);
	if (created.code !== 0) {
		const recovery = await restoreSourceAndDeleteCreatedBranch(input);
		return {
			ok: false,
			kind: "graphite_create_failed",
			backupBranch: backupBranch.name,
			branchName: input.plan.branchName,
			createError: formatAutobranchCommandDetails(created),
			...recovery,
		};
	}

	const resetBranch = await input.exec(
		"git",
		["reset", "--hard", input.plan.originalHeadSha],
		GIT_TIMEOUT_MS,
	);
	if (resetBranch.code !== 0) {
		const recovery = await restoreSourceAndDeleteCreatedBranch(input);
		return {
			ok: false,
			kind: "branch_reset_failed",
			backupBranch: backupBranch.name,
			branchName: input.plan.branchName,
			resetError: formatAutobranchCommandDetails(resetBranch),
			...recovery,
		};
	}

	const verified = await input.exec("git", ["rev-parse", "HEAD"], GIT_TIMEOUT_MS);
	const actualHead = verified.stdout.trim();
	if (verified.code !== 0 || actualHead !== input.plan.originalHeadSha) {
		const recovery = await restoreSourceAndDeleteCreatedBranch(input);
		return {
			ok: false,
			kind: "head_verify_failed",
			backupBranch: backupBranch.name,
			branchName: input.plan.branchName,
			actualHead: actualHead.length > 0 ? actualHead : formatAutobranchCommandDetails(verified),
			...recovery,
		};
	}

	const deleted = await input.exec("git", ["branch", "-D", backupBranch.name], GIT_TIMEOUT_MS);
	if (deleted.code !== 0) {
		return {
			ok: true,
			commitSummary: input.plan.commitSummary,
			backupDeleted: false,
			backupBranch: backupBranch.name,
			backupDeleteError: formatAutobranchCommandDetails(deleted),
		};
	}
	return { ok: true, commitSummary: input.plan.commitSummary, backupDeleted: true };
}

async function resetSourceBranchToParent(
	input: LatestCommitTransactionInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
	const currentBranch = await input.exec("git", ["branch", "--show-current"], GIT_TIMEOUT_MS);
	if (currentBranch.code !== 0) {
		return { ok: false, error: formatAutobranchCommandDetails(currentBranch) };
	}
	if (currentBranch.stdout.trim() !== input.plan.sourceBranch) {
		return {
			ok: false,
			error: `Expected to be on ${input.plan.sourceBranch}, but current branch is ${currentBranch.stdout.trim().length > 0 ? currentBranch.stdout.trim() : "(detached)"}.`,
		};
	}

	const currentHead = await input.exec("git", ["rev-parse", "HEAD"], GIT_TIMEOUT_MS);
	if (currentHead.code !== 0) {
		return { ok: false, error: formatAutobranchCommandDetails(currentHead) };
	}
	if (currentHead.stdout.trim() !== input.plan.originalHeadSha) {
		return {
			ok: false,
			error: `Expected HEAD ${input.plan.originalHeadSha}, but found ${currentHead.stdout.trim()}.`,
		};
	}

	const reset = await input.exec("git", ["reset", "--hard", input.plan.parentSha], GIT_TIMEOUT_MS);
	if (reset.code !== 0) {
		return { ok: false, error: formatAutobranchCommandDetails(reset) };
	}
	return { ok: true };
}

async function recoverFromSourceResetFailure(
	input: LatestCommitTransactionInput,
	backupBranch: string,
): Promise<SourceResetFailureRecovery> {
	const [currentBranch, currentHead] = await Promise.all([
		input.exec("git", ["branch", "--show-current"], GIT_TIMEOUT_MS),
		input.exec("git", ["rev-parse", "HEAD"], GIT_TIMEOUT_MS),
	]);
	const isSourceUnchanged =
		currentBranch.code === 0 &&
		currentHead.code === 0 &&
		currentBranch.stdout.trim() === input.plan.sourceBranch &&
		currentHead.stdout.trim() === input.plan.originalHeadSha;
	if (isSourceUnchanged) {
		const deleted = await input.exec("git", ["branch", "-D", backupBranch], GIT_TIMEOUT_MS);
		if (deleted.code === 0) {
			return { backupCleanup: "deleted" };
		}
		return {
			backupCleanup: "delete_failed",
			backupDeleteError: formatAutobranchCommandDetails(deleted),
		};
	}

	return {
		backupCleanup: "recovery_required",
		recoveryCommand: `git checkout ${input.plan.sourceBranch} && git reset --hard ${backupBranch}`,
	};
}

async function restoreSourceBranch(
	input: LatestCommitTransactionInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
	const checkedOut = await input.exec("git", ["checkout", input.plan.sourceBranch], GIT_TIMEOUT_MS);
	if (checkedOut.code !== 0) {
		return { ok: false, error: formatAutobranchCommandDetails(checkedOut) };
	}
	const restored = await input.exec(
		"git",
		["reset", "--hard", input.plan.originalHeadSha],
		GIT_TIMEOUT_MS,
	);
	if (restored.code !== 0) {
		return { ok: false, error: formatAutobranchCommandDetails(restored) };
	}
	return { ok: true };
}

async function restoreSourceAndDeleteCreatedBranch(
	input: LatestCommitTransactionInput,
): Promise<CreatedBranchRecovery> {
	const restored = await restoreSourceBranch(input);
	if (!restored.ok) {
		return {
			restored: false,
			restoreError: restored.error,
			createdBranchDeleted: false,
			createdBranchDeleteError: `Skipped deleting incomplete branch ${input.plan.branchName} because source branch restoration failed.`,
		};
	}

	const deleted = await input.exec("git", ["branch", "-D", input.plan.branchName], GIT_TIMEOUT_MS);
	if (deleted.code !== 0) {
		return {
			restored: true,
			createdBranchDeleted: false,
			createdBranchDeleteError: formatAutobranchCommandDetails(deleted),
		};
	}
	return { restored: true, createdBranchDeleted: true };
}

async function chooseAvailableBackupBranchName(
	input: LatestCommitTransactionInput,
	sourceBranch: string,
	timestamp: number,
): Promise<{ ok: true; name: string } | { ok: false }> {
	const normalizedSource = sourceBranch
		.split("/")
		.map((segment) => sanitizeBackupBranchSegment(segment))
		.filter((segment) => segment.length > 0)
		.join("/");
	const sanitizedSource = normalizedSource.length > 0 ? normalizedSource : "branch";
	const base = `autobranch-backup/${sanitizedSource}/${timestamp}`;
	const available = await findAvailableBranchName(
		input,
		branchNameCandidates((_, suffix) => `${base}${suffix}`),
	);
	if (!available) {
		return { ok: false };
	}
	return { ok: true, name: available.name };
}

function sanitizeBackupBranchSegment(value: string): string {
	const withoutPlanSuffix = normalizeBranchSlugText(value)
		.replace(/(?:-plan)+$/g, "")
		.replace(/-+$/g, "");
	return withoutPlanSuffix
		.slice(0, MAX_BACKUP_SEGMENT_CHARS)
		.replace(/(?:-plan)+$/g, "")
		.replace(/-+$/g, "");
}
