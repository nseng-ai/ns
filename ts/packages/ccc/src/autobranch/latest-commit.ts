import type { CommandResult } from "asdl-dev/checkpoint-flow";
import type { PendingWorktreeSnapshot } from "asdl-dev/pending-worktree";

import type { AutobranchFlowResult } from "./flow.ts";
import { formatLatestCommitPreparationFailure, formatLatestCommitTransactionFailure } from "./latest-commit-formatting.ts";
import { prepareLatestCommitAutobranchPlan } from "./latest-commit-preparation.ts";
import { runLatestCommitAutobranchTransaction } from "./latest-commit-transaction.ts";
import type { ParsedAutobranchArgs } from "./preparation.ts";
import { shortSha } from "./short-sha.ts";

const GIT_TIMEOUT_MS = 30_000;

type NoticeLevel = "info" | "warning" | "error" | "success";

export interface LatestCommitAutobranchInput {
	cwd: string;
	args: ParsedAutobranchArgs;
	snapshot: PendingWorktreeSnapshot;
	exec: (command: string, args: string[], cwd: string, timeout: number) => Promise<CommandResult>;
	notify: (message: string, level: NoticeLevel) => void;
	setStatus: (message: string | undefined) => void;
	now?: (() => number) | undefined;
}

export async function createLatestCommitAutobranchFlow(input: LatestCommitAutobranchInput): Promise<AutobranchFlowResult> {
	const prepared = await prepareLatestCommitAutobranchPlan(input);
	if (!prepared.ok) {
		input.notify(formatLatestCommitPreparationFailure(prepared), "error");
		return { ok: false };
	}

	const transaction = await runLatestCommitAutobranchTransaction({
		cwd: input.cwd,
		plan: prepared.plan,
		exec: input.exec,
		setStatus: input.setStatus,
		now: input.now,
	});
	if (!transaction.ok) {
		input.notify(formatLatestCommitTransactionFailure(transaction), "error");
		return { ok: false };
	}

	const cleanliness = await input.exec("git", ["status", "--porcelain=v1"], input.cwd, GIT_TIMEOUT_MS);
	const isClean = cleanliness.code === 0 && cleanliness.stdout.trim().length === 0;
	const suffix = prepared.plan.hasSuffix ? ` (base slug ${prepared.plan.baseSlug} was unavailable)` : "";
	const lines = [
		`New branch: ${prepared.plan.branchName}${suffix}`,
		`Moved commit: ${transaction.commitSummary}`,
		`Source branch ${prepared.plan.sourceBranch} reset to ${shortSha(prepared.plan.parentSha)}.`,
		isClean ? "Working directory is clean." : "Warning: working directory is not clean after latest-commit autobranch.",
	];
	if (!transaction.backupDeleted) {
		lines.push(`Warning: recovery branch ${transaction.backupBranch} could not be deleted: ${transaction.backupDeleteError}`);
	}
	input.notify(lines.join("\n"), isClean && transaction.backupDeleted ? "success" : "warning");

	return {
		ok: true,
		branchName: prepared.plan.branchName,
		isCleanAfter: isClean,
	};
}
