const GIT_FACT_TIMEOUT_MS = 30_000;

export interface WorktreeCommandResult {
	code: number;
	stdout: string;
	stderr: string;
	killed?: boolean;
}

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

export async function loadPendingWorktreeSnapshot(input: {
	cwd: string;
	execGit: ExecGit;
}): Promise<
	{ ok: true; snapshot: PendingWorktreeSnapshot } | { ok: false; error: PendingWorktreeError }
> {
	const root = await input.execGit(["rev-parse", "--show-toplevel"], GIT_FACT_TIMEOUT_MS);
	if (root.code !== 0) {
		return {
			ok: false,
			error: { kind: "not_git_repo", message: "Not inside a git repository.", result: root },
		};
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
			root: root.stdout.trim(),
			branch: branch.stdout.trim(),
			status: status.stdout,
			diff: diff.stdout,
			clean: status.stdout.trim().length === 0,
		},
	};
}

export function formatPendingWorktreeCommandDetails(result: WorktreeCommandResult): string {
	const details = result.stderr.trim() || result.stdout.trim();
	const killed = result.killed ? " (killed or timed out)" : "";
	return details ? `exit ${result.code}${killed}: ${details}` : `exit ${result.code}${killed}`;
}
