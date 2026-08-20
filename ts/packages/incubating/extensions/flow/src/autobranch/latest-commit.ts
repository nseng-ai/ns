import { shortSha } from "../commit-display/index.ts";
import type { AutobranchExec, PendingWorktreeSnapshot } from "./shared.ts";
import type { AutobranchGitGateway } from "./git-gateway.ts";
import { createGraphiteAutobranchProvider, type AutobranchProviderGateway } from "./provider.ts";
import type { ParsedAutobranchArgs } from "./dirty-worktree.ts";
import type { AutobranchFlowResult } from "./flow-result.ts";
import {
	classifyLatestCommitPreparationFailure,
	formatLatestCommitPreparationFailure,
	prepareLatestCommitAutobranchPlan,
} from "./latest-commit-preparation.ts";
import {
	LATEST_COMMIT_AUTOBRANCH_WORKTREE_WARNING,
	summarizeAutobranchCompletion,
} from "./completion.ts";
import {
	classifyLatestCommitTransactionFailure,
	formatLatestCommitTransactionFailure,
	runLatestCommitAutobranchTransaction,
} from "./latest-commit-transaction.ts";
import type { ModelSelection } from "@nseng-ai/foundation/model-slug";

export type { CommandResult, PendingWorktreeSnapshot } from "./shared.ts";

export type { AutobranchFlowOutcome } from "./flow-result.ts";
export {
	classifyLatestCommitPreparationFailure,
	formatLatestCommitPreparationFailure,
	loadLatestCommitFacts,
	prepareLatestCommitAutobranchPlan,
	type LatestCommitAutobranchPlan,
	type LatestCommitFactsResult,
	type LatestCommitPreparationInput,
	type LatestCommitPreparationResult,
} from "./latest-commit-preparation.ts";
export {
	classifyLatestCommitTransactionFailure,
	formatLatestCommitTransactionFailure,
	runLatestCommitAutobranchTransaction,
	type CreatedBranchRecovery,
	type LatestCommitRecoveryCheckoutState,
	type LatestCommitRecoveryFacts,
	type LatestCommitRecoveryRefState,
	type LatestCommitTransactionInput,
	type LatestCommitTransactionResult,
	type SourceResetFailureRecovery,
	type SynchronizedUpstreamContext,
} from "./latest-commit-transaction.ts";
export { inspectUpstreamHeadState, type UpstreamHeadState } from "./upstream.ts";

export interface LatestCommitAutobranchInput {
	cwd: string;
	modelSelection: ModelSelection;
	args: ParsedAutobranchArgs;
	snapshot: PendingWorktreeSnapshot;
	exec: AutobranchExec;
	git: AutobranchGitGateway;
	provider?: AutobranchProviderGateway;
	onPhase?: (message: string) => void;
	now?: () => number;
}

export async function createLatestCommitAutobranchFlow(
	input: LatestCommitAutobranchInput,
): Promise<AutobranchFlowResult> {
	const provider =
		input.provider ?? createGraphiteAutobranchProvider({ exec: input.exec, git: input.git });
	const prepared = await prepareLatestCommitAutobranchPlan({ ...input, provider });
	if (!prepared.ok) {
		return {
			ok: false,
			outcome: classifyLatestCommitPreparationFailure(prepared),
			error: formatLatestCommitPreparationFailure(prepared),
		};
	}

	input.onPhase?.(
		provider.id === "graphite"
			? "Creating Graphite branch from latest commit…"
			: "Creating github/gh-stack branch from latest commit…",
	);
	const transaction = await runLatestCommitAutobranchTransaction({
		cwd: input.cwd,
		plan: prepared.plan,
		exec: input.exec,
		git: input.git,
		provider,
		...(input.now ? { now: input.now } : {}),
	});
	if (!transaction.ok) {
		return {
			ok: false,
			outcome: classifyLatestCommitTransactionFailure(transaction),
			error: formatLatestCommitTransactionFailure(transaction),
		};
	}

	const completion = await summarizeAutobranchCompletion({
		exec: input.exec,
		plan: prepared.plan,
		dirtyWarning: LATEST_COMMIT_AUTOBRANCH_WORKTREE_WARNING,
	});
	const warnings = [
		...(transaction.synchronizedUpstream === undefined
			? []
			: [
					provider.id === "graphite"
						? `Warning: upstream ${transaction.synchronizedUpstream.name} is still unchanged at ${shortSha(transaction.synchronizedUpstream.originalHeadSha)} after the local source reset. Run \`ns flow gt submit\` from ${prepared.plan.branchName} to publish the reshaped stack.`
						: `Warning: upstream ${transaction.synchronizedUpstream.name} is still unchanged at ${shortSha(transaction.synchronizedUpstream.originalHeadSha)} after the local source reset. Explicitly publish or reconcile the reshaped stack with github/gh-stack; run \`gh stack submit\` from ${prepared.plan.branchName} when publication is intended.`,
				]),
		...(transaction.backupDeleted
			? []
			: [
					`Warning: recovery branch ${transaction.backupBranch} could not be deleted: ${transaction.backupDeleteError}`,
				]),
	];

	return {
		ok: true,
		branchName: prepared.plan.branchName,
		isClean: completion.isClean,
		summary: [
			`New branch: ${prepared.plan.branchName}${completion.suffix}`,
			`Moved commit: ${transaction.commitSummary}`,
			`Source branch ${prepared.plan.sourceBranch} reset to ${shortSha(prepared.plan.parentSha)}.`,
			completion.cleanlinessLine,
		].join("\n"),
		warnings,
	};
}
