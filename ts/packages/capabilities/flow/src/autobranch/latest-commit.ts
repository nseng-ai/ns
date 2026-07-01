import type { CommandResult, PendingWorktreeSnapshot } from "./shared.ts";
import type { AutobranchFlowResult, ParsedAutobranchArgs } from "./dirty-worktree.ts";
import {
	classifyLatestCommitPreparationFailure,
	classifyLatestCommitTransactionFailure,
	formatLatestCommitPreparationFailure,
	formatLatestCommitTransactionFailure,
} from "./latest-commit-formatting.ts";
import {
	LATEST_COMMIT_AUTOBRANCH_WORKTREE_WARNING,
	summarizeAutobranchCompletion,
} from "./completion.ts";
import { prepareLatestCommitAutobranchPlan } from "./latest-commit-preparation.ts";
import { runLatestCommitAutobranchTransaction } from "./latest-commit-transaction.ts";
import { shortSha } from "./short-sha.ts";

export type { CommandResult, PendingWorktreeSnapshot } from "./shared.ts";

export type { AutobranchFlowOutcome } from "./dirty-worktree.ts";
export {
	classifyLatestCommitPreparationFailure,
	classifyLatestCommitTransactionFailure,
	formatLatestCommitPreparationFailure,
	formatLatestCommitTransactionFailure,
} from "./latest-commit-formatting.ts";
export {
	loadLatestCommitFacts,
	prepareLatestCommitAutobranchPlan,
	type LatestCommitAutobranchPlan,
	type LatestCommitFactsResult,
	type LatestCommitPreparationInput,
	type LatestCommitPreparationResult,
} from "./latest-commit-preparation.ts";
export {
	runLatestCommitAutobranchTransaction,
	type CreatedBranchRecovery,
	type LatestCommitTransactionInput,
	type LatestCommitTransactionResult,
	type SourceResetFailureRecovery,
} from "./latest-commit-transaction.ts";
export { inspectUpstreamHeadState, type UpstreamHeadState } from "./upstream.ts";
export { shortSha } from "./short-sha.ts";

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
		summary: [
			`New branch: ${prepared.plan.branchName}${completion.suffix}`,
			`Moved commit: ${transaction.commitSummary}`,
			`Source branch ${prepared.plan.sourceBranch} reset to ${shortSha(prepared.plan.parentSha)}.`,
			completion.cleanlinessLine,
		].join("\n"),
		warnings,
	};
}
