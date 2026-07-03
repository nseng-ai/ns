import { shortSha } from "../commit-display/index.ts";
import type { CommandResult, PendingWorktreeSnapshot } from "./shared.ts";
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
	type LatestCommitTransactionInput,
	type LatestCommitTransactionResult,
	type SourceResetFailureRecovery,
} from "./latest-commit-transaction.ts";
export { inspectUpstreamHeadState, type UpstreamHeadState } from "./upstream.ts";

export interface LatestCommitAutobranchInput {
	cwd: string;
	args: ParsedAutobranchArgs;
	snapshot: PendingWorktreeSnapshot;
	exec: (command: string, args: string[], timeout: number) => Promise<CommandResult>;
	onPhase?: (message: string) => void;
	now?: () => number;
}

export async function createLatestCommitAutobranchFlow(
	input: LatestCommitAutobranchInput,
): Promise<AutobranchFlowResult> {
	const prepared = await prepareLatestCommitAutobranchPlan(input);
	if (!prepared.ok) {
		return {
			ok: false,
			outcome: classifyLatestCommitPreparationFailure(prepared),
			error: formatLatestCommitPreparationFailure(prepared),
		};
	}

	input.onPhase?.("Creating Graphite branch from latest commit…");
	const transaction = await runLatestCommitAutobranchTransaction({
		cwd: input.cwd,
		plan: prepared.plan,
		exec: input.exec,
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
	const warnings = transaction.backupDeleted
		? []
		: [
				`Warning: recovery branch ${transaction.backupBranch} could not be deleted: ${transaction.backupDeleteError}`,
			];

	return {
		ok: true,
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
