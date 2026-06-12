import type { CommandResult } from "asdl-dev/checkpoint-flow";

import { branchNameCandidates, findAvailableBranchName } from "./branch-name.ts";
import { formatCommandDetails, withStatus } from "./shared.ts";
import { inspectUpstreamHeadState } from "./upstream.ts";
import { normalizeBranchSlugText } from "@asdl/pi-extension-runtime/branch-slug";
import type { LatestCommitAutobranchPlan } from "./latest-commit-preparation.ts";

const GIT_TIMEOUT_MS = 30_000;
const GT_TIMEOUT_MS = 120_000;
const MAX_BACKUP_SEGMENT_CHARS = 32;

export type CreatedBranchRecovery =
	| { restored: true; createdBranchDeleted: true }
	| { restored: true; createdBranchDeleted: false; createdBranchDeleteError: string }
	| { restored: false; restoreError: string; createdBranchDeleted: false; createdBranchDeleteError: string };

export type SourceResetFailureRecovery =
	| { backupCleanup: "deleted" }
	| { backupCleanup: "delete_failed"; backupDeleteError: string }
	| { backupCleanup: "recovery_required"; recoveryCommand: string };

export type LatestCommitTransactionResult =
	| { ok: true; commitSummary: string; backupDeleted: true }
	| { ok: true; commitSummary: string; backupDeleted: false; backupBranch: string; backupDeleteError: string }
	| { ok: false; kind: "backup_branch_name_unavailable"; sourceBranch: string }
	| { ok: false; kind: "backup_create_failed"; error: string }
	| ({ ok: false; kind: "source_reset_failed"; backupBranch: string; error: string } & SourceResetFailureRecovery)
	| ({ ok: false; kind: "graphite_create_failed"; backupBranch: string; branchName: string; createError: string } & CreatedBranchRecovery)
	| { ok: false; kind: "transaction_upstream_check_failed"; error: string }
	| { ok: false; kind: "pushed_head_refusal"; upstream: string }
	| ({ ok: false; kind: "branch_reset_failed"; backupBranch: string; branchName: string; resetError: string } & CreatedBranchRecovery)
	| ({ ok: false; kind: "head_verify_failed"; backupBranch: string; branchName: string; actualHead: string } & CreatedBranchRecovery);

export interface LatestCommitTransactionInput {
	cwd: string;
	plan: LatestCommitAutobranchPlan;
	exec: (command: string, args: string[], cwd: string, timeout: number) => Promise<CommandResult>;
	setStatus: (message: string | undefined) => void;
	now?: (() => number) | undefined;
}

