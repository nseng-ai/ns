// Flow-local helper for rendering a failed pending-worktree snapshot probe as a house-style git
// failure block. `ji flow autobranch` and `ji flow branch-latest-commit` both load the same
// pending-worktree snapshot before running, and each failed git probe (not-a-repo / detached HEAD /
// status / diff) is a real `ExecResult` failure — so the honest reuse is `git-result-block`'s
// `failure` kind, which mines the probe transcript for cause markers (house-style §7.1). This helper
// just maps each probe failure to the command line that ran and a command-labelled headline.
//
// Flow-local by design (the Objective's anti-generalization rule); do not export beyond flow.

import type { Caps } from "@sdl/clinkr";

import { renderGitResultBlock } from "./git-result-block.ts";
import type { PendingWorktreeError } from "../worktree.ts";

interface PendingWorktreeFailureInput {
	error: PendingWorktreeError;
	cwd: string;
	/** Command name shown in the headline, e.g. "`ji flow autobranch`". */
	commandLabel: string;
}

/** Render a failed pending-worktree snapshot probe as a house-style git failure block. */
export function renderPendingWorktreeFailure(
	caps: Caps,
	input: PendingWorktreeFailureInput,
): string {
	return renderGitResultBlock(caps, {
		kind: "failure",
		headline: pendingWorktreeHeadline(input.error, input.commandLabel),
		command: pendingWorktreeCommand(input.error),
		cwd: input.cwd,
		result: input.error.result,
	});
}

// Map each failed probe to the git command that ran so the failure block names the real step.
function pendingWorktreeCommand(error: PendingWorktreeError): string {
	switch (error.kind) {
		case "not_git_repo":
			return "git rev-parse --show-toplevel";
		case "detached_head":
			return "git symbolic-ref --short HEAD";
		case "status_failed":
			return "git status --porcelain=v1";
		case "diff_failed":
			return "git diff HEAD --no-ext-diff";
	}
}

function pendingWorktreeHeadline(error: PendingWorktreeError, commandLabel: string): string {
	switch (error.kind) {
		case "not_git_repo":
			return `Not inside a git repository. ${commandLabel} did not run.`;
		case "detached_head":
			return `Could not determine the current branch. ${commandLabel} did not run.`;
		case "status_failed":
			return `Could not inspect the worktree status. ${commandLabel} did not run.`;
		case "diff_failed":
			return `Could not capture the worktree diff. ${commandLabel} did not run.`;
	}
}
