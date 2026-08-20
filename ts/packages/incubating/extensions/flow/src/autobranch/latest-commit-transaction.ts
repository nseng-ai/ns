import type { AutobranchExec } from "./shared.ts";
import type { AutobranchGitGateway } from "./git-gateway.ts";
import { createGraphiteAutobranchProvider, type AutobranchProviderGateway } from "./provider.ts";
import type { AutobranchFlowOutcome } from "./flow-result.ts";
import {
	defineFailureCatalog,
	formatFailureCatalogEntry,
} from "../phase-stream/failure-catalog.ts";
import { branchNameCandidates, findAvailableBranchName } from "./branch-name.ts";
import {
	inspectLatestCommitUpstreamEligibility,
	type GitTrunkResolutionFailure,
} from "./upstream.ts";
import { normalizeBranchSlugText } from "@nseng-ai/foundation/branch-slug";
import type { LatestCommitAutobranchPlan } from "./latest-commit-preparation.ts";

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

export interface SynchronizedUpstreamContext {
	name: string;
	originalHeadSha: string;
}

export type LatestCommitRecoveryRefState =
	| { type: "found"; sha: string }
	| { type: "absent" }
	| { type: "error"; details: string };

export type LatestCommitRecoveryCheckoutState =
	| { type: "branch"; name: string }
	| { type: "detached" }
	| { type: "error"; details: string };

export interface LatestCommitRecoveryFacts {
	current: LatestCommitRecoveryCheckoutState;
	sourceBranch: string;
	expectedSourceSha: string;
	sourceRef: LatestCommitRecoveryRefState;
	childBranch: string;
	expectedChildSha: string;
	childRef: LatestCommitRecoveryRefState;
	backupBranch: string;
	expectedBackupSha: string;
	backupRef: LatestCommitRecoveryRefState;
	provider: "gh-stack";
	initialized: boolean;
	adoptionMutation: "not-attempted" | "absent" | "ambiguous" | "verified";
}

type LatestCommitTransactionSuccess = {
	ok: true;
	commitSummary: string;
	synchronizedUpstream?: SynchronizedUpstreamContext;
} & (
	| { backupDeleted: true }
	| {
			backupDeleted: false;
			backupBranch: string;
			backupDeleteError: string;
	  }
);

export type LatestCommitTransactionResult =
	| LatestCommitTransactionSuccess
	| {
			ok: false;
			kind: "backup_branch_name_unavailable";
			sourceBranch: string;
			initialized?: true;
	  }
	| {
			ok: false;
			kind: "backup_create_failed";
			error: string;
			backupBranch?: string;
			expectedBackupSha?: string;
			initialized?: true;
	  }
	| {
			ok: false;
			kind: "child_precreate_failed";
			branchName: string;
			backupBranch: string;
			error: string;
			initialized?: true;
			recovery: LatestCommitRecoveryFacts;
	  }
	| ({
			ok: false;
			kind: "source_reset_failed";
			backupBranch: string;
			error: string;
			initialized?: true;
			recovery?: LatestCommitRecoveryFacts;
	  } & SourceResetFailureRecovery)
	| {
			ok: false;
			kind: "provider_adoption_failed";
			backupBranch: string;
			branchName: string;
			error: string;
			initialized: boolean;
			mutation: "absent" | "ambiguous";
			recovery?: LatestCommitRecoveryFacts;
	  }
	| ({
			ok: false;
			kind: "graphite_create_failed";
			backupBranch: string;
			branchName: string;
			createError: string;
	  } & CreatedBranchRecovery)
	| { ok: false; kind: "transaction_upstream_check_failed"; error: string }
	| {
			ok: false;
			kind: "transaction_git_trunk_unavailable";
			failure: GitTrunkResolutionFailure;
	  }
	| { ok: false; kind: "remote_ahead_refusal"; upstream: string }
	| { ok: false; kind: "diverged_upstream_refusal"; upstream: string }
	| {
			ok: false;
			kind: "synchronized_trunk_refusal";
			branch: string;
			upstream: string;
			trunk: string;
	  }
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
	provider?: AutobranchProviderGateway;
	now?: () => number;
}

