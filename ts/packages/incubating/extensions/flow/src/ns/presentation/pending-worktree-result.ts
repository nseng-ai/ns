// Flow-local helper for rendering a failed pending-worktree snapshot probe as a house-style git
// failure block. `ns flow gt autobranch` and `ns flow gt branch-latest-commit` both load the same
// pending-worktree snapshot before running, and each failed git probe (not-a-repo / detached HEAD /
// status / diff) is a real `ExecResult` failure — so the honest reuse is `git-result-block`'s
// `failure` kind, which mines the probe transcript for cause markers (house-style §7.1). This helper
// just maps each probe failure to the command line that ran and a command-labelled headline.
//
// Flow-local by design (the Objective's anti-generalization rule); do not export beyond flow.

import type { Caps } from "@nseng-ai/clinkr";

import { renderGitResultBlock } from "./git-result-block.ts";
import { pendingWorktreeFailureFacts } from "../../checkpoint/pending-worktree-failure.ts";
import type { PendingWorktreeError } from "../worktree.ts";

interface PendingWorktreeFailureInput {
	error: PendingWorktreeError;
	cwd: string;
	/** Command name shown in the headline, e.g. "`ns flow gt autobranch`". */
	commandLabel: string;
}

/** Render a failed pending-worktree snapshot probe as a house-style git failure block. */
export function renderPendingWorktreeFailure(
	caps: Caps,
	input: PendingWorktreeFailureInput,
): string {
	const facts = pendingWorktreeFailureFacts(input.error.kind);
	return renderGitResultBlock(caps, {
		kind: "failure",
		headline: `${facts.headline} ${input.commandLabel} did not run.`,
		command: facts.gitCommand,
		cwd: input.cwd,
		result: input.error.result,
	});
}
