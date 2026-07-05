import {
	formatPendingWorktreeCommandDetails,
	type PendingWorktreeError,
} from "@nseng-ai/capability-kit/pending-worktree";

export function formatPendingWorktreeError(error: PendingWorktreeError): string {
	const details = formatPendingWorktreeCommandDetails(error.result);
	if (error.kind === "not_git_repo") {
		return `Not inside a git repository.\n${details}`;
	}
	if (error.kind === "detached_head") {
		return `Could not determine current branch.\n${details}`;
	}
	if (error.kind === "status_failed") {
		return `Could not inspect git status.\n${details}`;
	}
	return `Could not capture git diff.\n${details}`;
}
