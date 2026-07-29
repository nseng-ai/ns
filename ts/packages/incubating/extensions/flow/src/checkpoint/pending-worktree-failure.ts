import type { PendingWorktreeError } from "@nseng-ai/extension-kit/pending-worktree";

export interface PendingWorktreeFailureFacts {
	plainMessage: string;
	gitCommand: string;
	headline: string;
}

export function pendingWorktreeFailureFacts(
	kind: PendingWorktreeError["kind"],
): PendingWorktreeFailureFacts {
	switch (kind) {
		case "not_git_repo":
			return {
				plainMessage: "Not inside a git repository.",
				gitCommand: "git rev-parse --show-toplevel",
				headline: "Not inside a git repository.",
			};
		case "detached_head":
			return {
				plainMessage: "Could not determine current branch.",
				gitCommand: "git symbolic-ref --short HEAD",
				headline: "Could not determine the current branch.",
			};
		case "status_failed":
			return {
				plainMessage: "Could not inspect git status.",
				gitCommand: "git status --porcelain=v1",
				headline: "Could not inspect the worktree status.",
			};
		case "diff_failed":
			return {
				plainMessage: "Could not capture git diff.",
				gitCommand: "git diff HEAD --no-ext-diff",
				headline: "Could not capture the worktree diff.",
			};
	}
}
