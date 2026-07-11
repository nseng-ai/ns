import { commandSucceeded } from "@nseng-ai/foundation/command";
import type { AutobranchExec } from "./shared.ts";
import type { AutobranchGitGateway } from "./git-gateway.ts";
import type { AutobranchFlowOutcome } from "./flow-result.ts";
import {
	defineFailureCatalog,
	formatFailureCatalogEntry,
} from "../phase-stream/failure-catalog.ts";
import { branchNameCandidates, findAvailableBranchName } from "./branch-name.ts";
import { formatAutobranchCommandDetails } from "./shared.ts";
import { inspectUpstreamHeadState } from "./upstream.ts";
import { normalizeBranchSlugText } from "@nseng-ai/foundation/branch-slug";
import type { LatestCommitAutobranchPlan } from "./latest-commit-preparation.ts";

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
	exec: AutobranchExec;
	git: AutobranchGitGateway;
	now?: () => number;
}

type LatestCommitTransactionFailure = Extract<LatestCommitTransactionResult, { ok: false }>;

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

	const backupCreated = await input.git.createBranchAt(
		backupBranch.name,
		input.plan.originalHeadSha,
	);
	if (!backupCreated.ok) {
		return {
			ok: false,
			kind: "backup_create_failed",
			error: backupCreated.details,
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
	if (!commandSucceeded(created)) {
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

	const resetBranch = await input.git.resetHardTo(input.plan.originalHeadSha);
	if (!resetBranch.ok) {
		const recovery = await restoreSourceAndDeleteCreatedBranch(input);
		return {
			ok: false,
			kind: "branch_reset_failed",
			backupBranch: backupBranch.name,
			branchName: input.plan.branchName,
			resetError: resetBranch.details,
			...recovery,
		};
	}

	const verified = await input.git.headSha();
	if (!verified.ok) {
		return await headVerifyFailed(input, backupBranch.name, verified.details);
	}
	if (verified.value !== input.plan.originalHeadSha) {
		return await headVerifyFailed(input, backupBranch.name, verified.value);
	}

	const deleted = await input.git.deleteBranch(backupBranch.name);
	if (!deleted.ok) {
		return {
			ok: true,
			commitSummary: input.plan.commitSummary,
			backupDeleted: false,
			backupBranch: backupBranch.name,
			backupDeleteError: deleted.details,
		};
	}
	return { ok: true, commitSummary: input.plan.commitSummary, backupDeleted: true };
}

async function resetSourceBranchToParent(
	input: LatestCommitTransactionInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
	const currentBranch = await input.git.currentBranch();
	if (!currentBranch.ok) {
		return { ok: false, error: currentBranch.details };
	}
	if (currentBranch.value !== input.plan.sourceBranch) {
		return {
			ok: false,
			error: `Expected to be on ${input.plan.sourceBranch}, but current branch is ${currentBranch.value.length > 0 ? currentBranch.value : "(detached)"}.`,
		};
	}

	const currentHead = await input.git.headSha();
	if (!currentHead.ok) {
		return { ok: false, error: currentHead.details };
	}
	if (currentHead.value !== input.plan.originalHeadSha) {
		return {
			ok: false,
			error: `Expected HEAD ${input.plan.originalHeadSha}, but found ${currentHead.value}.`,
		};
	}

	const reset = await input.git.resetHardTo(input.plan.parentSha);
	if (!reset.ok) {
		return { ok: false, error: reset.details };
	}
	return { ok: true };
}

async function recoverFromSourceResetFailure(
	input: LatestCommitTransactionInput,
	backupBranch: string,
): Promise<SourceResetFailureRecovery> {
	const [currentBranch, currentHead] = await Promise.all([
		input.git.currentBranch(),
		input.git.headSha(),
	]);
	const isSourceUnchanged =
		currentBranch.ok &&
		currentHead.ok &&
		currentBranch.value === input.plan.sourceBranch &&
		currentHead.value === input.plan.originalHeadSha;
	if (isSourceUnchanged) {
		const deleted = await input.git.deleteBranch(backupBranch);
		if (deleted.ok) {
			return { backupCleanup: "deleted" };
		}
		return {
			backupCleanup: "delete_failed",
			backupDeleteError: deleted.details,
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
	const checkedOut = await input.git.checkout(input.plan.sourceBranch);
	if (!checkedOut.ok) {
		return { ok: false, error: checkedOut.details };
	}
	const restored = await input.git.resetHardTo(input.plan.originalHeadSha);
	if (!restored.ok) {
		return { ok: false, error: restored.details };
	}
	return { ok: true };
}

async function headVerifyFailed(
	input: LatestCommitTransactionInput,
	backupBranch: string,
	actualHead: string,
): Promise<Extract<LatestCommitTransactionResult, { ok: false; kind: "head_verify_failed" }>> {
	const recovery = await restoreSourceAndDeleteCreatedBranch(input);
	return {
		ok: false,
		kind: "head_verify_failed",
		backupBranch,
		branchName: input.plan.branchName,
		actualHead,
		...recovery,
	};
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

	const deleted = await input.git.deleteBranch(input.plan.branchName);
	if (!deleted.ok) {
		return {
			restored: true,
			createdBranchDeleted: false,
			createdBranchDeleteError: deleted.details,
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

/**
 * Only the pre-mutation pushed-HEAD re-check is a declined guardrail; every other transaction
 * failure happened while (or after) mutating refs and is a real failure carrying recovery guidance.
 */
const latestCommitTransactionFailureCatalog = defineFailureCatalog<
	LatestCommitTransactionFailure,
	AutobranchFlowOutcome,
	undefined
>()({
	backup_branch_name_unavailable: {
		verdict: "failure",
		message: (failure) =>
			`Could not find an available recovery branch name for ${failure.sourceBranch}; refusing to move latest commit.`,
	},
	backup_create_failed: {
		verdict: "failure",
		message: (failure) =>
			["Failed to create recovery branch before moving latest commit.", failure.error].join("\n"),
	},
	source_reset_failed: {
		verdict: "failure",
		message: (failure) =>
			[
				"Failed to reset source branch before Graphite branch creation.",
				`Recovery branch: ${failure.backupBranch}`,
				failure.error,
				formatSourceResetCleanup(failure),
			].join("\n"),
	},
	graphite_create_failed: {
		verdict: "failure",
		message: (failure) =>
			[
				"Failed to create Graphite branch after resetting source branch.",
				`Recovery branch: ${failure.backupBranch}`,
				failure.createError,
				failure.restored
					? "Restored source branch to the original HEAD."
					: `Could not restore source branch: ${failure.restoreError}`,
				formatCreatedBranchCleanup(failure),
			].join("\n"),
	},
	transaction_upstream_check_failed: {
		verdict: "failure",
		message: (failure) =>
			`Could not re-check whether HEAD is already in the current branch upstream before moving the latest commit.\n${failure.error}`,
	},
	pushed_head_refusal: {
		verdict: "refusal",
		message: (failure) =>
			`Refusing to move latest commit because upstream ${failure.upstream} now contains HEAD.`,
	},
	branch_reset_failed: {
		verdict: "failure",
		message: (failure) =>
			[
				`Created Graphite branch ${failure.branchName}, but failed to move it to the original commit.`,
				`Recovery branch: ${failure.backupBranch}`,
				failure.resetError,
				failure.restored
					? "Restored source branch to the original HEAD."
					: `Could not restore source branch: ${failure.restoreError}`,
				formatCreatedBranchCleanup(failure),
			].join("\n"),
	},
	head_verify_failed: {
		verdict: "failure",
		message: (failure) =>
			[
				`Created Graphite branch ${failure.branchName}, but HEAD verification failed after moving it.`,
				`Expected original commit, found: ${failure.actualHead}`,
				`Recovery branch: ${failure.backupBranch}`,
				failure.restored
					? "Restored source branch to the original HEAD."
					: `Could not restore source branch: ${failure.restoreError}`,
				formatCreatedBranchCleanup(failure),
			].join("\n"),
	},
});

export function classifyLatestCommitTransactionFailure(
	result: LatestCommitTransactionFailure,
): AutobranchFlowOutcome {
	return latestCommitTransactionFailureCatalog[result.kind].verdict;
}

export function formatLatestCommitTransactionFailure(
	result: LatestCommitTransactionFailure,
): string {
	return formatFailureCatalogEntry(latestCommitTransactionFailureCatalog, result, undefined);
}

function formatSourceResetCleanup(result: SourceResetFailureRecovery): string {
	switch (result.backupCleanup) {
		case "deleted":
			return "Deleted redundant recovery branch because the source branch is still at the original commit.";
		case "delete_failed":
			return `Could not delete redundant recovery branch: ${result.backupDeleteError}`;
		case "recovery_required":
			return `To restore the source branch to the saved commit, run: ${result.recoveryCommand}`;
	}
}

function formatCreatedBranchCleanup(
	result: CreatedBranchRecovery & { branchName: string },
): string {
	if (result.createdBranchDeleted) {
		return `Deleted incomplete branch ${result.branchName}.`;
	}
	return `Could not delete incomplete branch ${result.branchName}: ${result.createdBranchDeleteError}`;
}