export async function runLatestCommitAutobranchTransaction(input: LatestCommitTransactionInput): Promise<LatestCommitTransactionResult> {
	const upstream = await inspectUpstreamHeadState(input);
	if (upstream.type === "failed") {
		return { ok: false, kind: "transaction_upstream_check_failed", error: upstream.error };
	}
	if (upstream.type === "upstream_contains_head") {
		return { ok: false, kind: "pushed_head_refusal", upstream: upstream.upstream };
	}

	const backupBranch = await chooseAvailableBackupBranchName(input, input.plan.sourceBranch, input.now?.() ?? Date.now());
	if (!backupBranch.ok) {
		return { ok: false, kind: "backup_branch_name_unavailable", sourceBranch: input.plan.sourceBranch };
	}

	const backupCreated = await withStatus(input, "creating recovery branch…", () =>
		input.exec("git", ["branch", backupBranch.name, input.plan.originalHeadSha], input.cwd, GIT_TIMEOUT_MS),
	);
	if (backupCreated.code !== 0) {
		return { ok: false, kind: "backup_create_failed", error: formatCommandDetails(backupCreated) };
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

	const created = await withStatus(input, `creating ${input.plan.branchName}…`, () =>
		input.exec("gt", ["create", input.plan.branchName, "--no-interactive", "--no-ai"], input.cwd, GT_TIMEOUT_MS),
	);
	if (created.code !== 0) {
		const recovery = await restoreSourceAndDeleteCreatedBranch(input);
		return {
			ok: false,
			kind: "graphite_create_failed",
			backupBranch: backupBranch.name,
			branchName: input.plan.branchName,
			createError: formatCommandDetails(created),
			...recovery,
		};
	}

	const resetBranch = await withStatus(input, `moving ${input.plan.branchName} to original commit…`, () =>
		input.exec("git", ["reset", "--hard", input.plan.originalHeadSha], input.cwd, GIT_TIMEOUT_MS),
	);
	if (resetBranch.code !== 0) {
		const recovery = await restoreSourceAndDeleteCreatedBranch(input);
		return {
			ok: false,
			kind: "branch_reset_failed",
			backupBranch: backupBranch.name,
			branchName: input.plan.branchName,
			resetError: formatCommandDetails(resetBranch),
			...recovery,
		};
	}

	const verified = await input.exec("git", ["rev-parse", "HEAD"], input.cwd, GIT_TIMEOUT_MS);
	const actualHead = verified.stdout.trim();
	if (verified.code !== 0 || actualHead !== input.plan.originalHeadSha) {
		const recovery = await restoreSourceAndDeleteCreatedBranch(input);
		return {
			ok: false,
			kind: "head_verify_failed",
			backupBranch: backupBranch.name,
			branchName: input.plan.branchName,
			actualHead: actualHead.length > 0 ? actualHead : formatCommandDetails(verified),
			...recovery,
		};
	}

	const deleted = await withStatus(input, "cleaning up recovery branch…", () => input.exec("git", ["branch", "-D", backupBranch.name], input.cwd, GIT_TIMEOUT_MS));
	if (deleted.code !== 0) {
		return { ok: true, commitSummary: input.plan.commitSummary, backupDeleted: false, backupBranch: backupBranch.name, backupDeleteError: formatCommandDetails(deleted) };
	}
	return { ok: true, commitSummary: input.plan.commitSummary, backupDeleted: true };
}

async function resetSourceBranchToParent(input: LatestCommitTransactionInput): Promise<{ ok: true } | { ok: false; error: string }> {
	const currentBranch = await input.exec("git", ["branch", "--show-current"], input.cwd, GIT_TIMEOUT_MS);
	if (currentBranch.code !== 0) {
		return { ok: false, error: formatCommandDetails(currentBranch) };
	}
	if (currentBranch.stdout.trim() !== input.plan.sourceBranch) {
		return { ok: false, error: `Expected to be on ${input.plan.sourceBranch}, but current branch is ${currentBranch.stdout.trim().length > 0 ? currentBranch.stdout.trim() : "(detached)"}.` };
	}

	const currentHead = await input.exec("git", ["rev-parse", "HEAD"], input.cwd, GIT_TIMEOUT_MS);
	if (currentHead.code !== 0) {
		return { ok: false, error: formatCommandDetails(currentHead) };
	}
	if (currentHead.stdout.trim() !== input.plan.originalHeadSha) {
		return { ok: false, error: `Expected HEAD ${input.plan.originalHeadSha}, but found ${currentHead.stdout.trim()}.` };
	}

	const reset = await withStatus(input, "resetting source branch…", () => input.exec("git", ["reset", "--hard", input.plan.parentSha], input.cwd, GIT_TIMEOUT_MS));
	if (reset.code !== 0) {
		return { ok: false, error: formatCommandDetails(reset) };
	}
	return { ok: true };
}

async function recoverFromSourceResetFailure(input: LatestCommitTransactionInput, backupBranch: string): Promise<SourceResetFailureRecovery> {
	const [currentBranch, currentHead] = await Promise.all([
		input.exec("git", ["branch", "--show-current"], input.cwd, GIT_TIMEOUT_MS),
		input.exec("git", ["rev-parse", "HEAD"], input.cwd, GIT_TIMEOUT_MS),
	]);
	const isSourceUnchanged = currentBranch.code === 0 && currentHead.code === 0 && currentBranch.stdout.trim() === input.plan.sourceBranch && currentHead.stdout.trim() === input.plan.originalHeadSha;
	if (isSourceUnchanged) {
		const deleted = await input.exec("git", ["branch", "-D", backupBranch], input.cwd, GIT_TIMEOUT_MS);
		if (deleted.code === 0) {
			return { backupCleanup: "deleted" };
		}
		return { backupCleanup: "delete_failed", backupDeleteError: formatCommandDetails(deleted) };
	}

	return { backupCleanup: "recovery_required", recoveryCommand: `git checkout ${input.plan.sourceBranch} && git reset --hard ${backupBranch}` };
}

async function restoreSourceBranch(input: LatestCommitTransactionInput): Promise<{ ok: true } | { ok: false; error: string }> {
	const checkedOut = await input.exec("git", ["checkout", input.plan.sourceBranch], input.cwd, GIT_TIMEOUT_MS);
	if (checkedOut.code !== 0) {
		return { ok: false, error: formatCommandDetails(checkedOut) };
	}
	const restored = await input.exec("git", ["reset", "--hard", input.plan.originalHeadSha], input.cwd, GIT_TIMEOUT_MS);
	if (restored.code !== 0) {
		return { ok: false, error: formatCommandDetails(restored) };
	}
	return { ok: true };
}

async function restoreSourceAndDeleteCreatedBranch(input: LatestCommitTransactionInput): Promise<CreatedBranchRecovery> {
	const restored = await restoreSourceBranch(input);
	if (!restored.ok) {
		return {
			restored: false,
			restoreError: restored.error,
			createdBranchDeleted: false,
			createdBranchDeleteError: `Skipped deleting incomplete branch ${input.plan.branchName} because source branch restoration failed.`,
		};
	}

	const deleted = await input.exec("git", ["branch", "-D", input.plan.branchName], input.cwd, GIT_TIMEOUT_MS);
	if (deleted.code !== 0) {
		return {
			restored: true,
			createdBranchDeleted: false,
			createdBranchDeleteError: formatCommandDetails(deleted),
		};
	}
	return { restored: true, createdBranchDeleted: true };
}

async function chooseAvailableBackupBranchName(input: LatestCommitTransactionInput, sourceBranch: string, timestamp: number): Promise<{ ok: true; name: string } | { ok: false }> {
	const normalizedSource = sourceBranch
		.split("/")
		.map((segment) => sanitizeBackupBranchSegment(segment))
		.filter((segment) => segment.length > 0)
		.join("/");
	const sanitizedSource = normalizedSource.length > 0 ? normalizedSource : "branch";
	const base = `autobranch-backup/${sanitizedSource}/${timestamp}`;
	const available = await findAvailableBranchName(input, branchNameCandidates((_, suffix) => `${base}${suffix}`));
	if (!available) {
		return { ok: false };
	}
	return { ok: true, name: available.name };
}

function sanitizeBackupBranchSegment(value: string): string {
	const withoutPlanSuffix = normalizeBranchSlugText(value).replace(/(?:-plan)+$/g, "").replace(/-+$/g, "");
	return withoutPlanSuffix.slice(0, MAX_BACKUP_SEGMENT_CHARS).replace(/(?:-plan)+$/g, "").replace(/-+$/g, "");
}
