import type { CommandResult } from "asdl-dev/src/checkpoint-flow.ts";
import {
	formatPendingWorktreeCommandDetails,
	loadPendingWorktreeSnapshot,
	type PendingWorktreeError,
	type PendingWorktreeSnapshot,
} from "asdl-dev/src/pending-worktree.ts";
import {
	prepareAutobranchPlan,
	type FileStat,
	type AutobranchPreparationResult,
	type AutobranchPreparationWarning,
	type ParsedAutobranchArgs,
} from "./autobranch-preparation.ts";
import { runAutobranchTransaction, type AutobranchTransactionResult } from "./autobranch-transaction.ts";

export const AUTOBRANCH_COMMAND_NAME = "dev:autobranch";
const GIT_TIMEOUT_MS = 30_000;

export interface AutobranchFlowInput {
	cwd: string;
	args: ParsedAutobranchArgs;
	exec: (command: string, args: string[], cwd: string, timeout: number) => Promise<CommandResult>;
	prepareCheckpointMessage: (snapshot: Pick<PendingWorktreeSnapshot, "status" | "diff">) => Promise<{ ok: true; message: string } | { ok: false; error: string }>;
	commitPreparedCheckpointMessage: (message: string) => Promise<{ summary: string } | { error: string }>;
	notify: (message: string, level: "info" | "warning" | "error" | "success") => void;
	setStatus: (message: string | undefined) => void;
	readFile?: (path: string) => Promise<Uint8Array | string>;
	stat?: (path: string) => Promise<FileStat>;
	now?: () => number;
}

export function parseAutobranchArgs(argsText: string): ParsedAutobranchArgs {
	const parts = argsText.trim().split(/\s+/).filter(Boolean);
	const parsed: ParsedAutobranchArgs = {};
	for (let index = 0; index < parts.length; index += 1) {
		const part = parts[index];
		const next = parts[index + 1];
		if (part === "--slug" && next) {
			parsed.slug = next;
			index += 1;
		} else if (part?.startsWith("--slug=")) {
			const value = part.slice("--slug=".length);
			if (value) {
				parsed.slug = value;
			}
		}
	}
	return parsed;
}

export async function createAutobranchCheckpointFlow(input: AutobranchFlowInput): Promise<void> {
	const loaded = await loadPendingWorktreeSnapshot({
		cwd: input.cwd,
		execGit: (args, timeout) => input.exec("git", args, input.cwd, timeout),
	});
	if (!loaded.ok) {
		input.notify(formatAutobranchSnapshotError(loaded.error), "error");
		return;
	}

	const snapshot = loaded.snapshot;
	if (snapshot.clean) {
		input.notify("Working tree is clean; nothing to move to a new branch.", "warning");
		return;
	}

	const prepared = await prepareAutobranchPlan({
		cwd: input.cwd,
		args: input.args,
		snapshot,
		exec: input.exec,
		prepareCheckpointMessage: input.prepareCheckpointMessage,
		setStatus: input.setStatus,
		...(input.readFile ? { readFile: input.readFile } : {}),
		...(input.stat ? { stat: input.stat } : {}),
	});
	if (!prepared.ok) {
		input.notify(formatAutobranchPreparationFailure(prepared), "error");
		return;
	}

	for (const warning of prepared.warnings) {
		input.notify(formatAutobranchPreparationWarning(warning), "warning");
	}

	const transaction = await runAutobranchTransaction({
		cwd: input.cwd,
		branchName: prepared.plan.branchName,
		checkpointMessage: prepared.plan.checkpointMessage,
		exec: input.exec,
		commitPreparedCheckpointMessage: input.commitPreparedCheckpointMessage,
		setStatus: input.setStatus,
		...(input.now ? { now: input.now } : {}),
	});
	if (!transaction.ok) {
		input.notify(formatAutobranchTransactionFailure(transaction, prepared.plan.branchName), "error");
		return;
	}

	const cleanliness = await input.exec("git", ["status", "--porcelain=v1"], input.cwd, GIT_TIMEOUT_MS);
	const clean = cleanliness.code === 0 && cleanliness.stdout.trim().length === 0;
	const suffix = prepared.plan.usedSuffix ? ` (base slug ${prepared.plan.baseSlug} was unavailable)` : "";

	input.notify(
		[
			`New branch: ${prepared.plan.branchName}${suffix}`,
			`Stacked on: ${snapshot.branch}`,
			`Commit: ${transaction.commitSummary}`,
			clean ? "Working directory is clean." : "Warning: working directory is not clean after checkpoint.",
		].join("\n"),
		clean ? "success" : "warning",
	);
}

function formatAutobranchSnapshotError(error: PendingWorktreeError): string {
	const details = formatPendingWorktreeCommandDetails(error.result);
	if (error.kind === "not_git_repo") {
		return `Not inside a git repository.\n${details}`;
	}
	if (error.kind === "detached_head") {
		return `Detached HEAD; check out a branch before running /${AUTOBRANCH_COMMAND_NAME}.\n${details}`;
	}
	if (error.kind === "status_failed") {
		return `Could not read git status.\n${details}`;
	}
	return `Could not read git diff.\n${details}`;
}

type AutobranchPreparationFailure = Extract<AutobranchPreparationResult, { ok: false }>;

function formatAutobranchPreparationFailure(result: AutobranchPreparationFailure): string {
	if (result.kind === "invalid_requested_slug") {
		return `Invalid branch slug: ${result.requestedSlug}`;
	}
	if (result.kind === "slug_generation_failed") {
		return result.error;
	}
	if (result.kind === "branch_name_unavailable") {
		return `Could not find an available branch name based on ${result.baseSlug}.`;
	}
	return result.error;
}

function formatAutobranchPreparationWarning(warning: AutobranchPreparationWarning): string {
	return `Slug model failed; using fallback branch name ${warning.fallbackSlug}.`;
}

type AutobranchTransactionFailure = Extract<AutobranchTransactionResult, { ok: false }>;

function formatAutobranchTransactionFailure(result: AutobranchTransactionFailure, branchName: string): string {
	if (result.kind === "stash_failed") {
		return [`Failed to stash pending changes before branch creation.`, result.error].join("\n");
	}
	if (result.kind === "stash_ref_missing") {
		return [
			`Stashed pending changes, but could not find the new stash entry for ${result.stashMessage}.`,
			"Inspect `git stash list` before continuing.",
			result.error,
		].join("\n");
	}
	if (result.kind === "graphite_create_failed") {
		return [
			`Failed to create Graphite branch ${branchName}.`,
			result.createError,
			result.restored ? "Restored pending changes to the original branch." : `Could not restore pending changes: ${result.restoreError}`,
		].join("\n");
	}
	if (result.kind === "restore_failed_after_branch_create") {
		return [
			`Created branch ${branchName}, but failed to restore pending changes from the stash.`,
			result.restoreError,
			"Inspect `git stash list` before continuing.",
		].join("\n");
	}
	return `Branch ${branchName} exists, but checkpoint commit failed. Pending changes remain on that branch.\n${result.commitError}`;
}
