import { commandSucceeded, formatCommandDetails } from "@nseng-ai/foundation/exec";

import type { GitCwdParams, GitOptionalResult } from "./git-contract.ts";
import type { CommandResult } from "./command-result.ts";

const GIT_FACT_TIMEOUT_MS = 30_000;

export type WorktreeCommandResult = CommandResult;

export type ExecGit = (args: string[], timeout: number) => Promise<WorktreeCommandResult>;

type OptionalRepoRootGateway = {
	optionalRepoRoot(params: GitCwdParams): Promise<GitOptionalResult<string>>;
};

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
	git: OptionalRepoRootGateway;
	execGit: ExecGit;
	repoRoot?: string;
}): Promise<
	{ ok: true; snapshot: PendingWorktreeSnapshot } | { ok: false; error: PendingWorktreeError }
> {
	let root = input.repoRoot;
	if (root === undefined) {
		const rootResult = await input.git.optionalRepoRoot({ cwd: input.cwd });
		if (rootResult.type !== "found") {
			return {
				ok: false,
				error: {
					kind: "not_git_repo",
					message: "Not inside a git repository.",
					result: gitRootMissingCommandResult(
						rootResult.type === "error" ? rootResult.error : undefined,
					),
				},
			};
		}
		root = rootResult.value;
	}

	const branch = await input.execGit(["symbolic-ref", "--short", "HEAD"], GIT_FACT_TIMEOUT_MS);
	if (!commandSucceeded(branch)) {
		return {
			ok: false,
			error: { kind: "detached_head", message: "Detached HEAD.", result: branch },
		};
	}

	const status = await input.execGit(["status", "--porcelain=v1"], GIT_FACT_TIMEOUT_MS);
	if (!commandSucceeded(status)) {
		return {
			ok: false,
			error: { kind: "status_failed", message: "Could not read git status.", result: status },
		};
	}

	const diff = await input.execGit(["diff", "HEAD", "--no-ext-diff"], GIT_FACT_TIMEOUT_MS);
	if (!commandSucceeded(diff)) {
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
	return formatCommandDetails(result);
}

function gitRootMissingCommandResult(
	error: { message: string } | undefined,
): WorktreeCommandResult {
	return {
		type: "exited",
		code: 128,
		signal: null,
		stdout: "",
		stderr: error?.message ?? "fatal: not a git repository",
	};
}
