import { formatCommandDetails } from "@nseng-ai/foundation/exec";

import type { CommandResult } from "./command-result.ts";

const GIT_FACT_TIMEOUT_MS = 30_000;

export type WorktreeCommandResult = CommandResult;

export type ExecGit = (args: string[], timeout: number) => Promise<WorktreeCommandResult>;

export interface PendingWorktreeSnapshot {
	root: string;
	branch: string;
	status: string;
	diff: string;
	clean: boolean;
}

export type PendingWorktreeError =
	| { kind: "not_git_repo"; message: string; result: WorktreeCommandResult }
	| { kind: "detached_head"; message: string; result: WorktreeCommandResult }
	| { kind: "status_failed"; message: string; result: WorktreeCommandResult }
	| { kind: "diff_failed"; message: string; result: WorktreeCommandResult };

export type GitRepoRootResult =
	| { type: "found"; root: string }
	| { type: "missing"; result: WorktreeCommandResult };

export async function resolveGitRepoRoot(input: {
	execGit: ExecGit;
	timeoutMs?: number;
}): Promise<GitRepoRootResult> {
	const result = await input.execGit(
		["rev-parse", "--show-toplevel"],
		input.timeoutMs ?? GIT_FACT_TIMEOUT_MS,
	);
	const root = result.stdout.trim();
	if (result.code !== 0 || root === "") return { type: "missing", result };
	return { type: "found", root };
}

export async function loadPendingWorktreeSnapshot(input: {
	cwd: string;
	execGit: ExecGit;
	repoRoot?: string;
}): Promise<
	{ ok: true; snapshot: PendingWorktreeSnapshot } | { ok: false; error: PendingWorktreeError }
> {
	let root = input.repoRoot;
	if (root === undefined) {
		const rootResult = await resolveGitRepoRoot({ execGit: input.execGit });
		if (rootResult.type === "missing") {
			return {
				ok: false,
				error: {
					kind: "not_git_repo",
					message: "Not inside a git repository.",
					result: rootResult.result,
				},
			};
		}
		root = rootResult.root;
	}

	const branch = await input.execGit(["symbolic-ref", "--short", "HEAD"], GIT_FACT_TIMEOUT_MS);
	if (branch.code !== 0) {
		return {
			ok: false,
			error: { kind: "detached_head", message: "Detached HEAD.", result: branch },
		};
	}

	const status = await input.execGit(["status", "--porcelain=v1"], GIT_FACT_TIMEOUT_MS);
	if (status.code !== 0) {
		return {
			ok: false,
			error: { kind: "status_failed", message: "Could not read git status.", result: status },
		};
	}

	const diff = await input.execGit(["diff", "HEAD", "--no-ext-diff"], GIT_FACT_TIMEOUT_MS);
	if (diff.code !== 0) {
		return {
			ok: false,
			error: { kind: "diff_failed", message: "Could not read git diff.", result: diff },
		};
	}

	return {
		ok: true,
		snapshot: {
			root,
			branch: branch.stdout.trim(),
			status: status.stdout,
			diff: diff.stdout,
			clean: status.stdout.trim().length === 0,
		},
	};
}

export function formatPendingWorktreeCommandDetails(result: WorktreeCommandResult): string {
	return formatCommandDetails({ ...result, killed: result.killed ?? false });
}
