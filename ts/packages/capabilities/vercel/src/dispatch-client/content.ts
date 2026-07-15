// Pure content builders for the up-front `ns dispatch prompt` anchor PR.
// Wording is status-aware: the body describes a submitted-not-finished
// run, and the workflow's own reporting later lands the decision log or
// the failure comment.

/** Cap on the PR title's prompt excerpt. */
const ANCHOR_PR_TITLE_PROMPT_MAX_CHARS = 72;

export const DISPATCH_ANCHOR_PR_TITLE_PREFIX = "[dispatch] ";

/** Build the anchor PR title from the prompt's first line. */
export function buildAnchorPrTitle(prompt: string): string {
	const firstLine =
		prompt
			.split("\n")
			.find((line) => line.trim().length > 0)
			?.trim() ?? "";
	const excerpt =
		firstLine.length <= ANCHOR_PR_TITLE_PROMPT_MAX_CHARS
			? firstLine
			: `${firstLine.slice(0, ANCHOR_PR_TITLE_PROMPT_MAX_CHARS - 1).trimEnd()}…`;
	return `${DISPATCH_ANCHOR_PR_TITLE_PREFIX}${excerpt.length === 0 ? "dispatched prompt" : excerpt}`;
}

/**
 * Build the up-front anchor PR body. Status-aware: the run has been
 * created but not submitted when this body is written; the run-id stamp
 * is appended after the trigger call returns, and the workflow later
 * publishes the decision log (success) or the failure comment (failure)
 * onto this same PR.
 */
export function buildAnchorPrBody(options: {
	readonly prompt: string;
	readonly revision: string;
	readonly sourceBranch: string;
}): string {
	return [
		"This pull request anchors a cloud dispatch (`ns dispatch prompt`).",
		"",
		`- **Source branch:** \`${options.sourceBranch}\``,
		`- **Dispatched revision:** \`${options.revision}\``,
		"",
		"## Dispatched prompt",
		"",
		fencePrompt(options.prompt),
		"",
		"When the run completes, the produced commits land on this branch and",
		"the decision log is published into this description. If the run",
		"fails, a failure comment marks this PR failed and it stays open for",
		"triage. The workflow run id is stamped on this description at",
		"submission.",
	].join("\n");
}

/** Fence the prompt, widening the fence when the prompt contains one. */
function fencePrompt(prompt: string): string {
	let fence = "```";
	while (prompt.includes(fence)) fence += "`";
	return `${fence}text\n${prompt}\n${fence}`;
}