type LatestCommitTransactionFailure = Extract<LatestCommitTransactionResult, { ok: false }>;

export async function runLatestCommitAutobranchTransaction(
	input: LatestCommitTransactionInput,
): Promise<LatestCommitTransactionResult> {
	const provider =
		input.provider ?? createGraphiteAutobranchProvider({ exec: input.exec, git: input.git });
	const providerInput = { ...input, provider };
	if (provider.id === "gh-stack") {
		return runGhStackLatestCommitTransaction(providerInput);
	}
	return runGraphiteLatestCommitTransaction(providerInput);
}

async function runGraphiteLatestCommitTransaction(
	input: LatestCommitTransactionInput & { provider: AutobranchProviderGateway },
): Promise<LatestCommitTransactionResult> {
	const upstream = await inspectLatestCommitUpstreamEligibility(input);
	let synchronizedUpstream: SynchronizedUpstreamContext | undefined;
	switch (upstream.type) {
		case "upstream_check_failed":
			return {
				ok: false,
				kind: "transaction_upstream_check_failed",
				error: upstream.error,
			};
		case "git_trunk_unavailable":
			return {
				ok: false,
				kind: "transaction_git_trunk_unavailable",
				failure: upstream.failure,
			};
		case "remote_ahead_refusal":
			return { ok: false, kind: upstream.type, upstream: upstream.upstream };
		case "diverged_upstream_refusal":
			return { ok: false, kind: upstream.type, upstream: upstream.upstream };
		case "synchronized_trunk_refusal":
			return {
				ok: false,
				kind: upstream.type,
				branch: upstream.branch,
				upstream: upstream.upstream,
				trunk: upstream.trunk,
			};
		case "synchronized":
			synchronizedUpstream = {
				name: upstream.upstream,
				originalHeadSha: input.plan.originalHeadSha,
			};
			break;
		case "eligible":
			break;
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

	const created = await input.provider.addChild({
		sourceBranch: input.plan.sourceBranch,
		childBranch: input.plan.branchName,
		expectedSourceSha: input.plan.parentSha,
		expectedChildSha: input.plan.parentSha,
		initialized: false,
	});
	if (created.type !== "verified") {
		const recovery = await restoreSourceAndDeleteCreatedBranch(input);
		return {
			ok: false,
			kind: "graphite_create_failed",
			backupBranch: backupBranch.name,
			branchName: input.plan.branchName,
			createError: created.error,
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

	const successContext = synchronizedUpstream === undefined ? {} : { synchronizedUpstream };
	const deleted = await input.git.deleteBranch(backupBranch.name);
	if (!deleted.ok) {
		return {
			ok: true,
			commitSummary: input.plan.commitSummary,
			backupDeleted: false,
			backupBranch: backupBranch.name,
			backupDeleteError: deleted.details,
			...successContext,
		};
	}
	return {
		ok: true,
		commitSummary: input.plan.commitSummary,
		backupDeleted: true,
		...successContext,
	};
}

async function runGhStackLatestCommitTransaction(
	input: LatestCommitTransactionInput & { provider: AutobranchProviderGateway },
): Promise<LatestCommitTransactionResult> {
	// Re-check volatile eligibility immediately before the provider's first mutation.
	const upstreamInspection = await inspectTransactionUpstream(input);
	if (upstreamInspection.type === "failed") return upstreamInspection.result;
	const synchronizedUpstream = upstreamInspection.synchronizedUpstream;
	const prepared = await input.provider.prepareSource(input.plan.sourceBranch);
	if (prepared.type === "refused-trunk") {
		return {
			ok: false,
			kind: "synchronized_trunk_refusal",
			branch: prepared.branch,
			upstream: prepared.trunk,
			trunk: prepared.trunk,
		};
	}
	if (prepared.type === "refused-non-top") {
		return {
			ok: false,
			kind: "provider_adoption_failed",
			backupBranch: "(not-created)",
			branchName: input.plan.branchName,
			error: `Source ${prepared.branch} is not top of stack; top is ${prepared.top}.`,
			initialized: false,
			mutation: "absent",
		};
	}
	if (prepared.type === "failed") {
		return {
			ok: false,
			kind: "provider_adoption_failed",
			backupBranch: "(not-created)",
			branchName: input.plan.branchName,
			error: prepared.error,
			initialized: prepared.initialized,
			mutation: prepared.initialized ? "ambiguous" : "absent",
		};
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
			...(prepared.initialized ? { initialized: true as const } : {}),
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
			backupBranch: backupBranch.name,
			expectedBackupSha: input.plan.originalHeadSha,
			...(prepared.initialized ? { initialized: true as const } : {}),
		};
	}
	const childCreated = await input.git.createBranchAt(
		input.plan.branchName,
		input.plan.originalHeadSha,
	);
	if (!childCreated.ok) {
		return {
			ok: false,
			kind: "child_precreate_failed",
			branchName: input.plan.branchName,
			backupBranch: backupBranch.name,
			error: childCreated.details,
			...(prepared.initialized ? { initialized: true as const } : {}),
			recovery: await inspectLatestCommitRecoveryFacts(input, backupBranch.name, {
				initialized: prepared.initialized,
				adoptionMutation: "not-attempted",
			}),
		};
	}

	const resetSource = await resetSourceBranchToParent(input);
	if (!resetSource.ok) {
		return {
			ok: false,
			kind: "source_reset_failed",
			backupBranch: backupBranch.name,
			error: resetSource.error,
			backupCleanup: "recovery_required",
			recoveryCommand: `git checkout ${input.plan.sourceBranch} && git reset --hard ${backupBranch.name}`,
			...(prepared.initialized ? { initialized: true as const } : {}),
			recovery: await inspectLatestCommitRecoveryFacts(input, backupBranch.name, {
				initialized: prepared.initialized,
				adoptionMutation: "not-attempted",
			}),
		};
	}
	const adopted = await input.provider.addChild({
		sourceBranch: input.plan.sourceBranch,
		childBranch: input.plan.branchName,
		expectedSourceSha: input.plan.parentSha,
		expectedChildSha: input.plan.originalHeadSha,
		initialized: prepared.initialized,
	});
	if (adopted.type !== "verified") {
		return {
			ok: false,
			kind: "provider_adoption_failed",
			backupBranch: backupBranch.name,
			branchName: input.plan.branchName,
			error: adopted.error,
			initialized: adopted.initialized,
			mutation: adopted.type,
			recovery: await inspectLatestCommitRecoveryFacts(input, backupBranch.name, {
				initialized: adopted.initialized,
				adoptionMutation: adopted.type,
			}),
		};
	}
	const sourceSha = await input.git.branchSha(input.plan.sourceBranch);
	const current = await input.git.currentBranch();
	const childSha = await input.git.branchSha(input.plan.branchName);
	if (
		sourceSha.type !== "found" ||
		sourceSha.sha !== input.plan.parentSha ||
		!current.ok ||
		current.value.type !== "branch" ||
		current.value.name !== input.plan.branchName ||
		childSha.type !== "found" ||
		childSha.sha !== input.plan.originalHeadSha
	) {
		return {
			ok: false,
			kind: "provider_adoption_failed",
			backupBranch: backupBranch.name,
			branchName: input.plan.branchName,
			error: "Git postcondition verification failed after github/gh-stack adoption.",
			initialized: adopted.initialized,
			mutation: "ambiguous",
			recovery: await inspectLatestCommitRecoveryFacts(input, backupBranch.name, {
				initialized: adopted.initialized,
				adoptionMutation: "verified",
			}),
		};
	}
	const successContext = synchronizedUpstream === undefined ? {} : { synchronizedUpstream };
	const deleted = await input.git.deleteBranch(backupBranch.name);
	return deleted.ok
		? {
				ok: true,
				commitSummary: input.plan.commitSummary,
				backupDeleted: true,
				...successContext,
			}
		: {
				ok: true,
				commitSummary: input.plan.commitSummary,
				backupDeleted: false,
				backupBranch: backupBranch.name,
				backupDeleteError: deleted.details,
				...successContext,
			};
}

async function inspectTransactionUpstream(
	input: LatestCommitTransactionInput,
): Promise<
	| { type: "eligible"; synchronizedUpstream?: SynchronizedUpstreamContext }
	| { type: "failed"; result: LatestCommitTransactionResult }
> {
	const upstream = await inspectLatestCommitUpstreamEligibility(input);
	switch (upstream.type) {
		case "eligible":
			return { type: "eligible" };
		case "synchronized":
			return {
				type: "eligible",
				synchronizedUpstream: {
					name: upstream.upstream,
					originalHeadSha: input.plan.originalHeadSha,
				},
			};
		case "upstream_check_failed":
			return {
				type: "failed",
				result: { ok: false, kind: "transaction_upstream_check_failed", error: upstream.error },
			};
		case "git_trunk_unavailable":
			return {
				type: "failed",
				result: { ok: false, kind: "transaction_git_trunk_unavailable", failure: upstream.failure },
			};
		case "remote_ahead_refusal":
		case "diverged_upstream_refusal":
			return {
				type: "failed",
				result: { ok: false, kind: upstream.type, upstream: upstream.upstream },
			};
		case "synchronized_trunk_refusal":
			return {
				type: "failed",
				result: {
					ok: false,
					kind: upstream.type,
					branch: upstream.branch,
					upstream: upstream.upstream,
					trunk: upstream.trunk,
				},
			};
	}
}

async function inspectLatestCommitRecoveryFacts(
	input: LatestCommitTransactionInput,
	backupBranch: string,
	providerState: Pick<LatestCommitRecoveryFacts, "initialized" | "adoptionMutation">,
): Promise<LatestCommitRecoveryFacts> {
	const [current, sourceRef, childRef, backupRef] = await Promise.all([
		input.git.currentBranch(),
		input.git.branchSha(input.plan.sourceBranch),
		input.git.branchSha(input.plan.branchName),
		input.git.branchSha(backupBranch),
	]);
	return {
		current: current.ok ? current.value : { type: "error", details: current.details },
		sourceBranch: input.plan.sourceBranch,
		expectedSourceSha: input.plan.parentSha,
		sourceRef,
		childBranch: input.plan.branchName,
		expectedChildSha: input.plan.originalHeadSha,
		childRef,
		backupBranch,
		expectedBackupSha: input.plan.originalHeadSha,
		backupRef,
		provider: "gh-stack",
		...providerState,
	};
}

async function resetSourceBranchToParent(
	input: LatestCommitTransactionInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
	const currentBranch = await input.git.currentBranch();
	if (!currentBranch.ok) {
		return { ok: false, error: currentBranch.details };
	}
	if (
		currentBranch.value.type !== "branch" ||
		currentBranch.value.name !== input.plan.sourceBranch
	) {
		return {
			ok: false,
			error: `Expected to be on ${input.plan.sourceBranch}, but current checkout is ${currentBranch.value.type === "branch" ? currentBranch.value.name : "detached"}.`,
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
		currentBranch.value.type === "branch" &&
		currentHead.ok &&
		currentBranch.value.name === input.plan.sourceBranch &&
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
 * Unsafe relationships discovered by the pre-mutation upstream/trunk recheck are declined
 * guardrails; every other transaction failure is a real failure carrying recovery guidance.
 */
const latestCommitTransactionFailureCatalog = defineFailureCatalog<
	LatestCommitTransactionFailure,
	AutobranchFlowOutcome,
	undefined
>()({
	backup_branch_name_unavailable: {
		verdict: "failure",
		message: (failure) =>
			[
				`Could not find an available recovery branch name for ${failure.sourceBranch}; refusing to move latest commit.`,
				formatRetainedInitialization(failure),
			]
				.filter(Boolean)
				.join("\n"),
	},
	backup_create_failed: {
		verdict: "failure",
		message: (failure) =>
			[
				"Failed to create recovery branch before moving latest commit.",
				failure.backupBranch === undefined || failure.expectedBackupSha === undefined
					? ""
					: `Recovery branch creation attempted: ${failure.backupBranch}@${failure.expectedBackupSha}.`,
				failure.error,
				formatRetainedInitialization(failure),
			]
				.filter(Boolean)
				.join("\n"),
	},
	child_precreate_failed: {
		verdict: "failure",
		message: (failure) =>
			[
				`Created recovery branch ${failure.backupBranch}, but failed to pre-create github/gh-stack child ${failure.branchName} at the original commit.`,
				failure.error,
				"Provider adoption was not attempted; inspect the exact observed refs below before recovery.",
				formatLatestCommitRecovery(failure.recovery),
				formatRetainedInitialization(failure),
			].join("\n"),
	},
	source_reset_failed: {
		verdict: "failure",
		message: (failure) =>
			[
				"Failed to reset source branch before provider child creation.",
				`Recovery branch: ${failure.backupBranch}`,
				failure.error,
				formatSourceResetCleanup(failure),
				failure.recovery === undefined ? "" : formatLatestCommitRecovery(failure.recovery),
				formatRetainedInitialization(failure),
			].join("\n"),
	},
	provider_adoption_failed: {
		verdict: "failure",
		message: (failure) =>
			[
				`Could not adopt github/gh-stack child ${failure.branchName}.`,
				failure.error,
				`Recovery branch: ${failure.backupBranch}`,
				failure.initialized ? "github/gh-stack initialization was retained." : "",
				failure.mutation === "ambiguous"
					? "Provider adoption may exist; do not delete only the Git child."
					: "No provider adoption was observed.",
				failure.recovery === undefined ? "" : formatLatestCommitRecovery(failure.recovery),
			]
				.filter(Boolean)
				.join("\n"),
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
			`Could not re-check the local relationship between HEAD and the current branch upstream before moving the latest commit.\n${failure.error}`,
	},
	transaction_git_trunk_unavailable: {
		verdict: "failure",
		message: (failure) => {
			switch (failure.failure.type) {
				case "missing":
					return "Could not re-check the Git trunk from cached `refs/remotes/origin/HEAD` for the synchronized source branch before moving the latest commit. Refresh it with `git remote set-head origin --auto`, or set it explicitly with `git remote set-head origin <branch>`, then retry.";
				case "error":
					return `Could not re-check the Git trunk from cached \`refs/remotes/origin/HEAD\` for the synchronized source branch before moving the latest commit.\n${failure.failure.error}\nRefresh it with \`git remote set-head origin --auto\`, or set it explicitly with \`git remote set-head origin <branch>\`, then retry.`;
			}
		},
	},
	remote_ahead_refusal: {
		verdict: "refusal",
		message: (failure) =>
			`Refusing to move latest commit because locally known upstream ${failure.upstream} is now ahead of HEAD.`,
	},
	diverged_upstream_refusal: {
		verdict: "refusal",
		message: (failure) =>
			`Refusing to move latest commit because HEAD and locally known upstream ${failure.upstream} have now diverged.`,
	},
	synchronized_trunk_refusal: {
		verdict: "refusal",
		message: (failure) =>
			`Refusing to move latest commit because source branch ${failure.branch} is synchronized with Git trunk from cached \`refs/remotes/origin/HEAD\` ${failure.trunk} (upstream ${failure.upstream}).`,
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

function formatRecoveryCheckout(current: LatestCommitRecoveryCheckoutState): string {
	switch (current.type) {
		case "branch":
			return current.name;
		case "detached":
			return "detached";
		case "error":
			return `error (${current.details})`;
	}
}

function formatRecoveryRef(ref: LatestCommitRecoveryRefState): string {
	switch (ref.type) {
		case "found":
			return ref.sha;
		case "absent":
			return "absent";
		case "error":
			return `error (${ref.details})`;
	}
}

function formatLatestCommitRecovery(facts: LatestCommitRecoveryFacts): string {
	return `Latest-commit recovery facts: current=${formatRecoveryCheckout(facts.current)}; source=${facts.sourceBranch}@${facts.expectedSourceSha} (observed ${formatRecoveryRef(facts.sourceRef)}); child=${facts.childBranch}@${facts.expectedChildSha} (observed ${formatRecoveryRef(facts.childRef)}); backup=${facts.backupBranch}@${facts.expectedBackupSha} (observed ${formatRecoveryRef(facts.backupRef)}); provider=${facts.provider}; initialized=${facts.initialized}; adoption=${facts.adoptionMutation}.`;
}

function formatRetainedInitialization(result: { initialized?: true }): string {
	return result.initialized === true ? "github/gh-stack initialization was retained." : "";
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
