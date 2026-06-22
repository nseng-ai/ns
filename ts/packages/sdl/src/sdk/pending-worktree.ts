import {
	formatPendingWorktreeCommandDetails,
	loadPendingWorktreeSnapshot,
	type PendingWorktreeError,
	type WorktreeCommandResult,
} from "../pending-worktree.ts";
import type { SdlExtensionApi } from "./execution.ts";

export interface SdkPendingWorktreeSnapshot {
	readonly root: string;
	readonly branch: string;
	readonly status: string;
	readonly diff: string;
	readonly isClean: boolean;
}

export type SdkPendingWorktreeError =
	| { readonly kind: "not_git_repo"; readonly result: WorktreeCommandResult }
	| { readonly kind: "detached_head"; readonly result: WorktreeCommandResult }
	| { readonly kind: "status_failed"; readonly result: WorktreeCommandResult }
	| { readonly kind: "diff_failed"; readonly result: WorktreeCommandResult };

export type SdkWorktreeCommandResult = WorktreeCommandResult;

export type SdkPendingWorktreeLoadResult =
	| { readonly ok: true; readonly snapshot: SdkPendingWorktreeSnapshot }
	| { readonly ok: false; readonly error: SdkPendingWorktreeError };

export const pendingWorktree = {
	loadSnapshot,
	formatError,
	formatCommandDetails,
};

async function loadSnapshot(ctx: SdlExtensionApi): Promise<SdkPendingWorktreeLoadResult> {
	const loaded = await loadPendingWorktreeSnapshot({
		cwd: ctx.cwd,
		execGit: async (args, timeoutMs) => await ctx.exec("git", [...args], { timeoutMs }),
	});

	if (!loaded.ok) {
		return { ok: false, error: mapPendingWorktreeError(loaded.error) };
	}

	return {
		ok: true,
		snapshot: {
			root: loaded.snapshot.root,
			branch: loaded.snapshot.branch,
			status: loaded.snapshot.status,
			diff: loaded.snapshot.diff,
			isClean: loaded.snapshot.clean,
		},
	};
}

function mapPendingWorktreeError(error: PendingWorktreeError): SdkPendingWorktreeError {
	return { kind: error.kind, result: error.result };
}

function formatError(error: SdkPendingWorktreeError): string {
	const details = formatCommandDetails(error.result);
	switch (error.kind) {
		case "not_git_repo":
			return `Not inside a git repository.\n${details}`;
		case "detached_head":
			return `Could not determine current branch.\n${details}`;
		case "status_failed":
			return `Could not inspect git status.\n${details}`;
		case "diff_failed":
			return `Could not capture git diff.\n${details}`;
	}
}

function formatCommandDetails(result: SdkWorktreeCommandResult): string {
	return formatPendingWorktreeCommandDetails(result);
}
